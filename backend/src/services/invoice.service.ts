import mongoose from "mongoose";
import { logger } from "../config/logger";
import { Invoice, type InvoiceStatus } from "../models/Invoice.model";
import { Product } from "../models/Product.model";
import { StockMovement } from "../models/StockMovement.model";
import { ApiError } from "../utils/ApiError";
import { company } from "../config/company";
import { computeStockDeltas } from "../utils/invoiceEdit";
import { escapeRegex } from "../utils/regex";
import { gstPeriodOf } from "../utils/istDate";
import * as cartService from "./cart.service";
import * as customerService from "./customer.service";
import * as creditNoteService from "./creditNote.service";
import { nextDocumentNumber } from "./documentNumber.service";
import { buildGstDocument, lineFromProduct, resolveBuyer, type GstBillLine, type GstCustomerInput } from "./gstDocument.service";
import { assertBillChangeable, isPeriodFiled } from "./gstFiling.service";
import { GstFiling } from "../models/GstFiling.model";
import type { PaymentMethod } from "../types/cart";

export async function checkout(userId: string, cartId: string) {
  const cart = await cartService.getCart(userId, cartId);

  if (cart.items.length === 0) throw ApiError.badRequest("Cart is empty");
  if (!cart.customer.name?.trim()) throw ApiError.badRequest("Customer name is required");
  if (!cart.paymentMethod) throw ApiError.badRequest("Payment method is required");

  const customer = { ...cart.customer, name: cart.customer.name.trim() };
  const buyer = resolveBuyer(customer);

  const session = await mongoose.startSession();
  let invoiceId: mongoose.Types.ObjectId | undefined;

  try {
    await session.withTransaction(async () => {
      // Validate stock and GST details for every line first — a failure
      // (the common case) then never burns an invoice number.
      const products = new Map<string, InstanceType<typeof Product>>();
      for (const item of cart.items) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) throw ApiError.badRequest(`"${item.name}" no longer exists`);
        if (product.quantityInStock < item.quantity) {
          throw ApiError.badRequest(`Not enough stock for "${item.name}" — only ${product.quantityInStock} left`);
        }
        products.set(item.productId, product);
      }

      // Prices come from the product at checkout: B2B price for GSTIN buyers,
      // MRP for everyone else.
      const lines = cart.items.map((item) => lineFromProduct(products.get(item.productId)!, item.quantity, buyer.priceMode));
      const { fields } = buildGstDocument({ customer, lines, otherCharges: cart.otherCharges });

      const resultingQuantities = new Map<string, number>();
      for (const item of cart.items) {
        const product = products.get(item.productId)!;
        product.quantityInStock -= item.quantity;
        await product.save({ session });
        resultingQuantities.set(item.productId, product.quantityInStock);
      }

      const invoiceNumber = await nextDocumentNumber("invoice", company.invoicePrefix);

      const [created] = await Invoice.create(
        [
          {
            invoiceNumber,
            billingDate: new Date(),
            ...fields,
            paymentMethod: cart.paymentMethod,
            note: cart.note,
            createdBy: userId,
          },
        ],
        { session },
      );
      if (!created) throw ApiError.badRequest("Failed to create invoice");

      invoiceId = created._id as mongoose.Types.ObjectId;

      await StockMovement.insertMany(
        cart.items.map((item) => ({
          product: item.productId,
          type: "sale",
          quantityChange: -item.quantity,
          resultingQuantity: resultingQuantities.get(item.productId),
          invoice: created._id,
          user: userId,
          note: `Invoice ${invoiceNumber}`,
        })),
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  await cartService.discardCart(userId, cartId);
  await linkInvoiceToCustomer(invoiceId, "upsert");

  return Invoice.findById(invoiceId);
}

/**
 * Keeps the customer directory in step with a bill. Best-effort: a directory
 * hiccup must never fail a sale that has already been committed.
 *   upsert         -> checkout: refresh the customer with this bill's details
 *   find-or-create -> admin edit: link only, don't overwrite newer details
 */
async function linkInvoiceToCustomer(
  invoiceId: mongoose.Types.ObjectId | undefined,
  mode: "upsert" | "find-or-create",
): Promise<void> {
  if (!invoiceId) return;
  try {
    const invoice = await Invoice.findById(invoiceId).select("customer billingDate customerRef");
    if (!invoice?.customer) return;
    const customerId =
      mode === "upsert"
        ? await customerService.upsertCustomerFromSale(invoice.customer, invoice.billingDate)
        : await customerService.findOrCreateCustomer(invoice.customer, invoice.billingDate);

    if (customerId) {
      await Invoice.updateOne({ _id: invoiceId }, { customerRef: customerId });
    } else if (invoice.customerRef) {
      await Invoice.updateOne({ _id: invoiceId }, { $unset: { customerRef: 1 } });
    }
  } catch (err) {
    logger.error({ err, invoiceId }, "Failed to link invoice to customer directory");
  }
}

export async function getInvoiceByNumber(invoiceNumber: string) {
  const invoice = await Invoice.findOne({ invoiceNumber });
  if (!invoice) throw ApiError.notFound(`No invoice found for "${invoiceNumber}"`);
  return invoice;
}

export interface InvoiceListFilters {
  search?: string;
  status?: InvoiceStatus;
  customerId?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export async function listInvoices({ search, status, customerId, from, to, page, limit }: InvoiceListFilters) {
  const query: Record<string, unknown> = {};
  if (status) query.status = status;
  if (customerId) query.customerRef = customerId;
  if (from || to) {
    const billingDate: Record<string, Date> = {};
    if (from) billingDate.$gte = from;
    if (to) billingDate.$lte = to;
    query.billingDate = billingDate;
  }
  if (search?.trim()) {
    const pattern = escapeRegex(search.trim());
    query.$or = [
      { invoiceNumber: { $regex: pattern, $options: "i" } },
      { "customer.name": { $regex: pattern, $options: "i" } },
      { "customer.phone": { $regex: pattern, $options: "i" } },
      { "customer.company": { $regex: pattern, $options: "i" } },
    ];
  }

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .sort({ billingDate: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(
        "invoiceNumber billingDate customer customerRef items.quantity grandTotal creditedTotal gstVersion buyerType paymentMethod status whatsappSentAt editedAt cancelledAt cancelReason",
      )
      .lean(),
    Invoice.countDocuments(query),
  ]);

  const filed = new Set(
    (await GstFiling.find({ period: { $in: [...new Set(invoices.map((inv) => gstPeriodOf(inv.billingDate)))] } }).select("period").lean()).map(
      (f) => f.period,
    ),
  );

  return {
    items: invoices.map(({ items, ...invoice }) => ({
      ...invoice,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      // Its month's GSTR-1 is filed: edits/deletes become credit notes.
      gstLocked: filed.has(gstPeriodOf(invoice.billingDate)),
    })),
    total,
    page,
    limit,
  };
}

export interface UpdateInvoiceInput {
  customer: GstCustomerInput & { name: string };
  /** unitPrice is read per the buyer: excluding GST (B2B) or the MRP (retail). */
  items: { product: string; quantity: number; unitPrice: number }[];
  otherCharges: number;
  paymentMethod: PaymentMethod;
  note?: string;
}

/**
 * Admin correction of a completed sale, while its month's GSTR-1 is still
 * unfiled. Every tax figure is recomputed server-side, and stock is
 * reconciled for any quantity change in the same transaction: selling more
 * takes units out of stock (refused if there aren't enough), selling fewer
 * or removing a line puts them back. The invoice number and billing date
 * never change. Once the month is filed, corrections are credit notes.
 */
export async function updateInvoice(invoiceNumber: string, userId: string, input: UpdateInvoiceInput) {
  if (input.items.length === 0) throw ApiError.badRequest("An invoice needs at least one item");
  if (new Set(input.items.map((i) => i.product)).size !== input.items.length) {
    throw ApiError.badRequest("Each product can only appear once — combine the quantities into one line");
  }

  const session = await mongoose.startSession();
  let invoiceId: mongoose.Types.ObjectId | undefined;

  try {
    await session.withTransaction(async () => {
      const invoice = await Invoice.findOne({ invoiceNumber }).session(session);
      if (!invoice) throw ApiError.notFound(`No invoice found for "${invoiceNumber}"`);
      if (invoice.status === "void") throw ApiError.badRequest("Cancelled invoices can't be edited");
      if (invoice.status === "credited") throw ApiError.badRequest("This bill was reversed by a credit note and can't be edited");
      await assertBillChangeable(invoice.billingDate, "edited");
      invoiceId = invoice._id as mongoose.Types.ObjectId;

      const buyer = resolveBuyer(input.customer);

      const oldLines = invoice.items.map((item) => ({ productId: String(item.product), quantity: item.quantity }));
      const oldLineByProduct = new Map(invoice.items.map((item) => [String(item.product), item]));
      const newLines = input.items.map((item) => ({ productId: item.product, quantity: item.quantity }));

      const productIds = [...new Set([...oldLines, ...newLines].map((l) => l.productId))];
      const products = await Product.find({ _id: { $in: productIds } }).session(session);
      const productById = new Map(products.map((p) => [String(p._id), p]));

      // Lines keep the GST details they were billed with; new lines (and old
      // pre-GST lines) take the product's current HSN, rate and unit.
      const lines: GstBillLine[] = input.items.map((item) => {
        const existing = oldLineByProduct.get(item.product);
        const product = productById.get(item.product);
        if (existing && existing.gstRate != null && existing.hsnCode && existing.uqc) {
          return {
            product: item.product,
            name: existing.name,
            hsnCode: existing.hsnCode,
            uqc: existing.uqc,
            gstRate: existing.gstRate,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          };
        }
        if (!product) {
          throw ApiError.badRequest(
            existing
              ? `"${existing.name}" was deleted from inventory and has no GST details — remove it from the bill`
              : "One of the added products no longer exists — refresh and try again",
          );
        }
        return { ...lineFromProduct(product, item.quantity, buyer.priceMode, item.unitPrice), name: existing?.name ?? product.name };
      });
      const { fields } = buildGstDocument({ customer: input.customer, lines, otherCharges: input.otherCharges });

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
          invoice: invoice._id,
          user: userId,
          note: `Invoice ${invoiceNumber} edited`,
        });
      }

      invoice.set(fields);
      invoice.paymentMethod = input.paymentMethod;
      invoice.note = input.note ?? "";
      invoice.editedAt = new Date();
      invoice.set("editedBy", userId);

      await invoice.save({ session });
      if (movements.length > 0) await StockMovement.insertMany(movements, { session });
    });
  } finally {
    await session.endSession();
  }

  await linkInvoiceToCustomer(invoiceId, "find-or-create");
  return Invoice.findById(invoiceId);
}

