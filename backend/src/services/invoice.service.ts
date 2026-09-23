import mongoose from "mongoose";
import { redis } from "../config/redis";
import { logger } from "../config/logger";
import { Invoice, type InvoiceStatus } from "../models/Invoice.model";
import { Product } from "../models/Product.model";
import { StockMovement } from "../models/StockMovement.model";
import { ApiError } from "../utils/ApiError";
import { numberToWordsINR } from "../utils/numberToWords";
import { company } from "../config/company";
import { calculateInvoiceTotals, round2, splitGst, type GstType } from "../utils/gst";
import { dateKeyFor, formatInvoiceNumber } from "../utils/invoiceNumber";
import { computeStockDeltas } from "../utils/invoiceEdit";
import { escapeRegex } from "../utils/regex";
import * as cartService from "./cart.service";
import * as customerService from "./customer.service";
import type { PaymentMethod } from "../types/cart";

const INVOICE_SEQ_TTL_SECONDS = 60 * 60 * 48; // spans a full day plus buffer past midnight rollover

/** Atomically issues the next invoice number for today: RTK-INV-YYMMDD-XXXX. */
async function nextInvoiceNumber(): Promise<string> {
  const dateKey = dateKeyFor(new Date());
  const seqKey = `invoice:seq:${dateKey}`;
  const seq = await redis.incr(seqKey);
  await redis.expire(seqKey, INVOICE_SEQ_TTL_SECONDS);
  return formatInvoiceNumber(company.invoicePrefix, dateKey, seq);
}

