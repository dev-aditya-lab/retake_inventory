import { Router } from "express";
import * as catalogCodeController from "../controllers/catalogCode.controller";
import { validateBody } from "../middleware/validate";
import { createCatalogCodeSchema, updateCatalogCodeSchema } from "../validators/catalog.validators";
import { authenticate, requireRole } from "../middleware/auth";

export const catalogCodeRouter = Router();

catalogCodeRouter.use(authenticate);

// Any signed-in staff can read the list (the add-product form suggests names from it).
catalogCodeRouter.get("/", catalogCodeController.listCatalogCodes);

// Changing codes can rewrite product names/SKUs — admin only.
const adminOnly = requireRole("admin");
catalogCodeRouter.post("/", adminOnly, validateBody(createCatalogCodeSchema), catalogCodeController.createCatalogCode);
catalogCodeRouter.patch("/:id", adminOnly, validateBody(updateCatalogCodeSchema), catalogCodeController.updateCatalogCode);
catalogCodeRouter.delete("/:id", adminOnly, catalogCodeController.deleteCatalogCode);
