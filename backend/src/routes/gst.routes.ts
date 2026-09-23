import { Router } from "express";
import * as gstController from "../controllers/gst.controller";
import { validateBody } from "../middleware/validate";
import { authenticate, requireRole } from "../middleware/auth";
import { bulkProductGstSchema, markFiledSchema } from "../validators/gst.validators";

export const gstRouter = Router();

// GST returns and compliance settings are an owner/accountant job — admin only.
gstRouter.use(authenticate, requireRole("admin"));

gstRouter.get("/readiness", gstController.getReadiness);
gstRouter.get("/gstr1", gstController.getGstr1);
gstRouter.get("/gstr1/download", gstController.downloadGstr1);

gstRouter.get("/filings", gstController.listFilings);
gstRouter.post("/filings", validateBody(markFiledSchema), gstController.markFiled);
gstRouter.delete("/filings/:period", gstController.unmarkFiled);

gstRouter.post("/products/bulk", validateBody(bulkProductGstSchema), gstController.bulkSetProductGst);
