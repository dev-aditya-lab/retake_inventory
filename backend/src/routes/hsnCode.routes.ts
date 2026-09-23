import { Router } from "express";
import * as hsnCodeController from "../controllers/hsnCode.controller";
import { validateBody } from "../middleware/validate";
import { createHsnCodeSchema, updateHsnCodeSchema } from "../validators/catalog.validators";
import { authenticate, requireRole } from "../middleware/auth";

export const hsnCodeRouter = Router();

hsnCodeRouter.use(authenticate);

// Any signed-in staff can read the list (product forms pick HSN codes from it).
hsnCodeRouter.get("/", hsnCodeController.listHsnCodes);

const adminOnly = requireRole("admin");
hsnCodeRouter.post("/", adminOnly, validateBody(createHsnCodeSchema), hsnCodeController.createHsnCode);
hsnCodeRouter.patch("/:id", adminOnly, validateBody(updateHsnCodeSchema), hsnCodeController.updateHsnCode);
hsnCodeRouter.delete("/:id", adminOnly, hsnCodeController.deleteHsnCode);
