import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---- an in-memory stand-in for Redis (just the commands the service uses) ----
const store = new Map<string, { value: string; expiresAt: number | null }>();
const now = () => Date.now();

function live(key: string) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt !== null && entry.expiresAt <= now()) {
    store.delete(key);
    return undefined;
  }
  return entry;
}

const fakeRedis = {
  get: async (key: string) => live(key)?.value ?? null,
  set: async (key: string, value: string, ...args: (string | number)[]) => {
    const nx = args.includes("NX");
    if (nx && live(key)) return null;
    const exIndex = args.indexOf("EX");
    const ttl = exIndex >= 0 ? Number(args[exIndex + 1]) : null;
    store.set(key, { value, expiresAt: ttl ? now() + ttl * 1000 : null });
    return "OK";
  },
  del: async (...keys: string[]) => keys.reduce((n, k) => n + (live(k) ? (store.delete(k), 1) : 0), 0),
  incr: async (key: string) => {
    const entry = live(key);
    const next = Number(entry?.value ?? 0) + 1;
    store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return next;
  },
  expire: async (key: string, seconds: number) => {
    const entry = live(key);
    if (!entry) return 0;
    entry.expiresAt = now() + seconds * 1000;
    return 1;
  },
  ttl: async (key: string) => {
    const entry = live(key);
    if (!entry) return -2;
    return entry.expiresAt === null ? -1 : Math.ceil((entry.expiresAt - now()) / 1000);
  },
};

vi.mock("../config/redis", () => ({ redis: fakeRedis }));
vi.mock("../config/env", () => ({
  env: { NODE_ENV: "test", JWT_ACCESS_SECRET: "test-access-secret-0123456789", JWT_REFRESH_EXPIRES_IN: "30d", JWT_ACCESS_EXPIRES_IN: "15m" },
}));
vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// ---- people ----
interface FakeUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: Date;
  save: () => Promise<void>;
}
const makeUser = (over: Partial<FakeUser> = {}): FakeUser => ({
  id: "u1",
  name: "Asha",
  email: "asha@shop.com",
  phone: "9876543210",
  role: "sales",
  isActive: true,
  save: async () => undefined,
  ...over,
});

let users: FakeUser[] = [];
vi.mock("../models/User.model", () => ({
  User: {
    findOne: async (q: { email?: string }) => users.find((u) => u.email === q.email && u.isActive) ?? null,
    find: (q: { phone?: { $regex: string } }) => ({
      limit: async () => users.filter((u) => u.isActive && u.phone && new RegExp(q.phone!.$regex).test(u.phone)),
    }),
    findById: async (id: string) => users.find((u) => u.id === id) ?? null,
  },
}));

let tokenCounter = 0;
vi.mock("../utils/jwt", () => ({
  signAccessToken: () => "access-token",
  signRefreshToken: (sub: string) => {
    tokenCounter += 1;
    return { token: `rt:${sub}:j${tokenCounter}`, jti: `j${tokenCounter}` };
  },
  verifyRefreshToken: (token: string) => {
    const [, sub, jti] = token.split(":");
    if (!sub || !jti) throw new Error("bad token");
    return { sub, jti };
  },
}));

const sendWhatsApp = vi.fn<(phone: string, code: string) => Promise<void>>();
const sendEmail = vi.fn<(to: string, code: string) => Promise<void>>();
vi.mock("./whatsapp.service", () => ({ sendOtpWhatsApp: (phone: string, code: string) => sendWhatsApp(phone, code) }));
vi.mock("./email.service", () => ({ sendOtpEmail: (to: string, code: string) => sendEmail(to, code) }));

// Imported after the mocks above are in place.
let requestOtp: typeof import("./auth.service").requestOtp;
let verifyOtp: typeof import("./auth.service").verifyOtp;
let refreshSession: typeof import("./auth.service").refreshSession;

beforeAll(async () => {
  ({ requestOtp, verifyOtp, refreshSession } = await import("./auth.service.js"));
});

/** The code that was just delivered. */
const deliveredCode = () => (sendWhatsApp.mock.calls.at(-1) ?? sendEmail.mock.calls.at(-1))![1];

beforeEach(() => {
  store.clear();
  users = [makeUser()];
  sendWhatsApp.mockReset().mockResolvedValue(undefined);
  sendEmail.mockReset().mockResolvedValue(undefined);
});

