import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("produces a header row plus one line per record", () => {
    const csv = toCsv([{ a: "1", b: "2" }], ["a", "b"]);
    expect(csv).toBe("a,b\r\n1,2");
  });

  it("quotes values containing commas", () => {
    const csv = toCsv([{ name: "Garam Masala, Spicy" }], ["name"]);
    expect(csv).toBe('name\r\n"Garam Masala, Spicy"');
  });

  it("escapes embedded quotes by doubling them", () => {
    const csv = toCsv([{ note: 'Says "fresh"' }], ["note"]);
    expect(csv).toBe('note\r\n"Says ""fresh"""');
  });

  it("quotes values containing newlines", () => {
    const csv = toCsv([{ note: "line1\nline2" }], ["note"]);
    expect(csv).toBe('note\r\n"line1\nline2"');
  });

  it("renders null/undefined as an empty field", () => {
    const csv = toCsv([{ a: null, b: undefined }], ["a", "b"]);
    expect(csv).toBe("a,b\r\n,");
  });
});
