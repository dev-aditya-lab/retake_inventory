/** Rounds to paise. Every stored money amount goes through this. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
