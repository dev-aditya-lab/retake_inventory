import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { healthRouter } from "./routes/health.routes";
import { authRouter } from "./routes/auth.routes";
import { userRouter } from "./routes/user.routes";
import { productRouter } from "./routes/product.routes";
import { cartRouter } from "./routes/cart.routes";
import { invoiceRouter } from "./routes/invoice.routes";
import { reportRouter } from "./routes/report.routes";
import { catalogCodeRouter } from "./routes/catalogCode.routes";
import { hsnCodeRouter } from "./routes/hsnCode.routes";
import { customerRouter } from "./routes/customer.routes";
import { gstRouter } from "./routes/gst.routes";
import { creditNoteRouter } from "./routes/creditNote.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimit";

export function createApp() {
  const app = express();

  // Coolify (and most self-hosted PaaS) terminate TLS at a reverse proxy
  // (Traefik) in front of this container. Without trust proxy set,
  // express-rate-limit throws on the X-Forwarded-For header it sees, and
  // req.ip would resolve to the proxy's address instead of the client's.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.use("/health", healthRouter);
  app.use("/api", apiLimiter);
  app.use("/api/auth", authRouter);
  app.use("/api/users", userRouter);
  app.use("/api/products", productRouter);
  app.use("/api/carts", cartRouter);
  app.use("/api/invoices", invoiceRouter);
  app.use("/api/reports", reportRouter);
  app.use("/api/sku-codes", catalogCodeRouter);
  app.use("/api/hsn-codes", hsnCodeRouter);
  app.use("/api/customers", customerRouter);
  app.use("/api/gst", gstRouter);
  app.use("/api/credit-notes", creditNoteRouter);

  // Further feature routers are mounted here as each phase lands.

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
