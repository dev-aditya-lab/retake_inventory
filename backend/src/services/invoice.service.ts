import mongoose from "mongoose";
import { redis } from "../config/redis";
import { Invoice } from "../models/Invoice.model";
import { Product } from "../models/Product.model";
import { StockMovement } from "../models/StockMovement.model";
import { ApiError } from "../utils/ApiError";
import { numberToWordsINR } from "../utils/numberToWords";
import { company } from "../config/company";
import * as cartService from "./cart.service";

const INVOICE_SEQ_TTL_SECONDS = 60 * 60 * 48; // spans a full day plus buffer past midnight rollover

function todayDateKey(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** Atomically issues the next invoice number for today: RTK-INV-YYMMDD-XXXX. */
async function nextInvoiceNumber(): Promise<string> {
  const dateKey = todayDateKey();
  const seqKey = `invoice:seq:${dateKey}`;
  const seq = await redis.incr(seqKey);
  await redis.expire(seqKey, INVOICE_SEQ_TTL_SECONDS);
  return `${company.invoicePrefix}-${dateKey}-${String(seq).padStart(4, "0")}`;
}

export async function checkout(userId: string, cartId: string) {
  const cart = await cartService.getCart(userId, cartId);

  if (cart.items.length === 0) throw ApiError.badRequest("Cart is empty");
  if (!cart.customer.name?.trim()) throw ApiError.badRequest("Customer name is required");
  if (!cart.paymentMethod) throw ApiError.badRequest("Payment method is required");
  if (cart.gst.enabled && !cart.gst.type) throw ApiError.badRequest("GST type (CGST+SGST or IGST) is required when GST is enabled");

  const subtotal = round2(cart.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  const gstAmount = cart.gst.enabled ? round2(subtotal * (cart.gst.percentage / 100)) : 0;
  const otherCharges = round2(cart.otherCharges || 0);
  const grandTotal = round2(subtotal + gstAmount + otherCharges);

  // Split evenly but keep cgst+sgst summing exactly to gstAmount — rounding
  // each half independently can be off by a paisa (e.g. 5.625 -> 5.63 twice
  // = 11.26 when the total is really 11.25).
  const cgstAmount = round2(gstAmount / 2);
  const sgstAmount = round2(gstAmount - cgstAmount);

  const gst = {
    enabled: cart.gst.enabled,
    type: cart.gst.type,
    percentage: cart.gst.percentage,
    amount: gstAmount,
    cgstAmount: cart.gst.enabled && cart.gst.type === "CGST_SGST" ? cgstAmount : undefined,
    sgstAmount: cart.gst.enabled && cart.gst.type === "CGST_SGST" ? sgstAmount : undefined,
    igstAmount: cart.gst.enabled && cart.gst.type === "IGST" ? gstAmount : undefined,
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

  return Invoice.findById(invoiceId);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getInvoiceByNumber(invoiceNumber: string) {
  const invoice = await Invoice.findOne({ invoiceNumber });
  if (!invoice) throw ApiError.notFound(`No invoice found for "${invoiceNumber}"`);
  return invoice;
}

export async function markWhatsappSent(invoiceNumber: string) {
  await Invoice.updateOne({ invoiceNumber }, { whatsappSentAt: new Date() });
}

export async function markEmailSent(invoiceNumber: string) {
  await Invoice.updateOne({ invoiceNumber }, { emailSentAt: new Date() });
}
