/**
 * Decides which reads count as a new scan. The camera reads the same barcode
 * many times a second while it is held up, and that must add ONE item — but
 * scanning three identical packs in a row must add three.
 *
 * A different code always counts. The same code counts again only once it has
 * been out of view for `rearmGapMs` (the pack was taken away and the next one
 * brought in) and at least `minRepeatMs` has passed since it last counted.
 */
export class ScanGate {
  private lastCode = "";
  private lastSeenAt = 0;
  private lastAcceptedAt = 0;

  constructor(
    private readonly rearmGapMs = 600,
    private readonly minRepeatMs = 1000,
  ) {}

  accept(code: string, now: number): boolean {
    const isSameCode = code === this.lastCode;
    const outOfViewFor = now - this.lastSeenAt;
    this.lastSeenAt = now;

    if (isSameCode && (outOfViewFor < this.rearmGapMs || now - this.lastAcceptedAt < this.minRepeatMs)) return false;

    this.lastCode = code;
    this.lastAcceptedAt = now;
    return true;
  }
}
