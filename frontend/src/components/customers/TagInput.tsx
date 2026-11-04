"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { addTag, MAX_CUSTOMER_TAGS, MAX_TAG_LENGTH, SUGGESTED_TAGS } from "@/lib/customerTags";

/** Up to five short labels on a customer: tap a suggestion or type your own and press Enter. */
export function TagInput({
  tags,
  onChange,
  suggestions: offered = SUGGESTED_TAGS,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** One-tap choices shown under the box. */
  suggestions?: readonly string[];
}) {
  const [draft, setDraft] = useState("");
  const full = tags.length >= MAX_CUSTOMER_TAGS;

  function commit() {
    onChange(addTag(tags, draft));
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault(); // Enter must not submit the surrounding form
      commit();
    } else if (e.key === "Backspace" && !draft && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  const suggestions = offered.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()));

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Labels">
          {tags.map((tag) => (
            <li
              key={tag}
              className="flex items-center gap-1 rounded-full bg-leaf-100 py-1 pl-2.5 pr-1 text-xs font-medium text-leaf-800"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                aria-label={`Remove ${tag}`}
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-leaf-200"
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        value={draft}
        maxLength={MAX_TAG_LENGTH}
        disabled={full}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => draft.trim() && commit()}
        placeholder={full ? `Up to ${MAX_CUSTOMER_TAGS} labels` : "Type a label and press Enter"}
        aria-label="Add a label"
        className="input"
      />

      {!full && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(addTag(tags, s))}
              className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-ink-100"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
