import axios from "axios";
import { logger } from "../config/logger";
import { ApiError } from "../utils/ApiError";
import { describeGraphError } from "../utils/metaGraph";
import {
  buildProfilePayload,
  displayNameProblem,
  parseProfile,
  PROFILE_PICTURE_MAX_BYTES,
  PROFILE_PICTURE_TYPES,
  profileProblems,
  type BusinessProfile,
  type ProfileUpdate,
} from "../utils/whatsappProfile";
import { graph } from "./metaGraph.service";
import { getWhatsappConfig, type WhatsappConfig } from "./whatsappConfig.service";

/**
 * The shop's WhatsApp Business profile: the picture, About line, description,
 * category, address, email and links customers see on the shop's contact card,
 * all read and changed through Meta's API (no Facebook login involved).
 */

const FIELDS = "about,address,description,email,profile_picture_url,websites,vertical";

async function phoneNumberId(): Promise<{ config: WhatsappConfig; id: string }> {
  const config = await getWhatsappConfig();
  if (!config.phoneNumberId) throw ApiError.badRequest("Add the phone number ID under WhatsApp > Settings first");
  return { config, id: config.phoneNumberId };
}

export async function getProfile(): Promise<BusinessProfile & { displayName: string; displayNameStatus: string; pendingDisplayName: string }> {
  const { config, id } = await phoneNumberId();
  const [profile, phone] = await Promise.all([
    graph("GET", `${id}/whatsapp_business_profile`, { config, params: { fields: FIELDS } }),
    graph<{ verified_name?: string; name_status?: string; new_display_name?: string; new_name_status?: string }>("GET", id, {
      config,
      params: { fields: "verified_name,name_status,new_display_name,new_name_status" },
    }).catch(() => ({}) as { verified_name?: string; name_status?: string; new_display_name?: string; new_name_status?: string }),
  ]);

  const pending = phone.new_name_status && phone.new_name_status !== "NONE" ? phone.new_name_status : "";
  return {
    ...parseProfile(profile),
    displayName: phone.verified_name ?? "",
    displayNameStatus: phone.name_status ?? "",
    pendingDisplayName: pending ? (phone.new_display_name ?? "") : "",
  };
}

export async function updateProfile(update: ProfileUpdate, pictureHandle?: string): Promise<void> {
  const problems = profileProblems(update);
  if (problems.length > 0) throw ApiError.badRequest(problems[0]!, problems);

  const { config, id } = await phoneNumberId();
  await graph("POST", `${id}/whatsapp_business_profile`, { config, data: buildProfilePayload(update, pictureHandle) });
}

/** Meta needs the app id for its resumable upload; fall back to asking which app the token belongs to. */
async function appIdFor(config: WhatsappConfig): Promise<string> {
  if (config.appId) return config.appId;
  const info = await graph<{ data?: { app_id?: string } }>("GET", "debug_token", {
    config,
    params: { input_token: config.accessToken },
  });
  if (!info.data?.app_id) throw ApiError.badRequest("Add the App ID under WhatsApp > Settings to change the picture");
  return String(info.data.app_id);
}

/**
 * Changes the profile picture. Meta's flow: open an upload session on the app,
 * send the file bytes into it (which returns a handle), then point the profile
 * at that handle.
 */
export async function updateProfilePicture(file: { buffer: Buffer; mimetype: string; originalname: string; size: number }): Promise<void> {
  if (!(PROFILE_PICTURE_TYPES as readonly string[]).includes(file.mimetype)) {
    throw ApiError.badRequest("The picture must be a JPEG or PNG");
  }
  if (file.size > PROFILE_PICTURE_MAX_BYTES) throw ApiError.badRequest("The picture is too large. The limit is 5 MB");

  const { config } = await phoneNumberId();
  const appId = await appIdFor(config);

  const session = await graph<{ id?: string }>("POST", `${appId}/uploads`, {
    config,
    params: { file_length: file.size, file_type: file.mimetype, file_name: file.originalname },
  });
  if (!session.id) throw ApiError.badRequest("WhatsApp didn't open an upload. Try again.");

  let handle: string | undefined;
  try {
    // The upload step authenticates with "OAuth", not "Bearer", and takes the raw bytes.
    const response = await axios.post<{ h?: string }>(`${config.apiUrl}/${session.id}`, file.buffer, {
      headers: { Authorization: `OAuth ${config.accessToken}`, file_offset: "0", "Content-Type": "application/octet-stream" },
      maxBodyLength: PROFILE_PICTURE_MAX_BYTES + 1024,
      timeout: 60_000,
    });
    handle = response.data?.h;
  } catch (err) {
    logger.warn({ err }, "Profile picture upload to Meta failed");
    const reason = axios.isAxiosError(err) ? describeGraphError(err.response?.data, "the upload was refused") : "the upload failed";
    throw ApiError.badRequest(`WhatsApp: ${reason}`);
  }
  if (!handle) throw ApiError.badRequest("WhatsApp didn't accept the picture. Use a square JPEG or PNG of at least 192 px.");

  await updateProfile({}, handle);
}

/** Asks WhatsApp to change the verified display name. It is reviewed by Meta and can take days. */
export async function requestDisplayName(name: string): Promise<void> {
  const problem = displayNameProblem(name);
  if (problem) throw ApiError.badRequest(problem);
  const { config, id } = await phoneNumberId();
  await graph("POST", id, { config, data: { new_display_name: name.trim() } });
}
