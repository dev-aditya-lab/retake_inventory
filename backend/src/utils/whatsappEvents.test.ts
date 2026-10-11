import { describe, expect, it } from "vitest";
import { interpretChange, isQuietField } from "./whatsappEvents";

describe("template status updates", () => {
  const value = {
    event: "REJECTED",
    message_template_id: "123",
    message_template_name: "cus_digital_invoice_01",
    message_template_language: "en",
    reason: "INVALID_FORMAT",
  };

  it("records the template's new status and raises a critical alert when rejected", () => {
    const effect = interpretChange("message_template_status_update", value);

    expect(effect.template).toEqual({
      ref: { name: "cus_digital_invoice_01", language: "en", templateId: "123" },
      patch: { status: "REJECTED", reason: "INVALID_FORMAT" },
    });
    expect(effect.alert).toMatchObject({ severity: "critical" });
    expect(effect.alert?.title).toContain("cus_digital_invoice_01");
    expect(effect.alert?.detail).toContain("INVALID_FORMAT");
  });

  it("treats approval as information and drops Meta's 'NONE' reason", () => {
    const effect = interpretChange("message_template_status_update", { ...value, event: "APPROVED", reason: "NONE" });

    expect(effect.alert?.severity).toBe("info");
    expect(effect.template?.patch).toEqual({ status: "APPROVED" });
  });

  it("flags a paused or disabled template as critical", () => {
    for (const event of ["PAUSED", "DISABLED"]) {
      expect(interpretChange("message_template_status_update", { ...value, event }).alert?.severity).toBe("critical");
    }
  });

  it("still alerts when the template name is missing", () => {
    const effect = interpretChange("message_template_status_update", { event: "REJECTED" });
    expect(effect.template).toBeUndefined();
    expect(effect.alert?.severity).toBe("critical");
  });
});

describe("template quality and category", () => {
  it("escalates by quality colour", () => {
    const base = { message_template_name: "t", message_template_language: "en" };
    expect(interpretChange("message_template_quality_update", { ...base, new_quality_score: "RED" }).alert?.severity).toBe("critical");
    expect(interpretChange("message_template_quality_update", { ...base, new_quality_score: "YELLOW" }).alert?.severity).toBe("warning");
    expect(interpretChange("message_template_quality_update", { ...base, new_quality_score: "GREEN" }).alert?.severity).toBe("info");
  });

  it("warns that a category change can change pricing", () => {
    const effect = interpretChange("template_category_update", {
      message_template_name: "t",
      message_template_language: "en",
      previous_category: "UTILITY",
      new_category: "MARKETING",
    });
    expect(effect.alert?.severity).toBe("warning");
    expect(effect.template?.patch).toEqual({ category: "MARKETING" });
  });
});

describe("number and account events", () => {
  it("warns when the number's quality is downgraded and reports the limit", () => {
    const effect = interpretChange("phone_number_quality_update", {
      display_phone_number: "918506933428",
      event: "DOWNGRADE",
      current_limit: "TIER_1K",
    });
    expect(effect.alert).toMatchObject({ severity: "warning", detail: "Messaging limit: TIER_1K" });
    expect(effect.alert?.data).toMatchObject({ currentLimit: "TIER_1K", event: "DOWNGRADE" });
  });

  it("maps account alert severities", () => {
    expect(interpretChange("account_alerts", { alert_severity: "CRITICAL", alert_type: "LIMIT_REACHED" }).alert?.severity).toBe("critical");
    expect(interpretChange("account_alerts", { alert_severity: "WARNING" }).alert?.severity).toBe("warning");
    expect(interpretChange("account_alerts", { alert_severity: "INFORMATIONAL" }).alert?.severity).toBe("info");
  });

  it("treats a disabled or restricted account as critical", () => {
    expect(interpretChange("account_update", { event: "DISABLED_UPDATE" }).alert?.severity).toBe("critical");
    expect(interpretChange("account_update", { event: "ACCOUNT_RESTRICTION" }).alert?.severity).toBe("critical");
    expect(interpretChange("account_update", { event: "VERIFIED_ACCOUNT" }).alert?.severity).toBe("info");
  });

  it("flags a rejected display name or account review", () => {
    expect(interpretChange("phone_number_name_update", { decision: "REJECTED" }).alert?.severity).toBe("warning");
    expect(interpretChange("account_review_update", { decision: "REJECTED" }).alert?.severity).toBe("critical");
    expect(interpretChange("account_review_update", { decision: "APPROVED" }).alert?.severity).toBe("info");
  });

  it("notes an incoming call", () => {
    const effect = interpretChange("calls", { calls: [{ from: "919876543210", event: "connect" }] });
    expect(effect.alert?.title).toContain("919876543210");
  });
});

describe("everything else", () => {
  it("never loses an unknown field: it becomes a short info alert", () => {
    const effect = interpretChange("some_future_field", { anything: 1 });
    expect(effect.alert).toMatchObject({ kind: "some_future_field", severity: "info" });
    expect(effect.alert?.detail).toContain("anything");
  });

  it("truncates a huge payload in the alert detail", () => {
    const effect = interpretChange("another_field", { blob: "x".repeat(5000) });
    expect(effect.alert!.detail.length).toBeLessThan(400);
  });

  it("does not alert on bookkeeping fields", () => {
    for (const field of ["history", "messaging_handovers", "partner_solutions", "smb_app_state_sync", "group_lifecycle_update"]) {
      expect(isQuietField(field), field).toBe(true);
      expect(interpretChange(field, { x: 1 })).toEqual({});
    }
  });

  it("copes with a missing or non-object value", () => {
    expect(() => interpretChange("account_update", null)).not.toThrow();
    expect(() => interpretChange("message_template_status_update", "oops")).not.toThrow();
  });
});
