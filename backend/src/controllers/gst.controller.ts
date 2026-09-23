import type { Request, Response } from "express";
import * as gstReturnService from "../services/gstReturn.service";
import * as gstFilingService from "../services/gstFiling.service";
import { company } from "../config/company";
import { returnPeriodCode } from "../utils/istDate";
import { ApiError } from "../utils/ApiError";
import { gstPeriodRangeQuerySchema } from "../validators/gst.validators";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export async function getReadiness(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await gstReturnService.gstReadiness() });
}

/** GSTR-1 preview: section totals, GSTR-3B figures and pre-filing checks (the JSON too, for inspection). */
export async function getGstr1(req: Request, res: Response): Promise<void> {
  const { from, to } = gstPeriodRangeQuerySchema.parse(req.query);
  res.json({ success: true, data: await gstReturnService.prepareGstr1(from, to ?? from) });
}

/**
 * The file to upload on the GST portal (Returns → GSTR-1 → Prepare Offline →
 * Upload). Refused while there are blocking problems, so a file the portal
 * would reject — or a wrong return — can't be downloaded by accident.
 */
export async function downloadGstr1(req: Request, res: Response): Promise<void> {
  const { from, to } = gstPeriodRangeQuerySchema.parse(req.query);
  const result = await gstReturnService.prepareGstr1(from, to ?? from);
  const blocking = result.issues.filter((issue) => issue.level === "error");
  if (blocking.length > 0) {
    throw ApiError.badRequest(`Fix ${blocking.length} problem(s) on the GST page before downloading: ${blocking[0]!.message}`);
  }
  const filename = `GSTR1_${company.gstin}_${returnPeriodCode(to ?? from)}.json`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.type("application/json").send(JSON.stringify(result.json));
}

export async function listFilings(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await gstFilingService.listFilings() });
}

export async function markFiled(req: Request, res: Response): Promise<void> {
  await gstFilingService.markFiled(req.body.periods, requireUserId(req), req.body.arn);
  res.json({ success: true, data: null });
}

export async function unmarkFiled(req: Request, res: Response): Promise<void> {
  await gstFilingService.unmarkFiled(req.params.period as string);
  res.json({ success: true, data: null });
}

export async function bulkSetProductGst(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await gstReturnService.bulkSetProductGst(req.body) });
}