/**
 * "Deleting" an invoice. While its month's GSTR-1 is unfiled, the bill is
 * cancelled (status "void") and its items go back to stock — GSTR-1 then
 * lists it only as a cancelled document. Once the month is filed, a sale
 * can't be erased: a credit note reverses it in the current month instead.
 * Either way the record stays — invoice numbers must not have gaps.
 */
export async function cancelInvoice(invoiceNumber: string, userId: string, reason?: string) {
  const existing = await getInvoiceByNumber(invoiceNumber);
  if (await isPeriodFiled(gstPeriodOf(existing.billingDate))) {
    const creditNote = await creditNoteService.issueCreditNote({ invoiceNumber, userId, lines: "all", reason });
    return { invoice: await getInvoiceByNumber(invoiceNumber), creditNote };
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const invoice = await Invoice.findOne({ invoiceNumber }).session(session);
      if (!invoice) throw ApiError.notFound(`No invoice found for "${invoiceNumber}"`);
      if (invoice.status === "void") throw ApiError.badRequest("This invoice is already cancelled");
      if (invoice.status === "credited") throw ApiError.badRequest("This bill was already reversed by a credit note");

      const movements: Record<string, unknown>[] = [];
      for (const item of invoice.items) {
        const product = await Product.findById(item.product).session(session);
        if (!product) continue; // deleted from inventory since — nothing to return stock to
        product.quantityInStock += item.quantity;
        await product.save({ session });
        movements.push({
          product: product._id,
          type: "sale_cancel",
          quantityChange: item.quantity,
          resultingQuantity: product.quantityInStock,
          invoice: invoice._id,
          user: userId,
          note: `Invoice ${invoiceNumber} cancelled`,
        });
      }

      invoice.status = "void";
      invoice.cancelledAt = new Date();
      invoice.set("cancelledBy", userId);
      invoice.cancelReason = reason?.trim() ?? "";
      await invoice.save({ session });
      if (movements.length > 0) await StockMovement.insertMany(movements, { session });
    });
  } finally {
    await session.endSession();
  }

  return { invoice: await getInvoiceByNumber(invoiceNumber), creditNote: null };
}

export async function markWhatsappSent(invoiceNumber: string) {
  await Invoice.updateOne({ invoiceNumber }, { whatsappSentAt: new Date() });
}

export async function markEmailSent(invoiceNumber: string) {
  await Invoice.updateOne({ invoiceNumber }, { emailSentAt: new Date() });
}