export async function checkout(userId: string, cartId: string) {
  const cart = await cartService.getCart(userId, cartId);

  if (cart.items.length === 0) throw ApiError.badRequest("Cart is empty");
  if (!cart.customer.name?.trim()) throw ApiError.badRequest("Customer name is required");
  if (!cart.paymentMethod) throw ApiError.badRequest("Payment method is required");
  if (cart.gst.enabled && !cart.gst.type) throw ApiError.badRequest("GST type (CGST+SGST or IGST) is required when GST is enabled");

  const { subtotal, gstAmount, otherCharges, grandTotal } = calculateInvoiceTotals({
    items: cart.items,
    gstEnabled: cart.gst.enabled,
    gstPercentage: cart.gst.percentage,
    otherCharges: cart.otherCharges,
  });

  const gst = {
    enabled: cart.gst.enabled,
    type: cart.gst.type,
    percentage: cart.gst.percentage,
    amount: gstAmount,
    ...splitGst(gstAmount, cart.gst.type, cart.gst.enabled),
  };

  const session = await mongoose.startSession();
  let invoiceId: mongoose.Types.ObjectId | undefined;

  try {
    await session.withTransaction(async () => {
      // Validate stock for every line first — an insufficient-stock failure
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

      const resultingQuantities = new Map<string, number>();
      for (const item of cart.items) {
        const product = products.get(item.productId)!;
        product.quantityInStock -= item.quantity;
        await product.save({ session });
        resultingQuantities.set(item.productId, product.quantityInStock);
      }

      const invoiceNumber = await nextInvoiceNumber();

      const [created] = await Invoice.create(
        [
          {
            invoiceNumber,
            billingDate: new Date(),
            customer: cart.customer,
            items: cart.items.map((item) => ({
              product: item.productId,
              name: item.name,
              hsnCode: item.hsnCode,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: round2(item.quantity * item.unitPrice),
            })),
            gst,
            otherCharges,
            subtotal,
            grandTotal,
            amountInWords: numberToWordsINR(grandTotal),
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
        "invoiceNumber billingDate customer customerRef items.quantity grandTotal paymentMethod status whatsappSentAt editedAt cancelledAt cancelReason",
      )
      .lean(),
    Invoice.countDocuments(query),
  ]);

  return {
    items: invoices.map(({ items, ...invoice }) => ({
      ...invoice,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    })),
    total,
    page,
    limit,
  };
}

export interface UpdateInvoiceInput {
  customer: {
    name: string;
    company?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
  };
  items: { product: string; quantity: number; unitPrice: number }[];
  gst: { enabled: boolean; type?: GstType; percentage: number };
  otherCharges: number;
  paymentMethod: PaymentMethod;
  note?: string;
}

/**
 * Admin correction of a completed sale. Recomputes every total server-side
 * and reconciles stock for any quantity change in the same transaction:
 * selling more takes units out of stock (refused if there aren't enough),
 * selling fewer or removing a line puts them back. The invoice number and
 * billing date never change.
 */
export async function updateInvoice(invoiceNumber: string, userId: string, input: UpdateInvoiceInput) {
  if (input.items.length === 0) throw ApiError.badRequest("An invoice needs at least one item");
  if (new Set(input.items.map((i) => i.product)).size !== input.items.length) {
    throw ApiError.badRequest("Each product can only appear once — combine the quantities into one line");
  }
  if (input.gst.enabled && !input.gst.type) {
    throw ApiError.badRequest("GST type (CGST+SGST or IGST) is required when GST is enabled");
  }

  const session = await mongoose.startSession();
  let invoiceId: mongoose.Types.ObjectId | undefined;

  try {
    await session.withTransaction(async () => {
      const invoice = await Invoice.findOne({ invoiceNumber }).session(session);
      if (!invoice) throw ApiError.notFound(`No invoice found for "${invoiceNumber}"`);
      if (invoice.status === "void") throw ApiError.badRequest("Cancelled invoices can't be edited");
      invoiceId = invoice._id as mongoose.Types.ObjectId;

      const oldLines = invoice.items.map((item) => ({ productId: String(item.product), quantity: item.quantity }));
      const oldLineByProduct = new Map(invoice.items.map((item) => [String(item.product), item]));
      const newLines = input.items.map((item) => ({ productId: item.product, quantity: item.quantity }));

      const productIds = [...new Set([...oldLines, ...newLines].map((l) => l.productId))];
      const products = await Product.find({ _id: { $in: productIds } }).session(session);
      const productById = new Map(products.map((p) => [String(p._id), p]));

      for (const item of input.items) {
        if (!oldLineByProduct.has(item.product) && !productById.has(item.product)) {
          throw ApiError.badRequest("One of the added products no longer exists — refresh and try again");
        }
      }

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

      invoice.set(
        "items",
        input.items.map((item) => {
          const existingLine = oldLineByProduct.get(item.product);
          const product = productById.get(item.product);
          return {
            product: item.product,
            // Existing lines keep the name/HSN they were billed with; new lines snapshot the product now.
            name: existingLine?.name ?? product!.name,
            hsnCode: existingLine?.hsnCode ?? product!.hsnCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: round2(item.quantity * item.unitPrice),
          };
        }),
      );

      const totals = calculateInvoiceTotals({
        items: input.items,
        gstEnabled: input.gst.enabled,
        gstPercentage: input.gst.percentage,
        otherCharges: input.otherCharges,
      });
      invoice.set("gst", {
        enabled: input.gst.enabled,
        type: input.gst.enabled ? input.gst.type : undefined,
        percentage: input.gst.enabled ? input.gst.percentage : 0,
        amount: totals.gstAmount,
        ...splitGst(totals.gstAmount, input.gst.type, input.gst.enabled),
      });
      invoice.subtotal = totals.subtotal;
      invoice.otherCharges = totals.otherCharges;
      invoice.grandTotal = totals.grandTotal;
      invoice.amountInWords = numberToWordsINR(totals.grandTotal);

      invoice.set("customer", {
        name: input.customer.name.trim(),
        company: input.customer.company ?? "",
        address: input.customer.address ?? "",
        phone: input.customer.phone ?? "",
        email: input.customer.email ?? "",
        gstin: input.customer.gstin?.toUpperCase() ?? "",
      });
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
 * "Deleting" an invoice: marks it cancelled (status "void") and returns every
 * item to stock. The record stays — invoice numbers are sequential and GST
 * records must not have gaps — but it drops out of reports and totals, and
 * the customer's link shows it as cancelled.
 */
export async function cancelInvoice(invoiceNumber: string, userId: string, reason?: string) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const invoice = await Invoice.findOne({ invoiceNumber }).session(session);
      if (!invoice) throw ApiError.notFound(`No invoice found for "${invoiceNumber}"`);
      if (invoice.status === "void") throw ApiError.badRequest("This invoice is already cancelled");

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

  return getInvoiceByNumber(invoiceNumber);
}

export async function markWhatsappSent(invoiceNumber: string) {
  await Invoice.updateOne({ invoiceNumber }, { whatsappSentAt: new Date() });
}

export async function markEmailSent(invoiceNumber: string) {
  await Invoice.updateOne({ invoiceNumber }, { emailSentAt: new Date() });
}
