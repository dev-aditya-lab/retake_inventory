import { logger } from "../config/logger";
import { WhatsappAlert } from "../models/WhatsappAlert.model";
import { WhatsappEvent } from "../models/WhatsappEvent.model";
import { WhatsappTemplate } from "../models/WhatsappTemplate.model";
import { ApiError } from "../utils/ApiError";
import { alertPush } from "../utils/pushPayload";
import { interpretChange } from "../utils/whatsappEvents";
import { notify } from "./push.service";

/**
 * Everything the webhook reports that isn't a chat message: template reviews
 * and quality, number quality, account notices. Each event is logged raw, then
 * (where it means something) turned into a template-state update and/or an
 * alert for admins.
 */

/**
 * Handles one `{field, value}` change. Never throws: a payload we can't make
 * sense of is logged as failed rather than failing the whole webhook (which
 * Meta would then retry for days).
 */
export async function recordChange(field: string, value: unknown, entryId?: string): Promise<void> {
  try {
    const effect = interpretChange(field, value);
    const acted = !!effect.template || !!effect.alert;

    if (effect.template) {
      const { ref, patch } = effect.template;
      await WhatsappTemplate.updateOne(
        { name: ref.name, language: ref.language },
        {
          $set: { ...patch, ...(ref.templateId ? { templateId: ref.templateId } : {}) },
          $setOnInsert: { name: ref.name, language: ref.language },
        },
        { upsert: true },
      );
    }

    if (effect.alert) {
      await WhatsappAlert.create(effect.alert);
      // Only problems are worth a buzz; approvals and upgrades stay on the health page.
      if (effect.alert.severity !== "info") {
        void notify({ roles: ["admin"] }, alertPush({ title: effect.alert.title, detail: effect.alert.detail }));
      }
    }

    await WhatsappEvent.create({ field, entryId, value, outcome: acted ? "processed" : "ignored" });
  } catch (err) {
    logger.error({ err, field }, "WhatsApp webhook change could not be processed");
    try {
      await WhatsappEvent.create({
        field,
        entryId,
        value,
        outcome: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // The log itself is failing (database down): nothing more to do here.
    }
  }
}

export async function getHealth() {
  const [templates, alerts, latestQuality] = await Promise.all([
    WhatsappTemplate.find().sort({ updatedAt: -1 }).lean(),
    WhatsappAlert.find().sort({ createdAt: -1 }).limit(50).lean(),
    WhatsappAlert.findOne({ kind: "phone_number_quality_update" }).sort({ createdAt: -1 }).lean(),
  ]);

  const quality = (latestQuality?.data ?? {}) as { event?: string; currentLimit?: string };

  return {
    number: latestQuality
      ? { event: quality.event ?? "", limit: quality.currentLimit ?? "", at: latestQuality.createdAt }
      : null,
    templates: templates.map((t) => ({
      id: String(t._id),
      name: t.name,
      language: t.language,
      status: t.status ?? "",
      category: t.category ?? "",
      quality: t.quality ?? "",
      reason: t.reason ?? "",
      updatedAt: t.updatedAt,
    })),
    alerts: alerts.map((a) => ({
      id: String(a._id),
      kind: a.kind,
      severity: a.severity,
      title: a.title,
      detail: a.detail ?? "",
      createdAt: a.createdAt,
      acknowledged: !!a.acknowledgedAt,
    })),
  };
}

export async function acknowledgeAlert(id: string, userId: string): Promise<void> {
  const result = await WhatsappAlert.updateOne(
    { _id: id, acknowledgedAt: { $exists: false } },
    { $set: { acknowledgedAt: new Date(), acknowledgedBy: userId } },
  );
  if (result.matchedCount === 0 && !(await WhatsappAlert.exists({ _id: id }))) {
    throw ApiError.notFound("Alert not found");
  }
}
