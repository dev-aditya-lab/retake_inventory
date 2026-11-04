import { z } from "zod";
import { MAX_TEXT_LENGTH } from "../utils/whatsappChat";
import { TEMPLATE_LIMITS, TEMPLATE_NAME_PATTERN } from "../utils/whatsappTemplates";
import { objectIdSchema, paginationQuerySchema } from "./common.validators";

export const listChatsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  filter: z.enum(["all", "unread", "needs_reply", "mine", "unassigned", "resolved"]).default("all"),
  label: z.string().trim().max(20).optional(),
});

export const threadQuerySchema = z.object({
  /** How many of the newest messages to return; ask for more to load earlier history. */
  limit: z.coerce.number().int().min(1).max(300).default(50),
});

export const setServiceSchema = z.object({ enabled: z.boolean() });

export const sendChatMessageSchema = z.object({
  text: z.string().max(MAX_TEXT_LENGTH, `Messages can be at most ${MAX_TEXT_LENGTH} characters`),
  /** A message of this chat to quote. */
  replyTo: objectIdSchema.optional(),
});

// ---------------------------------------------------------------------------
// Connection settings (admin)
// ---------------------------------------------------------------------------

/** "" clears the saved value (falls back to the server environment). */
const numericId = (label: string) =>
  z.union([z.literal(""), z.string().trim().regex(/^\d{5,25}$/, `${label} should be digits only`)]);

const noSpaces = /^\S+$/;

export const saveConfigSchema = z.object({
  phoneNumberId: numericId("Phone number ID").optional(),
  businessAccountId: numericId("Business account ID").optional(),
  appId: numericId("App ID").optional(),
  apiVersion: z.union([z.literal(""), z.string().trim().regex(/^v\d{1,2}\.\d$/, "Use a version like v22.0")]).optional(),
  accessToken: z.union([z.literal(""), z.string().trim().min(20, "That access token looks too short").max(1000).regex(noSpaces, "The token can't contain spaces")]).optional(),
  verifyToken: z.union([z.literal(""), z.string().trim().min(8, "Use at least 8 characters").max(128).regex(noSpaces, "The verify token can't contain spaces")]).optional(),
  appSecret: z.union([z.literal(""), z.string().trim().regex(/^[A-Za-z0-9]{16,128}$/, "The app secret should be letters and digits only")]).optional(),
  clear: z.array(z.enum(["accessToken", "verifyToken", "appSecret"])).max(3).optional(),
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const variableValue = z.string().max(1024);

export const templateValuesSchema = z.object({
  header: z.array(variableValue).max(1).optional(),
  body: z.array(variableValue).max(20).optional(),
  headerMediaUrl: z.string().trim().max(2000).optional(),
  buttonUrlValues: z.array(z.string().max(500)).max(10).optional(),
});

export const sendTemplateSchema = z.object({
  templateId: objectIdSchema,
  values: templateValuesSchema.default({}),
});

const buttonText = z.string().trim().min(1).max(TEMPLATE_LIMITS.buttonText, `Button text can be at most ${TEMPLATE_LIMITS.buttonText} characters`);

export const createTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(TEMPLATE_NAME_PATTERN, "Use lowercase letters, digits and underscores only, e.g. order_ready"),
  language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, "Use a language code like en or en_US"),
  category: z.enum(["UTILITY", "MARKETING"]),
  header: z.string().trim().max(TEMPLATE_LIMITS.header).optional(),
  headerExample: z.string().trim().max(TEMPLATE_LIMITS.example).optional(),
  body: z.string().trim().min(1, "Write the message").max(TEMPLATE_LIMITS.body),
  bodyExamples: z.array(z.string().trim().max(TEMPLATE_LIMITS.example)).max(20).default([]),
  footer: z.string().trim().max(TEMPLATE_LIMITS.footer).optional(),
  buttons: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("QUICK_REPLY"), text: buttonText }),
        z.object({ type: z.literal("URL"), text: buttonText, url: z.string().trim().min(1).max(2000), example: z.string().trim().max(500).optional() }),
        z.object({ type: z.literal("PHONE_NUMBER"), text: buttonText, phone: z.string().trim().regex(/^\+\d{8,15}$/, "Phone must look like +919876543210") }),
      ]),
    )
    .max(TEMPLATE_LIMITS.buttons)
    .default([]),
});

