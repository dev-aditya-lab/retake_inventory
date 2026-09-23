import type { Request, Response } from "express";
import * as catalogCodeService from "../services/catalogCode.service";

export async function listCatalogCodes(_req: Request, res: Response): Promise<void> {
  const codes = await catalogCodeService.listCatalogCodes();
  res.json({ success: true, data: codes });
}

export async function createCatalogCode(req: Request, res: Response): Promise<void> {
  const code = await catalogCodeService.createCatalogCode(req.body);
  res.status(201).json({ success: true, data: code });
}

export async function updateCatalogCode(req: Request, res: Response): Promise<void> {
  const result = await catalogCodeService.updateCatalogCode(req.params.id as string, req.body);
  res.json({ success: true, data: result });
}

export async function deleteCatalogCode(req: Request, res: Response): Promise<void> {
  await catalogCodeService.deleteCatalogCode(req.params.id as string);
  res.json({ success: true, data: null });
}
