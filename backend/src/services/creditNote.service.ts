import mongoose from "mongoose";
import { company } from "../config/company";
import { CreditNote } from "../models/CreditNote.model";
import { GST_VERSION, Invoice } from "../models/Invoice.model";
import { Product } from "../models/Product.model";
import { StockMovement } from "../models/StockMovement.model";
import { ApiError } from "../utils/ApiError";
import { round2 } from "../utils/gst";
import { computeInvoiceTax, type PriceMode, type SupplyType } from "../utils/gstCalc";
import { creditNoteDeadline, formatGstDate, gstPeriodOf } from "../utils/istDate";
import { numberToWordsINR } from "../utils/numberToWords";
import { nextDocumentNumber } from "./documentNumber.service";
import { gstr1CategoryOf } from "./gstDocument.service";
import { isPeriodFiled, periodLabel } from "./gstFiling.service";

export interface ReturnLineInput {
  product: string;
  quantity: number;
}

/**
 * Issues a credit note against an invoice whose month's GSTR-1 is filed —
 * for returned goods ("partial") or a whole bill being reversed ("all").
 * Returned stock goes back on the shelf. The note reuses the invoice's own
 * prices, rates and place of supply, so the reversal exactly mirrors what was
 * reported. Returning the last remaining items also reverses the bill's other
 * charges, and marks the invoice fully "credited".
 */
