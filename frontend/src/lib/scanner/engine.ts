import type { ReaderOptions } from "zxing-wasm/reader";
import type { Roi } from "./roi";

/** Reads EAN-13 / UPC-A barcodes out of a window of the live camera video. */
export interface BarcodeEngine {
  /** "native" = the phone's own detector (Chrome on Android); "wasm" = ZXing C++ compiled to WebAssembly. */
  readonly name: "native" | "wasm";
  /** Decodes just `window` (video pixels) and returns every barcode text it found. */
  detect(video: HTMLVideoElement, window: Roi): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Native: the browser's built-in BarcodeDetector. On Chrome for Android it is
// backed by Google's ML Kit — hardware-accelerated and the most forgiving of
// small or slightly soft barcodes. Not available on iPhones or Firefox.
// ---------------------------------------------------------------------------

interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}
interface NativeBarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?(): Promise<string[]>;
}

async function createNativeEngine(): Promise<BarcodeEngine | null> {
  const Detector = (globalThis as { BarcodeDetector?: NativeBarcodeDetectorConstructor }).BarcodeDetector;
  if (!Detector) return null;

  try {
    const supported = (await Detector.getSupportedFormats?.()) ?? [];
    if (!supported.includes("ean_13")) return null;
    const detector = new Detector({ formats: supported.includes("upc_a") ? ["ean_13", "upc_a"] : ["ean_13"] });

    return {
      name: "native",
      async detect(video, window) {
        const bitmap = await createImageBitmap(video, window.x, window.y, window.width, window.height);
        try {
          return (await detector.detect(bitmap)).map((barcode) => barcode.rawValue);
        } finally {
          bitmap.close();
        }
      },
    };
  } catch {
    return null; // the API exists but doesn't work on this device — use the WebAssembly engine
  }
}

// ---------------------------------------------------------------------------
// WebAssembly: zxing-cpp, the actively maintained C++ ZXing, compiled to wasm.
// Far better than the old pure-JavaScript ZXing on small, low-contrast and
// slightly blurred codes, and about 5× faster per frame.
// ---------------------------------------------------------------------------

type ZXingReader = typeof import("zxing-wasm/reader");

// Where postinstall (scripts/copy-zxing-wasm.mjs) puts the .wasm. Served from
// our own origin — not the library's default CDN — so scanning still works on
// a weak market connection, and the service worker can keep it for offline use.
// The file name carries the file's hash: a library upgrade can never pair an
// old cached .wasm with new JavaScript.
const wasmUrl = (sha256: string) => `/wasm/zxing_reader.${sha256.slice(0, 12)}.wasm`;

// Speed vs. reach: only the codes we sell (EAN-13, plus UPC-A on US products),
// only the upright/rotated cases a hand-held pack produces, and one symbol —
// the one inside the guide box.
const READER_OPTIONS: ReaderOptions = {
  formats: ["EAN13", "UPCA"],
  tryHarder: true,
  tryRotate: true,
  tryInvert: false,
  tryDownscale: true,
  maxNumberOfSymbols: 1,
};

// Above this width the crop is scaled down before decoding: a 4K stream would
// only cost time. A normal 1080p scan window is never scaled.
const MAX_DECODE_WIDTH = 1600;

let zxingReady: Promise<ZXingReader> | null = null;

/** Loads and instantiates the wasm module once per page; later calls reuse it. */
function loadZXing(): Promise<ZXingReader> {
  zxingReady ??= (async () => {
    const zxing = await import("zxing-wasm/reader");
    const url = wasmUrl(zxing.ZXING_WASM_SHA256);
    await zxing.prepareZXingModule({
      overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? url : prefix + path) },
      fireImmediately: true,
    });
    return zxing;
  })().catch((err) => {
    zxingReady = null; // let the next attempt try again (e.g. the network came back)
    throw err;
  });
  return zxingReady;
}

async function createWasmEngine(): Promise<BarcodeEngine> {
  const zxing = await loadZXing();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available");

  return {
    name: "wasm",
    async detect(video, window) {
      const scale = Math.min(1, MAX_DECODE_WIDTH / window.width);
      const width = Math.max(1, Math.round(window.width * scale));
      const height = Math.max(1, Math.round(window.height * scale));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      context.drawImage(video, window.x, window.y, window.width, window.height, 0, 0, width, height);
      const results = await zxing.readBarcodes(context.getImageData(0, 0, width, height), READER_OPTIONS);
      return results.filter((result) => result.isValid).map((result) => result.text);
    },
  };
}

/**
 * The best engine this device can run: the phone's own detector when it has
 * one, otherwise WebAssembly. `prefer: "wasm"` skips the native one (used to
 * fall back if it misbehaves).
 */
export async function createEngine(prefer: "auto" | "wasm" = "auto"): Promise<BarcodeEngine> {
  if (prefer === "auto") {
    const native = await createNativeEngine();
    if (native) return native;
  }
  return createWasmEngine();
}
