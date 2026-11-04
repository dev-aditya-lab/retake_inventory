import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "./secretBox";

describe("secretBox", () => {
  const key = "a-long-random-key-material";

  it("round-trips a secret", () => {
    const stored = encryptSecret("EAAGtoken123", key);
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("EAAGtoken123");
    expect(decryptSecret(stored, key)).toBe("EAAGtoken123");
  });

  it("uses a fresh iv each time", () => {
    expect(encryptSecret("same", key)).not.toBe(encryptSecret("same", key));
  });

  it("rejects the wrong key", () => {
    const stored = encryptSecret("secret", key);
    expect(() => decryptSecret(stored, "another-key")).toThrow();
  });

  it("rejects tampered or malformed input", () => {
    const stored = encryptSecret("secret", key);
    const [v, iv, tag, data] = stored.split(":");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"), key)).toThrow();
    expect(() => decryptSecret("garbage", key)).toThrow();
  });

  it("requires a key", () => {
    expect(() => encryptSecret("x", "")).toThrow();
  });

  it("masks secrets", () => {
    expect(maskSecret("EAAGabcdefghijkl9Zk1")).toBe("EAAG••••9Zk1");
    expect(maskSecret("short")).toBe("••••");
  });
});
