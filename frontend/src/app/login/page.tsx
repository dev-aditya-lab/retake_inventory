"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { company } from "@/config/company";
import { getApiErrorMessage } from "@/lib/apiError";
import { useRequestOtpMutation, useVerifyOtpMutation } from "@/lib/redux/features/auth/authApi";

/** How long before another code can be asked for. Matches the server's cool-down. */
const RESEND_SECONDS = 45;

/**
 * Staff sign in without a password: type your mobile number (or email), get a
 * 6-digit code on WhatsApp (by email if WhatsApp can't deliver), type it in.
 */
export default function LoginPage() {
  const router = useRouter();
  const [requestOtp, { isLoading: sending }] = useRequestOtpMutation();
  const [verifyOtp, { isLoading: verifying }] = useVerifyOtpMutation();

  const [step, setStep] = useState<"who" | "code">("who");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);

  // Count down until "Send again" is allowed.
  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(() => setWaitSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    try {
      await requestOtp({ identifier: identifier.trim() }).unwrap();
      setStep("code");
      setCode("");
      setWaitSeconds(RESEND_SECONDS);
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't send a code. Check your connection and try again."));
    }
  }

  async function signIn(value: string) {
    if (verifying) return;
    setError(null);
    try {
      await verifyOtp({ identifier: identifier.trim(), code: value }).unwrap();
      router.push("/dashboard");
    } catch (err) {
      setCode("");
      setError(getApiErrorMessage(err, "That code didn't work. Check it and try again."));
    }
  }

  function handleCodeChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    // Signs in by itself as soon as the sixth digit is in (typed, pasted or autofilled from the message).
    if (digits.length === 6) void signIn(digits);
  }

  function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length === 6) void signIn(code);
  }

  function startOver() {
    setStep("who");
    setCode("");
    setError(null);
    setWaitSeconds(0);
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Image src={company.logoUrl} alt={`${company.name} logo`} width={48} height={48} className="rounded-md" />
          <h1 className="text-xl font-semibold text-foreground">{company.name}</h1>
          <p className="text-sm text-muted">
            {step === "who" ? "Sign in with a code sent to your WhatsApp" : "Enter the code we sent you"}
          </p>
        </div>

        {step === "who" ? (
          <form onSubmit={sendCode} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="identifier" className="text-sm font-medium text-foreground">
                Mobile number
              </label>
              <input
                id="identifier"
                required
                autoFocus
                autoComplete="username"
                inputMode="tel"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-primary"
                placeholder="98765 43210"
              />
              <p className="text-xs text-muted">You can also type your email address.</p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={sending || identifier.trim().length < 3}
              className="mt-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit} className="mt-6 flex flex-col gap-4">
            <p className="text-sm text-foreground">
              If <span className="font-medium">{identifier.trim()}</span> belongs to a staff account, a 6-digit code is on its way: to
              WhatsApp, or to your email if WhatsApp can&apos;t deliver. It works for 10 minutes.
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="code" className="text-sm font-medium text-foreground">
                6-digit code
              </label>
              <input
                id="code"
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                disabled={verifying}
                aria-describedby="code-help"
                className="rounded-md border border-border bg-background px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-primary"
                placeholder="••••••"
              />
              <p id="code-help" className="text-xs text-muted">
                It signs you in as soon as all six digits are in.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={verifying || code.length !== 6}
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-60"
            >
              {verifying ? "Signing in…" : "Sign in"}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={startOver} className="font-medium text-muted hover:text-foreground">
                Use a different number
              </button>
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={waitSeconds > 0 || sending}
                className="font-medium text-primary disabled:text-muted"
              >
                {sending ? "Sending…" : waitSeconds > 0 ? `Send again in ${waitSeconds}s` : "Send again"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
