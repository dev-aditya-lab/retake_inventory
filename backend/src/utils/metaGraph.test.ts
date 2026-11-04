import { describe, expect, it } from "vitest";
import { describeGraphError, isTokenError, withApiVersion } from "./metaGraph";

describe("withApiVersion", () => {
  it("replaces an existing version", () => {
    expect(withApiVersion("https://graph.facebook.com/v22.0", "v23.0")).toBe("https://graph.facebook.com/v23.0");
  });
  it("appends when the url has no version", () => {
    expect(withApiVersion("https://graph.facebook.com/", "v21.0")).toBe("https://graph.facebook.com/v21.0");
  });
  it("keeps the url when no version is given", () => {
    expect(withApiVersion("https://graph.facebook.com/v22.0/", undefined)).toBe("https://graph.facebook.com/v22.0");
  });
});

describe("describeGraphError", () => {
  it("prefers the user-facing message and adds code and details", () => {
    expect(
      describeGraphError({ error: { message: "Invalid parameter", error_user_msg: "Template name is taken", code: 100, error_data: { details: "name exists" } } }),
    ).toBe("Template name is taken - name exists (code 100)");
  });
  it("falls back to the technical message", () => {
    expect(describeGraphError({ error: { message: "Unsupported post request", code: 100 } })).toBe("Unsupported post request (code 100)");
  });
  it("uses the fallback for unknown bodies", () => {
    expect(describeGraphError(undefined)).toBe("WhatsApp request failed");
    expect(describeGraphError("nope", "x")).toBe("x");
  });
});

describe("isTokenError", () => {
  it("detects code 190", () => {
    expect(isTokenError({ error: { code: 190 } })).toBe(true);
    expect(isTokenError({ error: { code: 100 } })).toBe(false);
    expect(isTokenError(null)).toBe(false);
  });
});

import { listSubscribedApps } from "./metaGraph";

describe("listSubscribedApps", () => {
  it("reads ids and names, tolerating junk", () => {
    expect(
      listSubscribedApps({ data: [{ whatsapp_business_api_data: { id: "2139151016610399", name: "ChatMitra Web" } }, {}, null] }),
    ).toEqual([{ id: "2139151016610399", name: "ChatMitra Web" }]);
    expect(listSubscribedApps(undefined)).toEqual([]);
    expect(listSubscribedApps({ data: "x" })).toEqual([]);
  });
});