export async function issueCreditNote(input: {
  invoiceNumber: string;
  userId: string;
  lines: ReturnLineInput[] | "all";
  reason?: string;
}) {
  const session = await mongoose.startSession();
  let noteId: mongoose.Types.ObjectId | undefined;

  try {
    await session.withTransaction(async () => {
      const invoice = await Invoice.findOne({ invoiceNumber: input.invoiceNumber }).session(session);
      if (!invoice) throw ApiError.notFound(`No invoice found for "${input.invoiceNumber}"`);
      if (invoice.gstVersion !== GST_VERSION) {
        throw ApiError.badRequest("This bill was made before GST billing was set up, so a GST credit note can't be issued for it automatically.");
      }
      if (invoice.status === "void") throw ApiError.badRequest("This bill was cancelled — there's nothing to credit");
      if (invoice.status === "credited") throw ApiError.badRequest("This bill has already been fully credited");

      const period = gstPeriodOf(invoice.billingDate);
      if (!(await isPeriodFiled(period))) {
        throw ApiError.badRequest(
          `${periodLabel(period)} isn't marked as filed yet — edit or delete the bill directly instead of issuing a credit note.`,
        );
      }
      const deadline = creditNoteDeadline(invoice.billingDate);
      if (Date.now() >= deadline.getTime()) {
        throw ApiError.badRequest(
          `The legal deadline for credit notes on this bill passed on ${formatGstDate(new Date(deadline.getTime() - 1))} (CGST s.34(2)).`,
        );
      }

      // What's still returnable, after earlier credit notes on this bill.
      const previousNotes = await CreditNote.find({ invoice: invoice._id }).session(session);
      const creditedQty = new Map<string, number>();
      for (const note of previousNotes) {
        for (const item of note.items) {
          creditedQty.set(String(item.product), (creditedQty.get(String(item.product)) ?? 0) + item.quantity);
        }
      }
      const remaining = new Map(
        invoice.items.map((item) => [String(item.product), item.quantity - (creditedQty.get(String(item.product)) ?? 0)]),
      );

      const requested: ReturnLineInput[] =
        input.lines === "all"
          ? [...remaining].filter(([, qty]) => qty > 0).map(([product, quantity]) => ({ product, quantity }))
          : input.lines;
      if (requested.length === 0) throw ApiError.badRequest("Nothing left to return on this bill");

      const lineByProduct = new Map(invoice.items.map((item) => [String(item.product), item]));
      const returnLines = requested.map(({ product, quantity }) => {
        const line = lineByProduct.get(product);
        if (!line) throw ApiError.badRequest("One of the returned products isn't on this bill");
        const left = remaining.get(product) ?? 0;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > left) {
          throw ApiError.badRequest(`"${line.name}": you can return between 1 and ${left}`);
        }
        return {
          product,
          name: line.name,
          hsnCode: line.hsnCode ?? "",
          uqc: line.uqc ?? "",
          gstRate: line.gstRate ?? 0,
          quantity,
          unitPrice: line.unitPrice,
        };
      });

      const returnedAll = [...remaining].every(
        ([product, qty]) => qty === (returnLines.find((l) => l.product === product)?.quantity ?? 0),
      );
      const otherChargesAlreadyCredited = previousNotes.some((note) => note.otherChargesLine);
      const otherCharges = returnedAll && !otherChargesAlreadyCredited ? invoice.otherChargesLine : undefined;

      const tax = computeInvoiceTax({
        lines: returnLines,
        priceMode: invoice.priceMode as PriceMode,
        supplyType: invoice.supplyType as SupplyType,
      });

      // Reverse the bill's other charges exactly as billed (not re-derived).
      const rateSummary = tax.rateSummary.map((row) => ({ ...row }));
      const totals = { taxableValue: tax.taxableValue, cgst: tax.cgst, sgst: tax.sgst, igst: tax.igst };
      if (otherCharges) {
        const row = rateSummary.find((r) => r.gstRate === otherCharges.gstRate);
        const add = (target: typeof totals) => {
          target.taxableValue = round2(target.taxableValue + otherCharges.taxableValue);
          target.cgst = round2(target.cgst + (otherCharges.cgst ?? 0));
          target.sgst = round2(target.sgst + (otherCharges.sgst ?? 0));
          target.igst = round2(target.igst + (otherCharges.igst ?? 0));
        };
        if (row) add(row);
        else {
          const fresh = { gstRate: otherCharges.gstRate, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
          add(fresh);
          rateSummary.push(fresh);
        }
        add(totals);
      }
      const totalTax = round2(totals.cgst + totals.sgst + totals.igst);
      const grandTotal = round2(totals.taxableValue + totalTax);

      const noteNumber = await nextDocumentNumber("credit-note", company.creditNotePrefix);

      const movements: Record<string, unknown>[] = [];
      for (const line of returnLines) {
        const product = await Product.findById(line.product).session(session);
        if (!product) continue; // deleted from inventory since — nothing to return stock to
        product.quantityInStock += line.quantity;
        await product.save({ session });
        movements.push({
          product: product._id,
          type: "sale_return",
          quantityChange: line.quantity,
          resultingQuantity: product.quantityInStock,
          invoice: invoice._id,
          user: input.userId,
          note: `Credit note ${noteNumber} against ${invoice.invoiceNumber}`,
        });
      }

      const [note] = await CreditNote.create(
        [
          {
            noteNumber,
            noteDate: new Date(),
            invoice: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.billingDate,
            invoiceCategory: gstr1CategoryOf(invoice),
            customer: invoice.customer,
            supplier: invoice.supplier,
            buyerType: invoice.buyerType,
            priceMode: invoice.priceMode,
            placeOfSupply: invoice.placeOfSupply,
            supplyType: invoice.supplyType,
            reverseCharge: false,
            items: tax.lines,
            otherChargesLine: otherCharges ?? undefined,
            rateSummary,
            ...totals,
            totalTax,
            grandTotal,
            amountInWords: numberToWordsINR(grandTotal),
            reason: input.reason?.trim() ?? "",
            isFullReversal: returnedAll && previousNotes.length === 0,
            createdBy: input.userId,
          },
        ],
        { session },
      );
      if (!note) throw new Error("Failed to create credit note");
      noteId = note._id as mongoose.Types.ObjectId;

      invoice.creditedTotal = round2((invoice.creditedTotal ?? 0) + grandTotal);
      if (returnedAll && (otherCharges || otherChargesAlreadyCredited || !invoice.otherChargesLine)) {
        invoice.status = "credited";
      }
      await invoice.save({ session });
      if (movements.length > 0) await StockMovement.insertMany(movements, { session });
    });
  } finally {
    await session.endSession();
  }

  return CreditNote.findById(noteId);
}

export async function listCreditNotesForInvoice(invoiceNumber: string) {
  return CreditNote.find({ invoiceNumber }).sort({ noteDate: 1 }).lean();
}

export async function getCreditNoteByNumber(noteNumber: string) {
  const note = await CreditNote.findOne({ noteNumber });
  if (!note) throw ApiError.notFound(`No credit note found for "${noteNumber}"`);
  return note;
}
