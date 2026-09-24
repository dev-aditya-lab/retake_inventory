"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { RefreshCw, Zap, ZapOff } from "lucide-react";
import { playBeep } from "@/lib/playBeep";
import { toEan13 } from "@/lib/ean13";
import { createEngine, type BarcodeEngine } from "@/lib/scanner/engine";
import {
  describeCameraError,
  enableContinuousFocus,
  focusOnce,
  openCamera,
  readCapabilities,
  setTorch,
  setZoom,
  type CameraCapabilities,
} from "@/lib/scanner/camera";
import { SCAN_GUIDE, scanWindow, toVideoPoint } from "@/lib/scanner/roi";
import { ScanGate } from "@/lib/scanner/scanGate";

// A decode every ~60 ms is about as fast as a hand-held barcode needs and keeps
// the phone cool; the read itself takes a few ms (see lib/scanner/engine.ts).
const MIN_FRAME_INTERVAL_MS = 60;
// The phone's own detector failing this many times in a row → switch to the WebAssembly one.
const MAX_ENGINE_ERRORS = 3;
const ZOOM_STEPS = [1, 2, 3];
const ZOOM_STORAGE_KEY = "retake.scanner.zoom";
const LAST_CODE_SHOWN_MS = 900;

function loadSavedZoom(): number {
  try {
    return Number(localStorage.getItem(ZOOM_STORAGE_KEY)) || 1;
  } catch {
    return 1;
  }
}

function saveZoom(zoom: number) {
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
  } catch {
    // A remembered zoom is a convenience — private mode or blocked storage is fine.
  }
}

/**
 * Live camera viewfinder that reads EAN-13 barcodes for phones/tablets without
 * a HID scanner. Built for small packs: a sharp 1080p image with continuous
 * autofocus, only the guide box is decoded (so nearby packs are ignored), a
 * fast decoder, zoom for tiny barcodes, and a torch for dim markets. The
 * camera stays open between scans, so a cashier can scan pack after pack.
 */
