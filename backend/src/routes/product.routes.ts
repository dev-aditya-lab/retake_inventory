import { Router } from "express";
import * as productController from "../controllers/product.controller";
import { validateBody } from "../middleware/validate";
import { adjustStockSchema, createProductSchema, updateProductSchema } from "../validators/product.validators";
import { authenticate, requireRole } from "../middleware/auth";

export const productRouter = Router();

productRouter.use(authenticate);

const canManageStock = requireRole("admin", "inventory_manager");

productRouter.get("/", productController.listProducts);
productRouter.get("/barcode/decode/:ean13", productController.decodeBarcode);
productRouter.get("/barcode/:ean13", productController.getProductByBarcode);
productRouter.get("/:id", productController.getProduct);
productRouter.get("/:id/barcode", productController.getProductBarcodeImage);
productRouter.post("/", canManageStock, validateBody(createProductSchema), productController.createProduct);
productRouter.patch("/:id", canManageStock, validateBody(updateProductSchema), productController.updateProduct);
productRouter.post("/:id/stock", canManageStock, validateBody(adjustStockSchema), productController.adjustStock);
