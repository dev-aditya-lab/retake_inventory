"use client";

import { useState } from "react";
import { RequireRole } from "@/components/auth/RequireRole";
import { GstReadinessPanel } from "@/components/gst/GstReadinessPanel";
import { Gstr1Panel } from "@/components/gst/Gstr1Panel";
import { Gstr3bPanel } from "@/components/gst/Gstr3bPanel";
import { FiledMonthsPanel } from "@/components/gst/FiledMonthsPanel";
import { PeriodPicker, type Frequency } from "@/components/gst/PeriodPicker";
import { currentGstPeriod, shiftPeriod } from "@/lib/gstPeriods";
import type { PeriodRange } from "@/lib/redux/features/gst/gstApi";

type Tab = "setup" | "gstr1" | "gstr3b" | "filed";

const TABS: { id: Tab; label: string }[] = [
  { id: "setup", label: "Setup check" },
  { id: "gstr1", label: "GSTR-1" },
  { id: "gstr3b", label: "GSTR-3B" },
  { id: "filed", label: "Filed months" },
];

export default function GstPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can manage GST returns.">
      <GstWorkspace />
    </RequireRole>
  );
}

function GstWorkspace() {
  const [tab, setTab] = useState<Tab>("setup");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  // Returns are filed for last month, so open on it.
  const [range, setRange] = useState<PeriodRange>(() => ({ from: shiftPeriod(currentGstPeriod(), -1) }));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-foreground">GST</h1>
      <p className="mt-1 text-sm text-muted">
        Check your setup, download the GSTR-1 file for the GST portal, and see the GSTR-3B figures.
      </p>

      <div role="tablist" aria-label="GST sections" className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-border p-1 sm:grid-cols-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted hover:bg-ink-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "gstr1" || tab === "gstr3b") && (
        <div className="mt-4">
          <PeriodPicker frequency={frequency} onFrequencyChange={setFrequency} range={range} onRangeChange={setRange} />
        </div>
      )}

      {tab === "setup" && <GstReadinessPanel />}
      {tab === "gstr1" && <Gstr1Panel range={range} />}
      {tab === "gstr3b" && <Gstr3bPanel range={range} />}
      {tab === "filed" && <FiledMonthsPanel />}
    </div>
  );
}
