import { describe, expect, it } from "vitest";
import { extensionFor, mediaFolder, resourceTypeFor, safeFilename } from "./whatsappMedia";

describe("whatsappMedia", () => {
  it("files kinds under Cloudinary resource types", () => {
    expect(resourceTypeFor("image")).toBe("image");
    expect(resourceTypeFor("sticker")).toBe("image");
    expect(resourceTypeFor("audio")).toBe("video");
    expect(resourceTypeFor("video")).toBe("video");
    expect(resourceTypeFor("document")).toBe("raw");
  });
  it("finds an extension from the name, else the type", () => {
    expect(extensionFor("application/pdf", "Bill.PDF")).toBe("pdf");
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("audio/ogg; codecs=opus")).toBe("ogg");
    expect(extensionFor("weird/type")).toBe("bin");
  });
  it("cleans file names for headers", () => {
    expect(safeFilename('a"b\r\nc/d.pdf', "file")).toBe("a_b_c_d.pdf");
    expect(safeFilename("", "file")).toBe("file");
    expect(safeFilename("बिल.pdf", "file")).toBe("___.pdf");
  });
  it("names the monthly folder", () => {
    expect(mediaFolder(new Date("2026-11-04T10:00:00Z"))).toBe("whatsapp/2026-11");
  });
});
