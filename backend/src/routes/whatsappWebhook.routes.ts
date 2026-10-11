import { Router } from "express";
import * as whatsappWebhookController from "../controllers/whatsappWebhook.controller";

// Called by Meta's servers, not by staff: no JWT auth. Requests are trusted
// only after the verify-token / HMAC-signature checks in the controller.
export const whatsappWebhookRouter = Router();

whatsappWebhookRouter.get("/", whatsappWebhookController.verifyWebhook);
whatsappWebhookRouter.post("/", whatsappWebhookController.receiveWebhook);
