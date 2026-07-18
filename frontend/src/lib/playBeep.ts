let audio: HTMLAudioElement | null = null;

/** Plays the barcode-read confirmation beep. Safe to call from any client component. */
export function playBeep(): void {
  if (typeof window === "undefined") return;
  if (!audio) audio = new Audio("/barcode-read-bep.mp3");
  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Autoplay can be blocked before the user has interacted with the page — non-fatal.
  });
}
