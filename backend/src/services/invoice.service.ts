import mongoose from "mongoose";
import { redis } from "../config/redis";
import { Invoice } from "../models/Invoice.model";
import { Product } from "../models/Product.model";
import { StockMovement } from "../models/StockMovement.model";
import { ApiError } from "../utils/ApiError";
import { numberToWordsINR } from "../utils/numberToWords";
import { company } from "../config/company";
import { calculateInvoiceTotals, round2, splitGst } from "../utils/gst";
import { dateKeyFor, formatInvoiceNumber } from "../utils/invoiceNumber";
import * as cartService from "./cart.service";

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

  return Invoice.findById(invoiceId);
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
