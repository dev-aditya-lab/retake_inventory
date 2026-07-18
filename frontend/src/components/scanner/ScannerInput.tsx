"use client";

import { useState } from "react";
import { Keyboard, Camera } from "lucide-react";
import { KeyboardScanner } from "./KeyboardScanner";
import { CameraScanner } from "./CameraScanner";

type Mode = "keyboard" | "camera";

/**
 * Global scanner component with two input modes: a USB/Bluetooth HID scanner
 * (or manual typing) for a fixed counter, and the device camera for
 * phones/tablets without a physical scanner.
 */
export function ScannerInput({
  onScan,
  placeholder,
  autoFocus = true,
}: {
  onScan: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("keyboard");

  return (
    <div>
      <div className="mb-2 inline-flex rounded-md border border-border p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setMode("keyboard")}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 font-medium ${
            mode === "keyboard" ? "bg-primary text-primary-foreground" : "text-muted"
          }`}
        >
          <Keyboard size={14} aria-hidden />
          Scanner
        </button>
        <button
          type="button"
          onClick={() => setMode("camera")}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 font-medium ${
            mode === "camera" ? "bg-primary text-primary-foreground" : "text-muted"
          }`}
        >
          <Camera size={14} aria-hidden />
          Camera
        </button>
      </div>

      {mode === "keyboard" ? (
        <KeyboardScanner onScan={onScan} placeholder={placeholder} autoFocus={autoFocus} />
      ) : (
        <CameraScanner onScan={onScan} />
      )}
    </div>
  );
}
