import type { Request, Response } from "express";
import * as reportService from "../services/report.service";
import { dateRangeQuerySchema, salesReportQuerySchema } from "../validators/report.validators";

// Express 5's req.query is a getter with no setter, so query params are
// parsed inline here rather than via a validateQuery(schema) middleware that
// tries to reassign req.query (as validateBody does for req.body).
function parseRange(query: unknown): { from?: Date; to?: Date } {
  const { from, to } = dateRangeQuerySchema.parse(query);
  return { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined };
}

export async function getDashboard(_req: Request, res: Response): Promise<void> {
  const summary = await reportService.getDashboardSummary();
  res.json({ success: true, data: summary });
}

export async function getSales(req: Request, res: Response): Promise<void> {
  const { period, from, to } = salesReportQuerySchema.parse(req.query);
  const report = await reportService.getSalesReport(period, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  res.json({ success: true, data: report });
}

export async function getProductWise(req: Request, res: Response): Promise<void> {
  const range = parseRange(req.query);
  const report = await reportService.getProductWiseSales(range);
  res.json({ success: true, data: report });
}

export async function getUserWise(req: Request, res: Response): Promise<void> {
  const range = parseRange(req.query);
  const report = await reportService.getUserWiseSales(range);
  res.json({ success: true, data: report });
}
