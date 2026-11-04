"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw, Tag } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { TagInput } from "@/components/customers/TagInput";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  useListWhatsappAgentsQuery,
  useListWhatsappLabelsQuery,
  useUpdateChatMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import type { ChatThread } from "@/types/whatsapp";

/** A chat's team-side details: who owns it, its labels, and whether it is done. None of this is visible to the customer. */
export function ChatCrmBar({ chat }: { chat: ChatThread["conversation"] }) {
  const { data: agents } = useListWhatsappAgentsQuery();
  const [update, { isLoading }] = useUpdateChatMutation();
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(patch: Parameters<typeof update>[0]) {
    setError(null);
    try {
      await update(patch).unwrap();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't save that change. Try again."));
    }
  }

  const resolved = chat.status === "resolved";

  return (
    <div className="border-b border-border bg-background px-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <span className="shrink-0">Assigned to</span>
          <select
            aria-label="Assigned to"
            value={chat.assignedTo?.id ?? ""}
            disabled={isLoading}
            onChange={(e) => void apply({ id: chat.id, assignedTo: e.target.value || null })}
            className="input min-h-9 max-w-40 py-1 text-xs"
          >
            <option value="">Nobody</option>
            {chat.assignedTo && !agents?.some((a) => a.id === chat.assignedTo?.id) && (
              <option value={chat.assignedTo.id}>{chat.assignedTo.name}</option>
            )}
            {agents?.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void apply({ id: chat.id, status: resolved ? "open" : "resolved" })}
          disabled={isLoading}
          className={`ml-auto flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
            resolved ? "border-border text-foreground hover:bg-ink-100" : "border-leaf-300 bg-leaf-50 text-leaf-800 hover:bg-leaf-100"
          }`}
        >
          {resolved ? <RotateCcw size={14} aria-hidden /> : <CheckCircle2 size={14} aria-hidden />}
          {resolved ? "Reopen" : "Mark resolved"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {chat.labels.map((label) => (
          <span key={label} className="rounded-full bg-leaf-100 px-2 py-0.5 text-[11px] font-medium text-leaf-800">
            {label}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setLabelsOpen(true)}
          className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-ink-100"
        >
          <Tag size={12} aria-hidden /> {chat.labels.length > 0 ? "Edit labels" : "Add label"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}

      <Modal open={labelsOpen} onClose={() => setLabelsOpen(false)} title="Labels" size="sm">
        {labelsOpen && <LabelsForm chat={chat} onClose={() => setLabelsOpen(false)} />}
      </Modal>
    </div>
  );
}

const STARTER_LABELS = ["New lead", "Wholesale", "Follow up", "Complaint", "VIP"] as const;

function LabelsForm({ chat, onClose }: { chat: ChatThread["conversation"]; onClose: () => void }) {
  const [update, { isLoading }] = useUpdateChatMutation();
  const { data: inUse } = useListWhatsappLabelsQuery();
  const [labels, setLabels] = useState(chat.labels);
  const [error, setError] = useState<string | null>(null);

  // Labels already used elsewhere come first, so the team keeps one spelling.
  const suggestions = [...new Set([...(inUse ?? []), ...STARTER_LABELS])];

  async function handleSave() {
    setError(null);
    try {
      await update({ id: chat.id, labels }).unwrap();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't save the labels. Try again."));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <TagInput tags={labels} onChange={setLabels} suggestions={suggestions} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={isLoading}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {isLoading ? "Saving…" : "Save labels"}
      </button>
    </div>
  );
}
