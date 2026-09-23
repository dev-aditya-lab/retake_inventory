"use client";

import { UQC_OPTIONS, VALID_GST_RATES } from "@/config/gst";

export function GstRateSelect({ value, onChange }: { value: string; onChange: (rate: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
      <option value="">— Choose —</option>
      {VALID_GST_RATES.map((rate) => (
        <option key={rate} value={String(rate)}>
          {rate}%{rate === 5 ? " (spices & masalas)" : ""}
        </option>
      ))}
    </select>
  );
}

export function UqcSelect({ value, onChange }: { value: string; onChange: (uqc: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
      {UQC_OPTIONS.map((u) => (
        <option key={u.code} value={u.code}>
          {u.label}
        </option>
      ))}
    </select>
  );
}
