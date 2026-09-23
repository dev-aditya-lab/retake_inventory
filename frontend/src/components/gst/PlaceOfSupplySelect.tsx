"use client";

import { GST_STATES, GST_STATE_OPTIONS } from "@/config/gst";

/**
 * Place of supply (GST state). "Auto" leaves it to the rules: the GSTIN's
 * state for a registered buyer, the shop's own state otherwise.
 */
export function PlaceOfSupplySelect({
  value,
  autoCode,
  onChange,
  className = "input",
  id,
}: {
  /** Chosen state code, or "" for auto. */
  value: string;
  /** What "auto" currently resolves to, shown in its label. */
  autoCode: string;
  onChange: (code: string) => void;
  className?: string;
  id?: string;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">Auto — {GST_STATES[autoCode] ?? autoCode}</option>
      {GST_STATE_OPTIONS.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name} ({s.code})
        </option>
      ))}
    </select>
  );
}
