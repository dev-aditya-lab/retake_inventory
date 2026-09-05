/** Escapes regex metacharacters so user-supplied search text is matched literally, not compiled as a pattern. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
