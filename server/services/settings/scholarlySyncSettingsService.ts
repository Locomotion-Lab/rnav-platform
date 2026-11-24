import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { SettingsError } from "./settingsService.js";

const OPENALEX_SECRET_KEY = "scholarly.openalex_api_key";
const CACHE_TTL_MS = 2_000;

type RuntimeFallbacks = { enabled: boolean; crossrefContactEmail?: string; openAlexApiKey?: string };
type SettingsRow = { enabled: boolean; crossref_contact_email: string | null; version: string; updated_at: string };
type SecretRow = { ciphertext: Buffer; nonce: Buffer; auth_tag: Buffer; version: string; updated_at: string };

export type ScholarlyRuntimeConfig = {
  enabled: boolean;
  crossrefContactEmail?: string;
  openAlexApiKey?: string;
  version: number;
  updatedAt: string | null;
  source: "database" | "environment";
  secretVersion: number;
};

function encryptionKey(keyMaterial: string) {
  return createHash("sha256").update("rnav-system-secrets-v1\0").update(keyMaterial).digest();
}

export function encryptSecret(value: string, keyMaterial: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyMaterial), nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext, nonce, authTag: cipher.getAuthTag() };
}

export function decryptSecret(row: Pick<SecretRow, "ciphertext" | "nonce" | "auth_tag">, keyMaterial: string) {
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(keyMaterial), row.nonce);
    decipher.setAuthTag(row.auth_tag);
    return Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new SettingsError("OpenAlex Secret 无法解密，请重新配置 API Key", "SECRET_DECRYPTION_FAILED", 500);
  }
}

export function maskSecret(value?: string) {
  if (!value) return null;
  return value.length > 4 ? `••••••••${value.slice(-4)}` : "••••••••";
}

export function createScholarlySyncSettingsService(pool: Pick<Pool, "query" | "connect">, options: { encryptionSecret: string; fallbacks: RuntimeFallbacks }) {
  let cached: { expiresAt: number; value: ScholarlyRuntimeConfig } | null = null;
  const invalidate = () => { cached = null; };

  async function getRuntimeConfig(force = false): Promise<ScholarlyRuntimeConfig> {
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
    const [settings, secret] = await Promise.all([
      pool.query<SettingsRow>("SELECT enabled,crossref_contact_email,version::text,updated_at FROM scholarly_sync_settings WHERE singleton=1"),
      pool.query<SecretRow>("SELECT ciphertext,nonce,auth_tag,version::text,updated_at FROM system_secrets WHERE key=$1", [OPENALEX_SECRET_KEY]),
    ]);
    const setting = settings.rows[0]; const storedSecret = secret.rows[0];
    const value: ScholarlyRuntimeConfig = {
      enabled: setting ? Boolean(setting.enabled) : options.fallbacks.enabled,
      crossrefContactEmail: setting ? (setting.crossref_contact_email || undefined) : options.fallbacks.crossrefContactEmail,
      openAlexApiKey: storedSecret ? decryptSecret(storedSecret, options.encryptionSecret) : options.fallbacks.openAlexApiKey,
      version: setting ? Number(setting.version) : 0,
      updatedAt: setting?.updated_at ?? null,
      source: setting ? "database" : "environment",
      secretVersion: storedSecret ? Number(storedSecret.version) : 0,
    };
    cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return value;
  }

  async function getOverview() {
    const [runtime, scheduled] = await Promise.all([
      getRuntimeConfig(),
      pool.query<Record<string, unknown>>("SELECT id,status,started_at,finished_at,members_checked,works_seen,candidates_created,works_updated,failures FROM scholarly_sync_runs WHERE trigger_type='scheduled' ORDER BY started_at DESC LIMIT 1"),
    ]);
    return {
      settings: {
        enabled: runtime.enabled, crossrefContactEmail: runtime.crossrefContactEmail ?? "", version: runtime.version,
        updatedAt: runtime.updatedAt, source: runtime.source,
        openAlexApiKey: { configured: Boolean(runtime.openAlexApiKey), masked: maskSecret(runtime.openAlexApiKey), version: runtime.secretVersion },
      },
      lastScheduledRun: scheduled.rows[0] ?? null,
    };
  }

  async function updateGlobal(input: { enabled: boolean; crossrefContactEmail: string | null; version: number; openAlexApiKey?: string }, actorId: string) {
    const client = await pool.connect(); const keyChanged = Boolean(input.openAlexApiKey?.trim());
    try {
      await client.query("BEGIN");
      const current = await client.query<SettingsRow>("SELECT enabled,crossref_contact_email,version::text,updated_at FROM scholarly_sync_settings WHERE singleton=1 FOR UPDATE");
      const currentVersion = current.rows[0] ? Number(current.rows[0].version) : 0;
      if (currentVersion !== input.version) throw new SettingsError("设置已被其他管理员更新，请重新加载", "SETTING_CONFLICT", 409);
      if (current.rows[0]) {
        await client.query("UPDATE scholarly_sync_settings SET enabled=$1,crossref_contact_email=$2,version=version+1,updated_by=$3,updated_at=now() WHERE singleton=1", [input.enabled, input.crossrefContactEmail || null, actorId]);
      } else {
        await client.query("INSERT INTO scholarly_sync_settings(singleton,enabled,crossref_contact_email,updated_by) VALUES(1,$1,$2,$3)", [input.enabled, input.crossrefContactEmail || null, actorId]);
      }
      if (keyChanged) {
        const encrypted = encryptSecret(input.openAlexApiKey!.trim(), options.encryptionSecret);
        await client.query(
          `INSERT INTO system_secrets(key,ciphertext,nonce,auth_tag,updated_by) VALUES($1,$2,$3,$4,$5)
           ON CONFLICT(key) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,nonce=EXCLUDED.nonce,auth_tag=EXCLUDED.auth_tag,
           version=system_secrets.version+1,updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [OPENALEX_SECRET_KEY, encrypted.ciphertext, encrypted.nonce, encrypted.authTag, actorId],
        );
      }
      await client.query(
        "INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'scholarly.settings.update','scholarly_sync_settings','global',$2::jsonb)",
        [actorId, JSON.stringify({ enabled: input.enabled, crossrefContactConfigured: Boolean(input.crossrefContactEmail), openAlexKeyChanged: keyChanged })],
      );
      await client.query("COMMIT"); invalidate();
      return { keyChanged };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  return { getRuntimeConfig, getOverview, updateGlobal, invalidate };
}

export type ScholarlySyncSettingsService = ReturnType<typeof createScholarlySyncSettingsService>;
