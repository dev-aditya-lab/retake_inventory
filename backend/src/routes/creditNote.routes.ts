import { Router } from "express";
import type { Request, Response } from "express";
import * as creditNoteService from "../services/creditNote.service";
import { generateCreditNotePdf } from "../services/pdf.service";

export const creditNoteRouter = Router();

// Public, like invoices — the customer opens their credit note from a link.
creditNoteRouter.get("/:noteNumber", async (req: Request, res: Response) => {
  const note = await creditNoteService.getCreditNoteByNumber(req.params.noteNumber as string);
  res.json({ success: true, data: note });
});

creditNoteRouter.get("/:noteNumber/pdf", async (req: Request, res: Response) => {
  const note = await creditNoteService.getCreditNoteByNumber(req.params.noteNumber as string);
  const pdf = await generateCreditNotePdf(note);
  res.setHeader("Content-Disposition", `inline; filename="${note.noteNumber}.pdf"`);
  res.type("application/pdf").send(pdf);
});
