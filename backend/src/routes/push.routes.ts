import { Router } from "express";
import * as pushController from "../controllers/push.controller";
import { authenticate } from "../middleware/auth";

/** Device registration for PWA notifications. Any signed-in staff member, for their own devices. */
export const pushRouter = Router();

pushRouter.use(authenticate);

pushRouter.get("/config", pushController.config);
pushRouter.post("/subscribe", pushController.subscribe);
pushRouter.post("/unsubscribe", pushController.unsubscribe);
pushRouter.post("/test", pushController.test);
