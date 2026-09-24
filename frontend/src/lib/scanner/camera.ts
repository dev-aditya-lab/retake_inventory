// Camera access for barcode scanning. The old scanner asked for 640×480 with no
// focus setting, so a small barcode was only a few pixels wide and the phone
// often never focused close up. This asks for a sharp 1080p image with
// continuous autofocus, and exposes zoom / torch / tap-to-focus where the
// phone supports them (Chrome on Android does; iOS Safari exposes none of them).

// focusMode isn't in TypeScript's constraint types yet; browsers that don't know it ignore it.
const CONTINUOUS_FOCUS = { focusMode: "continuous" } as unknown as MediaTrackConstraintSet;

/** Rear camera, best first. Each rung asks for less, for phones that can't do the one above. */
const CONSTRAINT_LADDER: MediaStreamConstraints[] = [
  {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
      advanced: [CONTINUOUS_FOCUS],
    },
  },
  { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
  { video: { facingMode: "environment" } },
  { video: true },
];

/** Errors that asking for a lower resolution can't fix — stop climbing down the ladder. */
const FATAL_ERRORS = new Set(["NotAllowedError", "SecurityError", "NotFoundError"]);

export async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("Camera access needs a secure (https) connection", "SecurityError");
  }
  let lastError: unknown;
  for (const constraints of CONSTRAINT_LADDER) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (err instanceof DOMException && FATAL_ERRORS.has(err.name)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

/** What this phone's camera lets us adjust. */
export interface CameraCapabilities {
  /** Optical/digital zoom range, or null if the browser can't zoom the camera. */
  zoom: { min: number; max: number; step: number } | null;
  torch: boolean;
  continuousFocus: boolean;
  singleShotFocus: boolean;
}

interface RawCapabilities {
  zoom?: { min: number; max: number; step: number };
  torch?: boolean;
  focusMode?: string[];
}

export function readCapabilities(track: MediaStreamTrack): CameraCapabilities {
  const raw = (track.getCapabilities?.() ?? {}) as RawCapabilities;
  const focusModes = raw.focusMode ?? [];
  return {
    zoom: raw.zoom && raw.zoom.max > raw.zoom.min ? raw.zoom : null,
    torch: raw.torch === true,
    continuousFocus: focusModes.includes("continuous"),
    singleShotFocus: focusModes.includes("single-shot"),
  };
}

/** Applies one camera setting; false if the phone refused it (never throws — these are all optional extras). */
async function applySetting(track: MediaStreamTrack, setting: Record<string, unknown>): Promise<boolean> {
  try {
    await track.applyConstraints({ advanced: [setting] } as MediaTrackConstraints);
    return true;
  } catch {
    return false;
  }
}

/** Keep re-focusing as the pack moves — the setting that matters most for a hand-held barcode. */
export function enableContinuousFocus(track: MediaStreamTrack): Promise<boolean> {
  return applySetting(track, { focusMode: "continuous" });
}

export function setZoom(track: MediaStreamTrack, zoom: number): Promise<boolean> {
  return applySetting(track, { zoom });
}

export function setTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  return applySetting(track, { torch: on });
}

/** Tap-to-focus: focus once (on `point`, 0–1 across the frame, when the phone allows), then go back to continuous. */
export async function focusOnce(track: MediaStreamTrack, capabilities: CameraCapabilities, point?: { x: number; y: number }) {
  if (!capabilities.singleShotFocus) return;
  await applySetting(track, { focusMode: "single-shot", ...(point ? { pointsOfInterest: [point] } : {}) });
  if (capabilities.continuousFocus) setTimeout(() => void enableContinuousFocus(track), 1500);
}

/** A message a cashier can act on, for whatever went wrong opening the camera. */
export function describeCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "Camera permission is blocked. Allow the camera for this site in your browser settings, or search for the product below.";
  if (name === "NotFoundError") return "No camera was found on this device.";
  if (name === "SecurityError") return "The camera only works on a secure (https) connection.";
  if (name === "NotReadableError") return "The camera is being used by another app. Close it and try again.";
  return "Could not start the camera. Try again, or search for the product below.";
}
