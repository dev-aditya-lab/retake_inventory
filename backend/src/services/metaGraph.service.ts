import axios from "axios";
import { logger } from "../config/logger";
import { ApiError } from "../utils/ApiError";
import { describeGraphError, isTokenError } from "../utils/metaGraph";
import { getWhatsappConfig, type WhatsappConfig } from "./whatsappConfig.service";

/**
 * One place that calls Meta's Graph API with the credentials in effect (saved in
 * the app, else from env). Failures become short ApiErrors carrying Meta's own
 * explanation, never the raw payload.
 */

const TIMEOUT_MS = 20_000;

export interface GraphOptions {
  params?: Record<string, string | number | undefined>;
  data?: unknown;
  /** Use these credentials instead of the saved ones (e.g. to test values before saving). */
  config?: WhatsappConfig;
  timeoutMs?: number;
}

export async function graph<T>(method: "GET" | "POST" | "DELETE", path: string, options: GraphOptions = {}): Promise<T> {
  const config = options.config ?? (await getWhatsappConfig());
  if (!config.accessToken) throw ApiError.badRequest("WhatsApp is not configured: add the access token first");

  try {
    const response = await axios.request<T>({
      method,
      url: `${config.apiUrl}/${path.replace(/^\/+/, "")}`,
      params: options.params,
      data: options.data,
      headers: { Authorization: `Bearer ${config.accessToken}` },
      timeout: options.timeoutMs ?? TIMEOUT_MS,
    });
    return response.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      logger.warn({ status: err.response.status, path }, "Meta Graph API returned an error");
      const reason = describeGraphError(err.response.data);
      throw ApiError.badRequest(
        isTokenError(err.response.data) ? `The access token was rejected by Meta. ${reason}` : `WhatsApp: ${reason}`,
      );
    }
    logger.error({ err, path }, "Could not reach the Meta Graph API");
    throw ApiError.badRequest("Couldn't reach WhatsApp. Check the server's internet connection and try again.");
  }
}
