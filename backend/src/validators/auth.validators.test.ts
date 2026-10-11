import { describe, expect, it } from "vitest";
import { updateProfileSchema } from "./auth.validators";

describe("updateProfileSchema", () => {
  it("stores the phone as the bare 10 digits", () => {
    expect(updateProfileSchema.parse({ phone: "+91 98765-43210" })).toEqual({ phone: "9876543210" });
  });

  it("trims the name and accepts name and phone together", () => {
    expect(updateProfileSchema.parse({ name: "  Ravi Kumar ", phone: "9876543210" })).toEqual({
      name: "Ravi Kumar",
      phone: "9876543210",
    });
  });

  it("lets an empty phone through, to clear it", () => {
    expect(updateProfileSchema.parse({ phone: "" })).toEqual({ phone: "" });
  });

  it("rejects numbers that are not an Indian mobile", () => {
    expect(updateProfileSchema.safeParse({ phone: "12345" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ phone: "0612345678" }).success).toBe(false);
  });

  it("rejects an empty update", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it("cannot be used to change role, email or active status", () => {
    const parsed = updateProfileSchema.parse({ name: "Ravi", role: "admin", email: "x@y.com", isActive: false });
    expect(parsed).toEqual({ name: "Ravi" });
  });
});
