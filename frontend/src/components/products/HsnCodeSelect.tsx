"use client";

import { useListHsnCodesQuery } from "@/lib/redux/features/catalog/catalogApi";

/**
 * HSN/SAC picker backed by the admin-managed HSN list. A product whose
 * current code isn't in the list (e.g. imported from a spreadsheet) still
 * shows it, so opening a product never silently blanks its HSN.
 */
export function HsnCodeSelect({
  value,
  onChange,
  className = "input",
}: {
  value: string;
  onChange: (code: string) => void;
  className?: string;
}) {
  const { data: codes, isLoading, isError } = useListHsnCodesQuery();
  const isKnown = !value || codes?.some((c) => c.code === value);

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className} disabled={isLoading}>
      <option value="">{isLoading ? "Loading…" : isError ? "Couldn't load HSN list" : "— None —"}</option>
      {!isKnown && <option value={value}>{value} (not in HSN list)</option>}
      {codes?.map((c) => (
        <option key={c._id} value={c.code}>
          {c.code}
          {c.description ? ` — ${c.description}` : ""}
          {c.gstRate !== undefined ? ` (${c.gstRate}%)` : ""}
        </option>
      ))}
    </select>
  );
}