export const templateNameParamSchema = z.string().trim().regex(TEMPLATE_NAME_PATTERN, "Invalid template name");

// ---------------------------------------------------------------------------
// Other message kinds, quick replies, new chats
// ---------------------------------------------------------------------------

export const sendButtonsSchema = z.object({
  body: z.string().trim().min(1, "Type the message first").max(1024, "At most 1024 characters with buttons"),
  buttons: z.array(z.string().trim().min(1).max(20, "Button text can be at most 20 characters")).min(1).max(3),
});

export const sendMediaBodySchema = z.object({
  caption: z.string().max(1024, "Captions can be at most 1024 characters").default(""),
  // Multipart fields arrive as strings.
  saveCopy: z.enum(["true", "false"]).default("false"),
});

export const mediaSettingsSchema = z.object({ autoSave: z.boolean() });

export const quickReplySchema = z.object({
  title: z.string().trim().min(1, "Give it a short title").max(40, "Title can be at most 40 characters"),
  text: z.string().trim().min(1, "Write the message").max(MAX_TEXT_LENGTH),
});

export const startChatSchema = z.object({
  phone: z.string().trim().min(5, "Enter the phone number").max(20),
  name: z.string().trim().max(80).optional(),
});

// ---------------------------------------------------------------------------
// More message types
// ---------------------------------------------------------------------------

export const sendListSchema = z.object({
  header: z.string().trim().max(60, "Header can be at most 60 characters").optional(),
  body: z.string().trim().min(1, "Type the message first").max(1024, "At most 1024 characters"),
  button: z.string().trim().min(1, "Name the button that opens the list").max(20, "Button text can be at most 20 characters"),
  sectionTitle: z.string().trim().min(1).max(24, "Section title can be at most 24 characters").default("Options"),
  rows: z
    .array(
      z.object({
        title: z.string().trim().min(1, "Every option needs a title").max(24, "Option titles can be at most 24 characters"),
        description: z.string().trim().max(72, "Descriptions can be at most 72 characters").optional(),
      }),
    )
    .min(1, "Add at least one option")
    .max(10, "A list can have at most 10 options"),
});

export const sendCtaSchema = z.object({
  header: z.string().trim().max(60).optional(),
  body: z.string().trim().min(1, "Type the message first").max(1024, "At most 1024 characters"),
  footer: z.string().trim().max(60).optional(),
  buttonText: z.string().trim().min(1, "Name the button").max(20, "Button text can be at most 20 characters"),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => /^https:\/\/\S+$/i.test(v), "The link must start with https://"),
});

export const sendLocationSchema = z.object({
  latitude: z.number().min(-90, "Latitude must be between -90 and 90").max(90, "Latitude must be between -90 and 90"),
  longitude: z.number().min(-180, "Longitude must be between -180 and 180").max(180, "Longitude must be between -180 and 180"),
  name: z.string().trim().max(100).optional(),
  address: z.string().trim().max(200).optional(),
});

export const sendContactSchema = z.object({
  name: z.string().trim().min(1, "Enter the contact's name").max(100),
  phone: z.string().trim().min(5, "Enter the phone number").max(20),
  role: z.string().trim().max(60).optional(),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]).optional(),
});

/** One emoji (or a short sequence); empty removes the reaction. */
export const reactionSchema = z.object({ emoji: z.string().max(16) });

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export const updateConversationSchema = z
  .object({
    labels: z.array(z.string().max(20, "Labels can be at most 20 characters")).max(5, "At most 5 labels").optional(),
    assignedTo: objectIdSchema.nullable().optional(),
    status: z.enum(["open", "resolved"]).optional(),
  })
  .refine((v) => v.labels !== undefined || v.assignedTo !== undefined || v.status !== undefined, { message: "Nothing to change" });

export const addNoteSchema = z.object({
  text: z.string().trim().min(1, "Write the note first").max(2000, "Notes can be at most 2000 characters"),
});
