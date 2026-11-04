import { describe, expect, it } from "vitest";
import { buildProfilePayload, displayNameProblem, parseProfile, profileProblems } from "./whatsappProfile";

describe("parseProfile", () => {
  it("reads Meta's wrapped profile", () => {
    expect(
      parseProfile({
        data: [
          {
            about: "Hi",
            address: "Delhi",
            description: "Spices",
            email: "a@b.in",
            websites: ["https://x.in/"],
            vertical: "retail",
            profile_picture_url: "https://pps/x.jpg",
          },
        ],
      }),
    ).toEqual({
      about: "Hi",
      address: "Delhi",
      description: "Spices",
      email: "a@b.in",
      websites: ["https://x.in/"],
      vertical: "RETAIL",
      profilePictureUrl: "https://pps/x.jpg",
    });
  });
  it("tolerates an empty or odd answer", () => {
    expect(parseProfile(undefined)).toMatchObject({ about: "", websites: [], vertical: "UNDEFINED" });
    expect(parseProfile({ data: [{ vertical: "WHATEVER", websites: [1, "https://a.in"] }] })).toMatchObject({
      vertical: "UNDEFINED",
      websites: ["https://a.in"],
    });
  });
});

describe("profileProblems", () => {
  it("accepts a normal update", () => {
    expect(profileProblems({ about: "Fresh spices", email: "a@b.in", websites: ["https://a.in"] })).toEqual([]);
  });
  it("flags limits, empty about, bad email and links", () => {
    expect(profileProblems({ about: "  " })[0]).toMatch(/empty/);
    expect(profileProblems({ about: "x".repeat(140) })[0]).toMatch(/139/);
    expect(profileProblems({ description: "x".repeat(513) })[0]).toMatch(/512/);
    expect(profileProblems({ email: "nope" })[0]).toMatch(/email/);
    expect(profileProblems({ websites: ["a.in"] })[0]).toMatch(/http/);
    expect(profileProblems({ websites: ["https://a.in", "https://b.in", "https://c.in"] })[0]).toMatch(/at most 2/);
  });
});

describe("buildProfilePayload", () => {
  it("sends only what was given and clears with empty strings", () => {
    expect(buildProfilePayload({ description: " " , websites: [] })).toEqual({
      messaging_product: "whatsapp",
      description: "",
      websites: [],
    });
  });
  it("adds the vertical and a picture handle", () => {
    expect(buildProfilePayload({ vertical: "RETAIL" }, "4:abc")).toEqual({
      messaging_product: "whatsapp",
      vertical: "RETAIL",
      profile_picture_handle: "4:abc",
    });
    expect(buildProfilePayload({ vertical: "UNDEFINED" })).toEqual({ messaging_product: "whatsapp" });
  });
});

describe("displayNameProblem", () => {
  it("accepts a plain business name", () => {
    expect(displayNameProblem("Retake Spices")).toBeUndefined();
    expect(displayNameProblem("Asha & Sons (Delhi)")).toBeUndefined();
  });
  it("rejects short names, symbols and web addresses", () => {
    expect(displayNameProblem("ab")).toMatch(/at least/);
    expect(displayNameProblem("Spices ★")).toMatch(/emojis|symbols/);
    expect(displayNameProblem("shop.com")).toMatch(/web address/);
  });
});
