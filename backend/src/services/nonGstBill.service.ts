import mongoose from "mongoose";
import { company } from "../config/company";
import { NonGstBill, type NonGstBillStatus, type PriceList } from "../models/NonGstBill.model";
import { Product } from "../models/Product.model";
import { StockMovement } from "../models/StockMovement.model";
import { ApiError } from "../utils/ApiError";
import { computeStockDeltas } from "../utils/invoiceEdit";
import { computeNonGstTotals, nonGstPriceFor, priceListLabel } from "../utils/nonGstBill";
import { numberToWordsINR } from "../utils/numberToWords";
import { buildOpeningPayment, paymentFilterQuery, summarizePayment, type PaymentFilter } from "../utils/payments";
import { dueSummary } from "./payment.service";
import { escapeRegex } from "../utils/regex";
import * as cartService from "./cart.service";
import { nextDocumentNumber } from "./documentNumber.service";

// Bills with no GST. Everything here is self-contained on purpose: its own
// collection, its own number series, and no calls into the GST invoice,
// credit-note, filing or return code — so a non-GST bill can never end up in a
// GST return, however those evolve. It does move stock, like any sale.

export interface NonGstCustomerInput {
  name: string;
  company?: string;
  address?: string;
  phone?: string;
  email?: string;
}

const cleanCustomer = (customer: NonGstCustomerInput) => ({
  name: customer.name.trim(),
  company: customer.company?.trim() ?? "",
  address: customer.address?.trim() ?? "",
  phone: customer.phone?.trim() ?? "",
  email: customer.email?.trim() ?? "",
});

