import { ExternalLink, Phone, Reply } from "lucide-react";
import { fillVariables, lowerWords } from "@/lib/whatsapp";
import type { TemplateDetail, TemplateValues } from "@/types/whatsapp";

const STATUS_TONE: Record<string, string> = {
  APPROVED: "bg-leaf-100 text-leaf-800",
  REINSTATED: "bg-leaf-100 text-leaf-800",
  REJECTED: "bg-chilli-100 text-chilli-800",
  DISABLED: "bg-chilli-100 text-chilli-800",
  PAUSED: "bg-chilli-100 text-chilli-800",
  FLAGGED: "bg-chilli-100 text-chilli-800",
};

const QUALITY_TONE: Record<string, string> = {
  GREEN: "bg-leaf-100 text-leaf-800",
  YELLOW: "bg-ink-200 text-ink-800",
  RED: "bg-chilli-100 text-chilli-800",
};

export function Chip({ label, tone }: { label: string; tone?: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone ?? "bg-ink-100 text-ink-700"}`}>{label}</span>
  );
}

/** Status, quality and category of a template as small coloured chips. */
export function TemplateChips({ template }: { template: Pick<TemplateDetail, "status" | "quality" | "category"> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {template.status && <Chip label={lowerWords(template.status)} tone={STATUS_TONE[template.status]} />}
      {template.quality && template.quality !== "UNKNOWN" && (
        <Chip label={`quality ${lowerWords(template.quality)}`} tone={QUALITY_TONE[template.quality]} />
      )}
      {template.category && <Chip label={lowerWords(template.category)} />}
    </div>
  );
}

const BUTTON_ICON = { URL: ExternalLink, PHONE_NUMBER: Phone, QUICK_REPLY: Reply } as const;

/**
 * What the customer will see: a chat bubble with the template's header, body,
 * footer and buttons. With `values`, the variables are filled in as typed.
 */
export function TemplatePreview({ template, values }: { template: TemplateDetail; values?: TemplateValues }) {
  if (!template.hasContent) {
    return <p className="text-xs text-muted">The message text isn&apos;t loaded yet. Sync templates to see it.</p>;
  }

  const header = template.headerFormat === "TEXT" ? fillVariables(template.headerText, template.headerVariables, values?.header) : "";
  const mediaHeader = ["IMAGE", "VIDEO", "DOCUMENT"].includes(template.headerFormat) ? template.headerFormat.toLowerCase() : "";

  return (
    <div className="max-w-full rounded-2xl rounded-tl-sm border border-border bg-leaf-50 px-3 py-2 text-sm text-foreground">
      {mediaHeader && <p className="mb-1 rounded bg-ink-100 px-2 py-4 text-center text-xs text-muted">[{mediaHeader}]</p>}
      {header && <p className="mb-1 font-semibold [overflow-wrap:anywhere]">{header}</p>}
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{fillVariables(template.bodyText, template.bodyVariables, values?.body)}</p>
      {template.footerText && <p className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{template.footerText}</p>}
      {template.buttons.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          {template.buttons.map((button, i) => {
            const Icon = BUTTON_ICON[button.type as keyof typeof BUTTON_ICON];
            return (
              <li key={`${button.text}-${i}`} className="flex items-center justify-center gap-1.5 text-sm font-medium text-leaf-700">
                {Icon && <Icon size={14} aria-hidden />}
                <span className="[overflow-wrap:anywhere]">{button.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
