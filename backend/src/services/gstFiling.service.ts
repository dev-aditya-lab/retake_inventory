import { Types } from "mongoose";
import { GstFiling } from "../models/GstFiling.model";
import { ApiError } from "../utils/ApiError";
import { gstPeriodOf, isGstPeriod, type GstPeriod } from "../utils/istDate";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09" -> "Sep 2026" */
export function periodLabel(period: GstPeriod): string {
  const [year, month] = period.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

export async function isPeriodFiled(period: GstPeriod): Promise<boolean> {
  return !!(await GstFiling.exists({ period }));
}

/**
 * Refuses to change a bill whose month's GSTR-1 is filed. The books must keep
 * matching the filed return; corrections go through a credit note instead.
 */
export async function assertBillChangeable(billingDate: Date, action: "edited" | "deleted"): Promise<void> {
  const period = gstPeriodOf(billingDate);
  if (await isPeriodFiled(period)) {
    throw ApiError.conflict(
      `GSTR-1 for ${periodLabel(period)} is already filed, so this bill can't be ${action}. ` +
        "Use Return items or Delete — they issue a credit note, which goes into the current month's return.",
    );
  }
}

export async function listFilings() {
  return GstFiling.find().sort({ period: -1 }).populate("filedBy", "name").lean();
}

export async function markFiled(periods: GstPeriod[], userId: string, arn?: string) {
  for (const period of periods) {
    if (!isGstPeriod(period)) throw ApiError.badRequest(`"${period}" isn't a month like 2026-09`);
  }
  await GstFiling.bulkWrite(
    periods.map((period) => ({
      updateOne: {
        filter: { period },
        update: { $setOnInsert: { period, filedAt: new Date(), filedBy: new Types.ObjectId(userId), arn: arn?.trim() ?? "" } },
        upsert: true,
      },
    })),
  );
}

/** Undo a "filed" mark set by mistake. */
export async function unmarkFiled(period: GstPeriod) {
  const result = await GstFiling.deleteOne({ period });
  if (result.deletedCount === 0) throw ApiError.notFound(`${periodLabel(period)} isn't marked as filed`);
}
