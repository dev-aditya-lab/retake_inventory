"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Copy, KeyRound, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatDateTime } from "@/lib/format";
import { API_BASE_URL } from "@/lib/redux/apiSlice";
import {
  useGetWhatsappConfigQuery,
  useSaveWhatsappConfigMutation,
  useSubscribeWhatsappWebhooksMutation,
  useTestWhatsappConnectionMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import type {
  ConfigField,
  ConfigSecret,
  ConfigSource,
  ConnectionResult,
  SaveWhatsappConfig,
  SecretName,
  WhatsappConfig,
} from "@/types/whatsapp";

/** Where the shop's WhatsApp Business API details are entered and checked. Admin only. */
export default function WhatsappSettingsPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can change the WhatsApp connection.">
      <SettingsPanels />
    </RequireRole>
  );
}

function SettingsPanels() {
  const { data, isLoading, isError, refetch } = useGetWhatsappConfigQuery();

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (isError || !data) {
    return (
      <div className="text-sm">
        <p className="text-danger">Couldn&apos;t load the WhatsApp settings.</p>
        <button type="button" onClick={() => refetch()} className="mt-2 font-medium text-primary">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ConnectionCard config={data} />
      <ConfigForm config={data} />
      <WebhookCard config={data} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connection status + test
// ---------------------------------------------------------------------------

function ConnectionCard({ config }: { config: WhatsappConfig }) {
  const [test, { isLoading }] = useTestWhatsappConnectionMutation();
  const [subscribe, { isLoading: subscribing }] = useSubscribeWhatsappWebhooksMutation();
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleTest() {
    setError(null);
    setNotice(null);
    try {
      setResult(await test().unwrap());
    } catch (err) {
      setResult(null);
      setError(getApiErrorMessage(err, "Couldn't run the check. Try again."));
    }
  }

  async function handleSubscribe() {
    setError(null);
    setNotice(null);
    try {
      await subscribe().unwrap();
      setNotice("Subscribed. Customer messages will now reach the app.");
      setResult(await test().unwrap());
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't subscribe. Check the business account ID and token."));
    }
  }

  const needsSubscribe = result?.checks.some((c) => c.key === "webhook" && !c.ok);

  return (
    <section aria-labelledby="conn-heading" className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <h2 id="conn-heading" className="text-base font-semibold text-foreground">
            Connection
          </h2>
          {config.displayPhoneNumber ? (
            <p className="mt-0.5 text-sm text-foreground">
              {config.displayPhoneNumber}
              {config.verifiedName ? ` · ${config.verifiedName}` : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted">Save the details below, then run a check.</p>
          )}
          {config.lastCheckedAt && <p className="text-xs text-muted">Last checked {formatDateTime(config.lastCheckedAt)}</p>}
        </div>
        <button
          type="button"
          onClick={handleTest}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-60"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : undefined} aria-hidden />
          {isLoading ? "Checking…" : "Test connection"}
        </button>
      </div>

      {result && (
        <ul className="mt-3 flex flex-col gap-2" aria-label="Connection check results">
          {result.checks.map((check) => (
            <li key={check.key} className="flex items-start gap-2 text-sm">
              {check.ok ? (
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-label="OK" />
              ) : (
                <XCircle size={18} className="mt-0.5 shrink-0 text-danger" aria-label="Problem" />
              )}
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="font-medium text-foreground">{check.label}: </span>
                <span className={check.ok ? "text-muted" : "text-danger"}>{check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {needsSubscribe && (
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={subscribing}
          className="mt-3 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {subscribing ? "Subscribing…" : "Subscribe to messages"}
        </button>
      )}

      {notice && (
        <p role="status" className="mt-2 text-sm text-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<ConfigSource, string> = {
  app: "Saved in the app",
  env: "From the server",
  none: "Not set",
};

function SourceChip({ source }: { source: ConfigSource }) {
  const tone =
    source === "app" ? "bg-leaf-100 text-leaf-800" : source === "env" ? "bg-ink-200 text-ink-800" : "bg-chilli-100 text-chilli-800";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{SOURCE_LABEL[source]}</span>;
}

function Field({ label, source, help, children }: { label: string; source: ConfigSource; help?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-foreground">
      <span className="flex flex-wrap items-center gap-2">
        {label}
        <SourceChip source={source} />
      </span>
      {children}
      {help && <span className="text-xs font-normal text-muted">{help}</span>}
    </label>
  );
}

const ID_FIELDS = ["phoneNumberId", "businessAccountId", "appId", "apiVersion"] as const;
type IdField = (typeof ID_FIELDS)[number];

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function ConfigForm({ config }: { config: WhatsappConfig }) {
  const [save, { isLoading }] = useSaveWhatsappConfigMutation();

  const initialIds = (c: WhatsappConfig): Record<IdField, string> => ({
    phoneNumberId: c.phoneNumberId.value,
    businessAccountId: c.businessAccountId.value,
    appId: c.appId.value,
    apiVersion: c.apiVersion.value,
  });

  const [ids, setIds] = useState(() => initialIds(config));
  const [secrets, setSecrets] = useState<Record<SecretName, string>>({ accessToken: "", verifyToken: "", appSecret: "" });
  const [removing, setRemoving] = useState<SecretName[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const baseline = initialIds(config);
  const changedIds = ID_FIELDS.filter((f) => ids[f].trim() !== baseline[f]);
  const changedSecrets = (Object.keys(secrets) as SecretName[]).filter((s) => secrets[s].trim() !== "");
  const dirty = changedIds.length > 0 || changedSecrets.length > 0 || removing.length > 0;

  function toggleRemove(name: SecretName) {
    setSecrets((s) => ({ ...s, [name]: "" }));
    setRemoving((r) => (r.includes(name) ? r.filter((n) => n !== name) : [...r, name]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || isLoading) return;
    setError(null);
    setSaved(false);

    const body: SaveWhatsappConfig = {};
    for (const f of changedIds) body[f] = ids[f].trim();
    for (const s of changedSecrets) body[s] = secrets[s].trim();
    if (removing.length > 0) body.clear = removing;

    try {
      const next = await save(body).unwrap();
      setIds(initialIds(next));
      setSecrets({ accessToken: "", verifyToken: "", appSecret: "" });
      setRemoving([]);
      setSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't save. Check your connection and try again."));
    }
  }

  const idField = (name: IdField, c: ConfigField) => ({
    value: ids[name],
    onChange: (v: string) => {
      setSaved(false);
      setIds((s) => ({ ...s, [name]: v }));
    },
    source: c.source,
  });

  const secretField = (name: SecretName, c: ConfigSecret) => ({
    value: secrets[name],
    onChange: (v: string) => {
      setSaved(false);
      setRemoving((r) => r.filter((n) => n !== name));
      setSecrets((s) => ({ ...s, [name]: v }));
    },
    secret: c,
    removing: removing.includes(name),
    onRemove: () => toggleRemove(name),
  });

  const phone = idField("phoneNumberId", config.phoneNumberId);
  const waba = idField("businessAccountId", config.businessAccountId);
  const app = idField("appId", config.appId);
  const version = idField("apiVersion", config.apiVersion);

  return (
    <form onSubmit={handleSubmit} aria-labelledby="details-heading" className="rounded-lg border border-border bg-background p-3">
      <h2 id="details-heading" className="text-base font-semibold text-foreground">
        Connection details
      </h2>
      <p className="mt-0.5 text-sm text-muted">
        Find these in Meta for Developers under your app, then WhatsApp &gt; API setup. Anything you save here is used instead of the
        server&apos;s settings.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Phone number ID" source={phone.source} help="Digits only. Not the phone number itself.">
          <input
            inputMode="numeric"
            autoComplete="off"
            value={phone.value}
            onChange={(e) => phone.onChange(e.target.value)}
            placeholder="e.g. 123456789012345"
            className="input"
          />
        </Field>
        <Field label="Business account ID" source={waba.source} help="Needed to list and create templates.">
          <input
            inputMode="numeric"
            autoComplete="off"
            value={waba.value}
            onChange={(e) => waba.onChange(e.target.value)}
            placeholder="e.g. 109876543210987"
            className="input"
          />
        </Field>
        <Field label="App ID" source={app.source} help="Optional.">
          <input
            inputMode="numeric"
            autoComplete="off"
            value={app.value}
            onChange={(e) => app.onChange(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="API version" source={version.source} help="Optional. Leave as is unless Meta asks you to upgrade.">
          <input
            autoComplete="off"
            value={version.value}
            onChange={(e) => version.onChange(e.target.value)}
            placeholder="v22.0"
            className="input"
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <SecretInput
          label="Access token"
          help="A permanent token from a System User works best; temporary tokens expire in 24 hours."
          placeholder="Paste the token"
          {...secretField("accessToken", config.accessToken)}
        />
        <SecretInput
          label="Verify token"
          help="Any private text. Paste the same value into Meta's webhook settings."
          placeholder="Paste or generate one"
          onGenerate={() => {
            setSaved(false);
            setRemoving((r) => r.filter((n) => n !== "verifyToken"));
            setSecrets((s) => ({ ...s, verifyToken: randomToken() }));
          }}
          reveal
          {...secretField("verifyToken", config.verifyToken)}
        />
        <SecretInput
          label="App secret"
          help="Meta app > Settings > Basic. Used to check that messages really come from Meta."
          placeholder="Paste the app secret"
          {...secretField("appSecret", config.appSecret)}
        />
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Tokens are stored encrypted and are never shown again, only a short hint.
          {!config.dedicatedEncryptionKey && " Tip: set WHATSAPP_SETTINGS_KEY on the server so the encryption key doesn't depend on the login secret."}
        </span>
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="mt-3 text-sm text-success">
          Saved. Run “Test connection” to check it.
        </p>
      )}

      <button
        type="submit"
        disabled={!dirty || isLoading}
        className="mt-4 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:w-auto"
      >
        {isLoading ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function SecretInput({
  label,
  help,
  placeholder,
  value,
  onChange,
  secret,
  removing,
  onRemove,
  onGenerate,
  reveal,
}: {
  label: string;
  help: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  secret: ConfigSecret;
  removing: boolean;
  onRemove: () => void;
  onGenerate?: () => void;
  /** Show what is typed (a generated verify token has to be copied to Meta). */
  reveal?: boolean;
}) {
  return (
    <Field label={label} source={secret.source} help={help}>
      <div className="flex gap-2">
        <input
          type={reveal ? "text" : "password"}
          autoComplete="new-password"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={secret.set && !removing ? `Saved: ${secret.hint}. Leave empty to keep` : placeholder}
          disabled={removing}
          className="input min-w-0 flex-1"
        />
        {onGenerate && (
          <button
            type="button"
            onClick={onGenerate}
            aria-label={`Generate a ${label.toLowerCase()}`}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-ink-100"
          >
            <KeyRound size={16} aria-hidden />
            <span className="hidden sm:inline">Generate</span>
          </button>
        )}
      </div>
      {secret.source === "app" && (
        <button type="button" onClick={onRemove} className="self-start text-xs font-medium text-primary">
          {removing ? "Keep the saved one" : "Remove the saved one"}
        </button>
      )}
      {removing && <span className="text-xs font-normal text-danger">Will be removed when you save.</span>}
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Webhook helper
// ---------------------------------------------------------------------------

function WebhookCard({ config }: { config: WhatsappConfig }) {
  const url = `${API_BASE_URL.replace(/\/+$/, "")}/webhooks/whatsapp`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="hook-heading" className="rounded-lg border border-border bg-background p-3">
      <h2 id="hook-heading" className="text-base font-semibold text-foreground">
        Webhook for incoming messages
      </h2>
      <p className="mt-0.5 text-sm text-muted">
        In Meta for Developers, open WhatsApp &gt; Configuration, paste this as the callback URL, and use your verify token. Then
        subscribe to the <span className="font-medium text-foreground">messages</span> field.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-surface px-2.5 py-2 text-xs text-foreground">{url}</code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy the callback URL"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100"
        >
          <Copy size={16} aria-hidden />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {!config.verifyToken.set && (
        <p className="mt-2 text-xs text-danger">No verify token yet. Meta can&apos;t confirm the webhook until you add one above.</p>
      )}
      {!config.appSecret.set && (
        <p className="mt-1 text-xs text-danger">No app secret yet. Incoming messages are rejected until you add one above.</p>
      )}
    </section>
  );
}