export function CameraScanner({ onScan }: { onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const capabilitiesRef = useRef<CameraCapabilities | null>(null);
  const onScanRef = useRef(onScan);

  const [status, setStatus] = useState<"starting" | "scanning">("starting");
  const [error, setError] = useState<string | null>(null);
  const [engineName, setEngineName] = useState<BarcodeEngine["name"] | null>(null);
  const [capabilities, setCapabilities] = useState<CameraCapabilities | null>(null);
  const [zoom, setZoomLevel] = useState(1);
  const [torchOn, setTorchOn] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [restartKey, setRestartKey] = useState(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let stopped = false;
    // Everything acquired so far (camera, wake lock, timers…), released in reverse order.
    const disposers: (() => void)[] = [];
    const dispose = () => {
      while (disposers.length > 0) disposers.pop()!();
    };

    async function run(video: HTMLVideoElement) {
      // Start loading the decoder while the camera opens, so neither waits for the other.
      const enginePromise = createEngine();
      enginePromise.catch(() => undefined); // reported below, once the camera is up

      const stream = await openCamera();
      disposers.push(() => stream.getTracks().forEach((track) => track.stop()));
      if (stopped) return dispose();

      const track = stream.getVideoTracks()[0]!;
      trackRef.current = track;
      track.addEventListener("ended", () => {
        if (!stopped) setError("The camera stopped. Tap Restart to try again.");
      });

      video.srcObject = stream;
      disposers.push(() => {
        video.srcObject = null;
      });
      await video.play().catch(() => undefined);
      if (stopped) return dispose();

      const caps = readCapabilities(track);
      capabilitiesRef.current = caps;
      setCapabilities(caps);
      if (caps.continuousFocus) void enableContinuousFocus(track);

      const savedZoom = loadSavedZoom();
      if (caps.zoom && savedZoom > 1) {
        const level = Math.min(caps.zoom.max, Math.max(caps.zoom.min, savedZoom));
        if (await setZoom(track, level)) setZoomLevel(level);
      }

      // Keep the screen on while scanning — a locked phone mid-sale is a lost minute.
      const requestWakeLock = () => {
        void navigator.wakeLock
          ?.request("screen")
          .then((lock) => {
            if (stopped) void lock.release();
            else disposers.push(() => void lock.release());
          })
          .catch(() => undefined);
      };
      requestWakeLock();
      const onVisible = () => {
        if (document.visibilityState !== "visible" || stopped) return;
        if (track.readyState === "ended") setError("The camera stopped. Tap Restart to try again.");
        else requestWakeLock();
      };
      document.addEventListener("visibilitychange", onVisible);
      disposers.push(() => document.removeEventListener("visibilitychange", onVisible));

      let engine: BarcodeEngine;
      try {
        engine = await enginePromise;
      } catch {
        if (!stopped) setError("The barcode reader could not load. Check your connection and tap Restart, or search for the product below.");
        return dispose();
      }
      if (stopped) return dispose();
      setEngineName(engine.name);
      setStatus("scanning");

      const gate = new ScanGate();
      let engineErrors = 0;
      let lastRunAt = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      disposers.push(() => clearTimeout(timer));

      function handleRead(code: string) {
        playBeep();
        navigator.vibrate?.(40);
        setLastCode(code);
        setTimeout(() => setLastCode((shown) => (shown === code ? null : shown)), LAST_CODE_SHOWN_MS);
        onScanRef.current(code);
      }

      async function tick() {
        if (stopped) return;
        lastRunAt = performance.now();
        try {
          if (video.videoWidth > 0 && video.clientWidth > 0 && !video.paused) {
            const window = scanWindow(
              { width: video.videoWidth, height: video.videoHeight },
              { width: video.clientWidth, height: video.clientHeight },
            );
            for (const text of await engine.detect(video, window)) {
              const code = toEan13(text);
              if (code && gate.accept(code, Date.now())) handleRead(code);
            }
            engineErrors = 0;
          }
        } catch {
          engineErrors += 1;
          if (engine.name === "native" && engineErrors >= MAX_ENGINE_ERRORS) {
            try {
              engine = await createEngine("wasm");
              setEngineName(engine.name);
              engineErrors = 0;
            } catch {
              // Keep trying the current engine; the next tick will retry.
            }
          }
        }
        schedule();
      }

      function schedule() {
        if (stopped) return;
        timer = setTimeout(() => void tick(), Math.max(0, MIN_FRAME_INTERVAL_MS - (performance.now() - lastRunAt)));
      }

      schedule();
    }

    // React Strict Mode (dev only) synchronously mounts, cleans up, and
    // re-mounts every effect once. Starting getUserMedia directly here would
    // fire it twice concurrently on the same <video> element — the
    // throwaway first stream's stop() nulls the element's srcObject, which
    // can happen *after* the real second stream has already attached,
    // leaving a black frame even though the camera stays on. Deferring by a
    // macrotask lets the throwaway invocation's cleanup (stopped = true) run
    // before its callback ever fires, so it never touches the camera at all
    // — only the surviving invocation does.
    const starter = setTimeout(() => {
      if (stopped) return;
      setError(null);
      setStatus("starting");
      run(video).catch((err) => {
        if (stopped) return;
        setError(describeCameraError(err));
        dispose();
      });
    }, 0);

    return () => {
      stopped = true;
      clearTimeout(starter);
      trackRef.current = null;
      capabilitiesRef.current = null;
      dispose();
    };
  }, [restartKey]);

  async function handleZoom(level: number) {
    const track = trackRef.current;
    if (track && (await setZoom(track, level))) {
      setZoomLevel(level);
      saveZoom(level);
    }
  }

  async function handleTorch() {
    const track = trackRef.current;
    if (track && (await setTorch(track, !torchOn))) setTorchOn((on) => !on);
  }

  function handleTapToFocus(e: MouseEvent<HTMLDivElement>) {
    const track = trackRef.current;
    const caps = capabilitiesRef.current;
    const video = videoRef.current;
    if (!track || !caps || !video || !video.videoWidth) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = toVideoPoint(
      { width: video.videoWidth, height: video.videoHeight },
      { width: rect.width, height: rect.height },
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
    );
    void focusOnce(track, caps, point);
  }

  const zoomSteps = capabilities?.zoom
    ? ZOOM_STEPS.filter((step) => step >= capabilities.zoom!.min && step <= capabilities.zoom!.max)
    : [];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black">
      {/* Tap the preview to refocus. */}
      <div className="relative aspect-[4/3] w-full sm:aspect-video" onClick={handleTapToFocus}>
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />

        {/* The guide box: only what's inside it is read. Drawn from the same numbers the decoder uses. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={`rounded-lg border-2 ${lastCode ? "border-green-400 bg-green-400/20" : "border-white/80"}`}
            style={{ width: `${SCAN_GUIDE.widthFraction * 100}%`, height: `${SCAN_GUIDE.heightFraction * 100}%` }}
          />
        </div>

        {engineName && (
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/80">
            {engineName === "native" ? "Phone scanner" : "Enhanced scanner"}
          </span>
        )}

        {lastCode && (
          <p role="status" className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded bg-green-600 px-2 py-1 text-xs font-medium text-white">
            ✓ {lastCode}
          </p>
        )}

        {status === "starting" && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting camera…</p>
        )}

        {error && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center">
            <p className="text-sm text-white">{error}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRestartKey((key) => key + 1);
              }}
              className="flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-medium text-black"
            >
              <RefreshCw size={14} aria-hidden />
              Restart camera
            </button>
          </div>
        )}

        {!error && (
          <div
            className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] leading-tight text-white/90">
              Fill the box with the barcode, about 12 cm away.
              {zoomSteps.length > 1 && <span className="block">Tiny barcode? Try 2×.</span>}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {zoomSteps.length > 1 &&
                zoomSteps.map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => void handleZoom(step)}
                    aria-pressed={zoom === step}
                    className={`min-w-10 rounded-md px-2 py-2 text-xs font-semibold ${
                      zoom === step ? "bg-white text-black" : "bg-black/60 text-white"
                    }`}
                  >
                    {step}×
                  </button>
                ))}
              {capabilities?.torch && (
                <button
                  type="button"
                  onClick={() => void handleTorch()}
                  aria-pressed={torchOn}
                  aria-label={torchOn ? "Turn the light off" : "Turn the light on"}
                  className={`rounded-md p-2 ${torchOn ? "bg-yellow-300 text-black" : "bg-black/60 text-white"}`}
                >
                  {torchOn ? <Zap size={16} aria-hidden /> : <ZapOff size={16} aria-hidden />}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
