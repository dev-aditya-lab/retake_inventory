export interface Size {
  width: number;
  height: number;
}

/** A rectangle in video pixels. */
export interface Roi {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The scan window as a share of what the user sees in the preview. The
 * on-screen guide box is drawn from the same numbers, so the barcode the
 * cashier lines up inside the box is exactly the part that gets decoded —
 * and other packs lying around the edges are ignored.
 */
export const SCAN_GUIDE = { widthFraction: 0.84, heightFraction: 0.6 } as const;

/**
 * The part of the video frame that is actually visible when it is shown with
 * `object-fit: cover` inside `box` (the rest is cropped off by the preview).
 */
export function visibleRegion(video: Size, box: Size): Roi {
  if (!video.width || !video.height || !box.width || !box.height) {
    return { x: 0, y: 0, width: video.width, height: video.height };
  }
  const scale = Math.max(box.width / video.width, box.height / video.height);
  const width = box.width / scale;
  const height = box.height / scale;
  return { x: (video.width - width) / 2, y: (video.height - height) / 2, width, height };
}

/**
 * A tap on the preview (pixels inside `box`) as a 0–1 point on the whole video
 * frame — the form the camera's focus-point setting wants.
 */
export function toVideoPoint(video: Size, box: Size, tap: { x: number; y: number }): { x: number; y: number } {
  const visible = visibleRegion(video, box);
  const x = (visible.x + (tap.x / box.width) * visible.width) / video.width;
  const y = (visible.y + (tap.y / box.height) * visible.height) / video.height;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

/** The guide box, centred in the visible preview, in video pixels (whole pixels, inside the frame). */
export function scanWindow(video: Size, box: Size, guide: { widthFraction: number; heightFraction: number } = SCAN_GUIDE): Roi {
  const visible = visibleRegion(video, box);
  const width = Math.min(video.width, Math.max(1, Math.round(visible.width * guide.widthFraction)));
  const height = Math.min(video.height, Math.max(1, Math.round(visible.height * guide.heightFraction)));
  const x = Math.min(video.width - width, Math.max(0, Math.round(visible.x + (visible.width - width) / 2)));
  const y = Math.min(video.height - height, Math.max(0, Math.round(visible.y + (visible.height - height) / 2)));
  return { x, y, width, height };
}
