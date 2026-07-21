import { Router } from "express";
import * as reportController from "../controllers/report.controller";
import { authenticate, requireRole } from "../middleware/auth";

export const reportRouter = Router();

reportRouter.use(authenticate);

// Dashboard summary is a general overview — fine for any signed-in staff.
reportRouter.get("/dashboard", reportController.getDashboard);

// Detailed financial/staff-performance breakdowns are admin-only.
reportRouter.get("/sales", requireRole("admin"), reportController.getSales);
reportRouter.get("/products", requireRole("admin"), reportController.getProductWise);
reportRouter.get("/users", requireRole("admin"), reportController.getUserWise);
