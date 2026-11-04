import { WhatsappQuickReply } from "../models/WhatsappQuickReply.model";
import { ApiError } from "../utils/ApiError";

export interface QuickReplyDto {
  id: string;
  title: string;
  text: string;
  position: number;
}

export interface QuickReplyInput {
  title: string;
  text: string;
}

const MAX_QUICK_REPLIES = 50;

function toDto(row: { _id: unknown; title: string; text: string; position?: number | null }): QuickReplyDto {
  return { id: String(row._id), title: row.title, text: row.text, position: row.position ?? 0 };
}

export async function listQuickReplies(): Promise<QuickReplyDto[]> {
  const rows = await WhatsappQuickReply.find().sort({ position: 1, title: 1 }).limit(MAX_QUICK_REPLIES).lean();
  return rows.map(toDto);
}

export async function createQuickReply(input: QuickReplyInput, userId: string): Promise<QuickReplyDto> {
  if ((await WhatsappQuickReply.estimatedDocumentCount()) >= MAX_QUICK_REPLIES) {
    throw ApiError.conflict(`You can save at most ${MAX_QUICK_REPLIES} quick replies. Delete one first.`);
  }
  const last = await WhatsappQuickReply.findOne().sort({ position: -1 }).select("position").lean();
  const row = await WhatsappQuickReply.create({ ...input, position: (last?.position ?? 0) + 1, createdBy: userId });
  return toDto(row);
}

export async function updateQuickReply(id: string, input: QuickReplyInput): Promise<QuickReplyDto> {
  const row = await WhatsappQuickReply.findByIdAndUpdate(id, { $set: input }, { returnDocument: "after", runValidators: true }).lean();
  if (!row) throw ApiError.notFound("Quick reply not found");
  return toDto(row);
}

export async function deleteQuickReply(id: string): Promise<void> {
  const result = await WhatsappQuickReply.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw ApiError.notFound("Quick reply not found");
}
