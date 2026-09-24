"use client";

import { useState, useSyncExternalStore } from "react";
import { Keyboard, Camera } from "lucide-react";
import { KeyboardScanner } from "./KeyboardScanner";
import { CameraScanner } from "./CameraScanner";
import type { Product } from "@/types/product";

type Mode = "keyboard" | "camera";

const MODE_STORAGE_KEY = "retake.scanner.mode";
const noopSubscribe = () => () => {};

function readSavedMode(): Mode {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === "camera" ? "camera" : "keyboard";
  } catch {
    return "keyboard";
  }
}

/**
 * Global scanner component with two input modes: a USB/Bluetooth HID scanner
 * (or manual typing) for a fixed counter, and the device camera for
 * phones/tablets without a physical scanner.
 *
 * It remembers the last mode used — a cashier on a phone shouldn't have to
 * switch to the camera on every visit — and under the camera there is always
 * a box to type into, so a barcode that won't read never blocks a sale.
 */
export function ScannerInput({
  onScan,
  onPickProduct,
  placeholder,
  autoFocus = true,
}: {
  onScan: (code: string) => void;
  /** Lets the manual box add products directly by name / SKU / last barcode digits. */
  onPickProduct?: (product: Product) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  // null on the server and during hydration → nothing wrong-mode is ever mounted (no stray focus, no camera prompt).
  const savedMode = useSyncExternalStore<Mode | null>(noopSubscribe, readSavedMode, () => null);
  const [chosenMode, setChosenMode] = useState<Mode | null>(null);
  const mode = chosenMode ?? savedMode;

  function chooseMode(next: Mode) {
    setChosenMode(next);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // Remembering the choice is a convenience only.
    }
  }

  return (
    <div>
      <div className="mb-2 inline-flex rounded-md border border-border p-0.5 text-xs">
        <button
          type="button"
          onClick={() => chooseMode("keyboard")}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 font-medium ${
            mode === "keyboard" ? "bg-primary text-primary-foreground" : "text-muted"
          }`}
        >
          <Keyboard size={14} aria-hidden />
          Scanner
        </button>
        <button
          type="button"
          onClick={() => chooseMode("camera")}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 font-medium ${
            mode === "camera" ? "bg-primary text-primary-foreground" : "text-muted"
          }`}
        >
          <Camera size={14} aria-hidden />
          Camera
        </button>
      </div>

      {mode === "keyboard" && (
        <KeyboardScanner onScan={onScan} onPickProduct={onPickProduct} placeholder={placeholder} autoFocus={autoFocus} />
      )}

      {mode === "camera" && (
        <div className="flex flex-col gap-2">
          <CameraScanner onScan={onScan} />
          {/* The way out when a barcode just won't read. Not auto-focused: that would pop the keyboard over the camera. */}
          <KeyboardScanner
            onScan={onScan}
            onPickProduct={onPickProduct}
            placeholder={onPickProduct ? "Won't scan? Type a name or last digits…" : "Won't scan? Type the barcode…"}
            autoFocus={false}
          />
        </div>
      )}
    </div>
  );
}