export async function checkout(userId: string, cartId: string) {
  const cart = await cartService.getCart(userId, cartId);

  if (!cartService.isNonGstCart(cart)) {
    throw ApiError.badRequest("This cart is set to a GST bill — check out with the tax invoice instead");
  }
  if (cart.items.length === 0) throw ApiError.badRequest("Cart is empty");
  if (!cart.customer.name?.trim()) throw ApiError.badRequest("Customer name is required");
  // A bill left entirely on credit (nothing received) needs no payment method yet.
  if (cart.amountReceived !== 0 && !cart.paymentMethod) throw ApiError.badRequest("Payment method is required");

  const customer = cleanCustomer({ ...cart.customer, name: cart.customer.name });
  const priceList = cartService.cartPriceList(cart);

  const session = await mongoose.startSession();
  let billId: mongoose.Types.ObjectId | undefined;

  try {
    await session.withTransaction(async () => {
      // Validate stock and prices for every line first — a failure (the
      // common case) then never burns a bill number.
      const lines = [];
      const products = new Map<string, InstanceType<typeof Product>>();
      for (const item of cart.items) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) throw ApiError.badRequest(`"${item.name}" no longer exists`);
        if (product.quantityInStock < item.quantity) {
          throw ApiError.badRequest(`Not enough stock for "${item.name}" — only ${product.quantityInStock} left`);
        }
        const unitPrice = nonGstPriceFor(product, priceList);
        if (unitPrice === null) {
          throw ApiError.badRequest(`"${product.name}" can't be billed yet — set its ${priceListLabel(priceList)} on the product first.`);
        }
        products.set(item.productId, product);
        lines.push({ product: item.productId, name: product.name, quantity: item.quantity, unitPrice });
      }

      const totals = computeNonGstTotals(lines, cart.otherCharges);

      // What was handed over now (all of it, an advance, or nothing) — checked before a number is issued.
      const opening = buildOpeningPayment({
        total: totals.grandTotal,
        amountReceived: cart.amountReceived,
        method: cart.paymentMethod,
        dueDay: cart.dueDate,
        userId,
      });

      const resultingQuantities = new Map<string, number>();
      for (const item of cart.items) {
        const product = products.get(item.productId)!;
        product.quantityInStock -= item.quantity;
        await product.save({ session });
        resultingQuantities.set(item.productId, product.quantityInStock);
      }

      const billNumber = await nextDocumentNumber("non-gst-bill", company.nonGstBillPrefix);

      const [created] = await NonGstBill.create(
        [
          {
            billNumber,
            billingDate: new Date(),
            customer,
            priceList,
            items: totals.lines,
            otherCharges: totals.otherCharges,
            subtotal: totals.subtotal,
            grandTotal: totals.grandTotal,
            amountInWords: numberToWordsINR(totals.grandTotal),
            payments: opening.payments,
            amountPaid: opening.amountPaid,
            paymentMethod: opening.paymentMethod,
            dueDate: opening.dueDate,
            note: cart.note,
            createdBy: userId,
          },
        ],
        { session },
      );
      if (!created) throw ApiError.badRequest("Failed to create the bill");

      billId = created._id as mongoose.Types.ObjectId;

      await StockMovement.insertMany(
        cart.items.map((item) => ({
          product: item.productId,
          type: "sale",
          quantityChange: -item.quantity,
          resultingQuantity: resultingQuantities.get(item.productId),
          nonGstBill: created._id,
          user: userId,
          note: `Non-GST bill ${billNumber}`,
        })),
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  await cartService.discardCart(userId, cartId);
  return NonGstBill.findById(billId);
}

export async function getBillByNumber(billNumber: string) {
  const bill = await NonGstBill.findOne({ billNumber });
  if (!bill) throw ApiError.notFound(`No bill found for "${billNumber}"`);
  return bill;
}

export interface NonGstBillListFilters {
  search?: string;
  status?: NonGstBillStatus;
  /** Only bills in this payment state (still owing, overdue, settled…). */
  payment?: PaymentFilter;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export async function listBills({ search, status, payment, from, to, page, limit }: NonGstBillListFilters) {
  const query: Record<string, unknown> = {};
  if (status) query.status = status;
  if (payment) Object.assign(query, paymentFilterQuery(payment));
  if (from || to) {
    const billingDate: Record<string, Date> = {};
    if (from) billingDate.$gte = from;
    if (to) billingDate.$lte = to;
    query.billingDate = billingDate;
  }
  if (search?.trim()) {
    const pattern = escapeRegex(search.trim());
    query.$or = [
      { billNumber: { $regex: pattern, $options: "i" } },
      { "customer.name": { $regex: pattern, $options: "i" } },
      { "customer.phone": { $regex: pattern, $options: "i" } },
      { "customer.company": { $regex: pattern, $options: "i" } },
    ];
  }

  const [bills, total, sums] = await Promise.all([
    NonGstBill.find(query)
      .sort({ billingDate: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(
        "billNumber billingDate customer items.quantity priceList grandTotal paymentMethod amountPaid dueDate status whatsappSentAt editedAt cancelledAt cancelReason",
      )
      .lean(),
    NonGstBill.countDocuments(query),
    // What the filtered bills add up to — cancelled ones don't count as sales.
    NonGstBill.aggregate<{ _id: null; amount: number; count: number }>([
      { $match: { ...query, status: "paid" } },
      { $group: { _id: null, amount: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
    ]),
  ]);

  return {
    // Money still to collect across all non-GST bills — not just this page.
    dues: await dueSummary(NonGstBill),
    items: bills.map(({ items, ...bill }) => ({
      ...bill,
      payment: summarizePayment(bill),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    })),
    total,
    page,
    limit,
    totals: { amount: sums[0]?.amount ?? 0, count: sums[0]?.count ?? 0 },
  };
}

export interface UpdateNonGstBillInput {
  customer: NonGstCustomerInput;
  /** Which price list the line prices came from. Left out, the bill keeps its own. */
  priceList?: PriceList;
  items: { product: string; quantity: number; unitPrice: number }[];
  otherCharges: number;
  note?: string;
}

/**
 * Admin correction of a non-GST bill. There's no GST filing to lock it, so it
 * can be edited any time until it's cancelled. Totals are recomputed here, and
 * stock is reconciled for any quantity change in the same transaction: selling
 * more takes units out of stock (refused if there aren't enough), selling fewer
 * or removing a line puts them back. The number and date never change.
 */
export async function updateBill(billNumber: string, userId: string, input: UpdateNonGstBillInput) {
  if (input.items.length === 0) throw ApiError.badRequest("A bill needs at least one item");
  if (new Set(input.items.map((i) => i.product)).size !== input.items.length) {
    throw ApiError.badRequest("Each product can only appear once — combine the quantities into one line");
  }

  const session = await mongoose.startSession();
  let billId: mongoose.Types.ObjectId | undefined;

  try {
    await session.withTransaction(async () => {
      const bill = await NonGstBill.findOne({ billNumber }).session(session);
      if (!bill) throw ApiError.notFound(`No bill found for "${billNumber}"`);
      if (bill.status === "void") throw ApiError.badRequest("Cancelled bills can't be edited");
      billId = bill._id as mongoose.Types.ObjectId;

      const oldLines = bill.items.map((item) => ({ productId: String(item.product), quantity: item.quantity }));
      const oldLineByProduct = new Map(bill.items.map((item) => [String(item.product), item]));
      const newLines = input.items.map((item) => ({ productId: item.product, quantity: item.quantity }));

      const productIds = [...new Set([...oldLines, ...newLines].map((l) => l.productId))];
      const products = await Product.find({ _id: { $in: productIds } }).session(session);
      const productById = new Map(products.map((p) => [String(p._id), p]));

      const lines = input.items.map((item) => {
        const existing = oldLineByProduct.get(item.product);
        const product = productById.get(item.product);
        if (!existing && !product) {
          throw ApiError.badRequest("One of the added products no longer exists — refresh and try again");
        }
        return {
          product: item.product,
          name: existing?.name ?? product!.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        };
      });
      const totals = computeNonGstTotals(lines, input.otherCharges);

      const movements: Record<string, unknown>[] = [];
      for (const [productId, delta] of computeStockDeltas(oldLines, newLines)) {
        const product = productById.get(productId);
        const label = product?.name ?? oldLineByProduct.get(productId)?.name ?? "This product";
        if (!product) {
          // Deleted from inventory since the sale: there's no stock to return
          // units to, and none to take more from.
          if (delta > 0) throw ApiError.badRequest(`"${label}" was deleted from inventory — its quantity can't be increased`);
          continue;
        }
        if (delta > 0 && product.quantityInStock < delta) {
          throw ApiError.badRequest(`Not enough stock for "${label}" — only ${product.quantityInStock} left`);
        }
        product.quantityInStock -= delta;
        await product.save({ session });
        movements.push({
          product: product._id,
          type: "sale_edit",
          quantityChange: -delta,
          resultingQuantity: product.quantityInStock,
          nonGstBill: bill._id,
          user: userId,
          note: `Non-GST bill ${billNumber} edited`,
        });
      }

      bill.set({
        customer: cleanCustomer(input.customer),
        priceList: input.priceList ?? bill.priceList,
        items: totals.lines,
        otherCharges: totals.otherCharges,
        subtotal: totals.subtotal,
        grandTotal: totals.grandTotal,
        amountInWords: numberToWordsINR(totals.grandTotal),
        note: input.note ?? "",
        editedAt: new Date(),
      });
      bill.set("editedBy", userId);

      await bill.save({ session });
      if (movements.length > 0) await StockMovement.insertMany(movements, { session });
    });
  } finally {
    await session.endSession();
  }

  return NonGstBill.findById(billId);
}

/**
 * "Deleting" a bill: it's cancelled (status "void") and its items go back to
 * stock. The record stays — bill numbers must not have gaps.
 */
export async function cancelBill(billNumber: string, userId: string, reason?: string) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const bill = await NonGstBill.findOne({ billNumber }).session(session);
      if (!bill) throw ApiError.notFound(`No bill found for "${billNumber}"`);
      if (bill.status === "void") throw ApiError.badRequest("This bill is already cancelled");

      const movements: Record<string, unknown>[] = [];
      for (const item of bill.items) {
        const product = await Product.findById(item.product).session(session);
        if (!product) continue; // deleted from inventory since — nothing to return stock to
        product.quantityInStock += item.quantity;
        await product.save({ session });
        movements.push({
          product: product._id,
          type: "sale_cancel",
          quantityChange: item.quantity,
          resultingQuantity: product.quantityInStock,
          nonGstBill: bill._id,
          user: userId,
          note: `Non-GST bill ${billNumber} cancelled`,
        });
      }

      bill.status = "void";
      bill.cancelledAt = new Date();
      bill.set("cancelledBy", userId);
      bill.cancelReason = reason?.trim() ?? "";
      await bill.save({ session });
      if (movements.length > 0) await StockMovement.insertMany(movements, { session });
    });
  } finally {
    await session.endSession();
  }

  return getBillByNumber(billNumber);
}

export async function markWhatsappSent(billNumber: string) {
  await NonGstBill.updateOne({ billNumber }, { whatsappSentAt: new Date() });
}

export async function markEmailSent(billNumber: string) {
  await NonGstBill.updateOne({ billNumber }, { emailSentAt: new Date() });
}
