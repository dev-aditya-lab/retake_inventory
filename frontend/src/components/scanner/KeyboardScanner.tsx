"use client";

import { useState, type FormEvent } from "react";
import { ScanBarcode } from "lucide-react";
import { playBeep } from "@/lib/playBeep";

/**
 * Captures input from a USB/Bluetooth HID barcode scanner, which behaves
 * like a keyboard: it types the code's digits then an Enter keystroke. A
 * plain auto-focused text input submitting on Enter handles that natively —
 * no special key-timing detection needed. Also works for manual typing.
 */
export function KeyboardScanner({
  onScan,
  placeholder = "Scan or type a barcode…",
  autoFocus = true,
}: {
  onScan: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const code = value.trim();
    if (!code) return;
    playBeep();
    onScan(code);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <ScanBarcode size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          inputMode="numeric"
          className="input w-full pl-9"
        />
      </div>
      <button type="submit" className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
        Go
      </button>
    </form>
  );
}