describe("signing in with a code", () => {
  it("sends a six-digit code to the person's WhatsApp, and it logs them in once", async () => {
    await requestOtp("98765 43210");
    expect(sendWhatsApp).toHaveBeenCalledWith("9876543210", expect.stringMatching(/^\d{6}$/));
    expect(sendEmail).not.toHaveBeenCalled();

    const code = deliveredCode();
    const session = await verifyOtp("9876543210", code);
    expect(session.user.id).toBe("u1");
    expect(session.accessToken).toBe("access-token");
    expect(session.refreshToken).toMatch(/^rt:u1:/);

    await expect(verifyOtp("9876543210", code)).rejects.toThrow(/wrong or has expired/);
  });

  it("works with an email address and with spaces typed inside the code", async () => {
    await requestOtp("Asha@Shop.com");
    const code = deliveredCode();
    const session = await verifyOtp("asha@shop.com", `${code.slice(0, 3)} ${code.slice(3)}`);
    expect(session.user.id).toBe("u1");
  });

  it("says nothing and sends nothing for someone who isn't staff", async () => {
    await expect(requestOtp("9123456789")).resolves.toBeUndefined();
    await expect(requestOtp("nobody@shop.com")).resolves.toBeUndefined();
    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    await expect(verifyOtp("9123456789", "123456")).rejects.toThrow(/wrong or has expired/);
  });

  it("ignores a deactivated account and a number two accounts share", async () => {
    users = [makeUser({ isActive: false })];
    await requestOtp("9876543210");
    expect(sendWhatsApp).not.toHaveBeenCalled();

    users = [makeUser(), makeUser({ id: "u2", email: "other@shop.com" })];
    await requestOtp("9876543210");
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it("falls back to email when WhatsApp can't deliver, and fails clearly when nothing can", async () => {
    sendWhatsApp.mockRejectedValueOnce(new Error("service off"));
    await requestOtp("9876543210");
    expect(sendEmail).toHaveBeenCalledWith("asha@shop.com", expect.stringMatching(/^\d{6}$/));
    await expect(verifyOtp("9876543210", deliveredCode())).resolves.toBeTruthy();

    store.clear();
    sendWhatsApp.mockRejectedValue(new Error("service off"));
    sendEmail.mockRejectedValue(new Error("no email"));
    await expect(requestOtp("9876543210")).rejects.toMatchObject({ statusCode: 503 });
    // nothing was delivered, so they can ask again straight away
    sendWhatsApp.mockResolvedValue(undefined);
    await expect(requestOtp("9876543210")).resolves.toBeUndefined();
    expect(sendWhatsApp).toHaveBeenCalledTimes(3); // the first fallback, the failed round, then the retry
  });

  it("uses email for someone with no phone on file", async () => {
    users = [makeUser({ phone: undefined })];
    await requestOtp("asha@shop.com");
    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("kills the code after five wrong guesses, even for the right one", async () => {
    await requestOtp("9876543210");
    const code = deliveredCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await expect(verifyOtp("9876543210", wrong)).rejects.toThrow();
    await expect(verifyOtp("9876543210", code)).rejects.toThrow(/wrong or has expired/);
  });

  it("doesn't send a second code within the cool-down", async () => {
    await requestOtp("9876543210");
    await requestOtp("9876543210");
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
  });

  it("stops after too many codes in an hour", async () => {
    for (let i = 0; i < 12; i++) {
      store.delete("otp:cool:u1"); // skip the cool-down to test the hourly cap on its own
      await requestOtp("9876543210");
    }
    expect(sendWhatsApp).toHaveBeenCalledTimes(8);
  });

  it("only ever stores a hash, never the code", async () => {
    await requestOtp("9876543210");
    const code = deliveredCode();
    for (const { value } of store.values()) expect(value).not.toContain(code);
  });
});

describe("refreshing a session", () => {
  it("lets requests that arrive together all renew, then retires the old token", async () => {
    await requestOtp("9876543210");
    const { refreshToken } = await verifyOtp("9876543210", deliveredCode());

    const [a, b] = await Promise.all([refreshSession(refreshToken), refreshSession(refreshToken)]);
    expect(a.refreshToken).not.toBe(b.refreshToken);

    // The used token now only lives for the grace period.
    const key = "refresh:u1:" + refreshToken.split(":")[2];
    expect(await fakeRedis.ttl(key)).toBeLessThanOrEqual(30);
    expect(await fakeRedis.ttl(key)).toBeGreaterThan(0);

    // After the grace period it is gone.
    store.delete(key);
    await expect(refreshSession(refreshToken)).rejects.toThrow(/revoked/);
  });
});
