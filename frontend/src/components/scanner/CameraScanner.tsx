"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { playBeep } from "@/lib/playBeep";

const DUPLICATE_SUPPRESS_MS = 2000;

// Decoding every video frame is expensive CPU work and makes the preview
// itself look janky. A few attempts per second is plenty for reading a
// barcode a user is holding up to the camera.
const DELAY_BETWEEN_SCAN_ATTEMPTS_MS = 300;

// We only ever need to recognize EAN-13 — restricting the format cuts the
// per-frame work further (no point trying every barcode symbology).
const HINTS = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]]]);

/** Live camera viewfinder that decodes barcodes via the device camera — for phones/tablets without a HID scanner. */
export function CameraScanner({ onScan }: { onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let stopped = false;
    let controls: { stop: () => void } | undefined;

    // React Strict Mode (dev only) synchronously mounts, cleans up, and
    // re-mounts every effect once. Starting getUserMedia directly here would
    // fire it twice concurrently on the same <video> element — the
    // throwaway first stream's stop() nulls the element's srcObject, which
    // can happen *after* the real second stream has already attached,
    // leaving a black frame even though the camera stays on. Deferring by a
    // macrotask lets the throwaway invocation's cleanup (stopped = true) run
    // before its callback ever fires, so it never touches the camera at all
    // — only the surviving invocation does.
    const timer = setTimeout(() => {
      if (stopped) return;

      const reader = new BrowserMultiFormatReader(HINTS, {
        delayBetweenScanAttempts: DELAY_BETWEEN_SCAN_ATTEMPTS_MS,
      });
      let lastCode = "";
      let lastScanTime = 0;

      reader
        .decodeFromConstraints(
          { video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } } },
          video,
          (result) => {
            if (stopped || !result) return;
            const code = result.getText();
            const now = Date.now();
            if (code === lastCode && now - lastScanTime < DUPLICATE_SUPPRESS_MS) return;
            lastCode = code;
            lastScanTime = now;
            playBeep();
            onScanRef.current(code);
          },
        )
        .then((c) => {
          if (stopped) {
            c.stop();
          } else {
            controls = c;
          }
        })
        .catch(() => {
          if (!stopped) setError("Could not access the camera. Check permissions and try again.");
        });
    }, 0);

    return () => {
      stopped = true;
      clearTimeout(timer);
      controls?.stop();
    };
  }, []);

  if (error) {
    return <p className="rounded-md border border-border bg-surface p-3 text-sm text-danger">{error}</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live camera feed, not prerecorded media */}
      <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
    </div>
  );
}
