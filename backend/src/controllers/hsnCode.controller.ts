import type { Request, Response } from "express";
import * as hsnCodeService from "../services/hsnCode.service";

export async function listHsnCodes(_req: Request, res: Response): Promise<void> {
  const codes = await hsnCodeService.listHsnCodes();
  res.json({ success: true, data: codes });
}

export async function createHsnCode(req: Request, res: Response): Promise<void> {
  const code = await hsnCodeService.createHsnCode(req.body);
  res.status(201).json({ success: true, data: code });
}

export async function updateHsnCode(req: Request, res: Response): Promise<void> {
  const result = await hsnCodeService.updateHsnCode(req.params.id as string, req.body);
  res.json({ success: true, data: result });
}

export async function deleteHsnCode(req: Request, res: Response): Promise<void> {
  await hsnCodeService.deleteHsnCode(req.params.id as string);
  res.json({ success: true, data: null });
}
