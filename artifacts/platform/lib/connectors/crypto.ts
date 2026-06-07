/**
 * Envelope encryption for connector credentials.
 *
 * Each row carries a freshly-generated 256-bit data key wrapped by a
 * deployment master key. The plaintext credential bag is JSON-encoded then
 * AES-256-GCM-encrypted under the data key. Tamper detection is intrinsic
 * to GCM (decryption fails on auth tag mismatch).
 *
 * Master key sources, in priority order:
 *   1. CONNECTOR_ENCRYPTION_KEY (base64 or hex; must decode to ≥ 32 bytes)
 *   2. CLERK_SECRET_KEY (hashed to 32 bytes)
 *   3. NEXTAUTH_SECRET / SESSION_SECRET (hashed to 32 bytes)
 *
 * Without any of these, encryption falls back to a process-stable key derived
 * from `process.env.NODE_ENV + 'finsyt-default'`. That fallback is logged
 * loudly and must never be used in production — `assertEncryptionConfigured()`
 * is meant to fail-close at server startup.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const KEY_VERSION = "v1";
const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const DATA_KEY_LEN = 32;

function decodeMaybeBase64OrHex(s: string): Buffer | null {
  try {
    if (/^[0-9a-f]+$/i.test(s) && s.length % 2 === 0) return Buffer.from(s, "hex");
  } catch { /* fall through */ }
  try {
    const buf = Buffer.from(s, "base64");
    if (buf.length >= 16) return buf;
  } catch { /* ignore */ }
  return null;
}

function deriveMasterKey(): { key: Buffer; isFallback: boolean } {
  const explicit = process.env.CONNECTOR_ENCRYPTION_KEY?.trim();
  if (explicit) {
    const decoded = decodeMaybeBase64OrHex(explicit);
    const buf = (decoded && decoded.length >= 32) ? decoded.subarray(0, 32) :
                createHash("sha256").update(explicit).digest();
    return { key: buf, isFallback: false };
  }
  const clerk = process.env.CLERK_SECRET_KEY?.trim();
  if (clerk) {
    return { key: createHash("sha256").update(clerk).update("|connectors").digest(), isFallback: false };
  }
  const nextauth = (process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET || "").trim();
  if (nextauth) {
    return { key: createHash("sha256").update(nextauth).update("|connectors").digest(), isFallback: false };
  }
  // ── Last-ditch fallback ────────────────────────────────────────────────
  // Process-stable but trivially derivable. Loud warning + must be rejected
  // by `assertEncryptionConfigured` in production.
  // eslint-disable-next-line no-console
  console.warn(
    "[connectors:crypto] No CONNECTOR_ENCRYPTION_KEY / CLERK_SECRET_KEY / NEXTAUTH_SECRET set — " +
    "falling back to a derived default key. NEVER use this in production.",
  );
  const seed = `${process.env.NODE_ENV || "dev"}|finsyt-default-encryption-key`;
  return { key: createHash("sha256").update(seed).digest(), isFallback: true };
}

let cachedKey: { key: Buffer; isFallback: boolean } | null = null;
function masterKey(): { key: Buffer; isFallback: boolean } {
  if (!cachedKey) cachedKey = deriveMasterKey();
  return cachedKey;
}

/** Throw at startup if the master key is the unsafe fallback in production. */
export function assertEncryptionConfigured(): void {
  const { isFallback } = masterKey();
  if (isFallback && process.env.NODE_ENV === "production") {
    throw new Error(
      "Connector credentials require a real master key in production. " +
      "Set CONNECTOR_ENCRYPTION_KEY (≥ 32 bytes, base64 or hex) before starting the server.",
    );
  }
}

interface EncryptedPayload {
  /** Format version — bump if this layout changes. */
  v: 1;
  /** Key id of the master key that wrapped the data key (e.g. "v1"). */
  k: string;
  /** Wrapped (encrypted-with-master) data key, base64. */
  dk: string;
  /** Data-key wrap auth tag, base64. */
  dkt: string;
  /** Data-key wrap IV, base64. */
  dki: string;
  /** Ciphertext, base64. */
  ct: string;
  /** Ciphertext IV, base64. */
  ci: string;
  /** Ciphertext auth tag, base64. */
  ctg: string;
}

function aesGcmEncrypt(key: Buffer, plaintext: Buffer): { iv: Buffer; ct: Buffer; tag: Buffer } {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv, { authTagLength: TAG_LEN });
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, ct, tag };
}

function aesGcmDecrypt(key: Buffer, iv: Buffer, ct: Buffer, tag: Buffer): Buffer {
  const decipher = createDecipheriv(ALG, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Encrypt a credentials bag and return the storable string blob. */
export function encryptCredentials(plain: Record<string, string>): { keyId: string; payload: string } {
  // Fail-closed: every credential write in production requires a real master
  // key. We invoke the assertion inline (not just at boot) so that any new
  // server entry point — Next route handlers, scripts, edge workers — gets
  // the same guarantee without having to remember a startup wiring step.
  assertEncryptionConfigured();
  const { key } = masterKey();
  const dataKey = randomBytes(DATA_KEY_LEN);
  const wrap = aesGcmEncrypt(key, dataKey);
  const body = aesGcmEncrypt(dataKey, Buffer.from(JSON.stringify(plain)));
  const out: EncryptedPayload = {
    v: 1,
    k: KEY_VERSION,
    dk: wrap.ct.toString("base64"),
    dkt: wrap.tag.toString("base64"),
    dki: wrap.iv.toString("base64"),
    ct: body.ct.toString("base64"),
    ci: body.iv.toString("base64"),
    ctg: body.tag.toString("base64"),
  };
  return { keyId: KEY_VERSION, payload: Buffer.from(JSON.stringify(out)).toString("base64") };
}

/** Decrypt a stored blob. Throws on tamper or wrong key. */
export function decryptCredentials(blob: string): Record<string, string> {
  assertEncryptionConfigured();
  const { key } = masterKey();
  const obj = JSON.parse(Buffer.from(blob, "base64").toString("utf-8")) as EncryptedPayload;
  if (obj.v !== 1) throw new Error(`Unknown credential payload version ${obj.v}`);
  const dataKey = aesGcmDecrypt(
    key,
    Buffer.from(obj.dki, "base64"),
    Buffer.from(obj.dk, "base64"),
    Buffer.from(obj.dkt, "base64"),
  );
  const plain = aesGcmDecrypt(
    dataKey,
    Buffer.from(obj.ci, "base64"),
    Buffer.from(obj.ct, "base64"),
    Buffer.from(obj.ctg, "base64"),
  );
  return JSON.parse(plain.toString("utf-8")) as Record<string, string>;
}

/** Mask a credential value for safe display ("…last 4"). */
export function maskCredential(value: string | undefined | null): string {
  if (!value) return "";
  if (value.length <= 4) return "•".repeat(value.length);
  return "•".repeat(Math.max(0, value.length - 4)) + value.slice(-4);
}

// ── HMAC-signed payloads (used for OAuth state cookies) ──────────────────────
// We piggy-back on the master key for HMAC so there is exactly one secret to
// rotate. Format: base64url(json) + "." + base64url(hmac)
function b64u(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64u(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/** Sign a JSON-serialisable object so it can be safely round-tripped via cookie/URL. */
export function signSerialized(obj: unknown): string {
  const { key } = masterKey();
  const body = b64u(Buffer.from(JSON.stringify(obj), "utf-8"));
  const sig = b64u(createHmac("sha256", key).update(body).digest());
  return `${body}.${sig}`;
}

/** Verify and parse a `signSerialized` value. Returns `null` on tamper / format error. */
export function verifySerialized<T = unknown>(token: string | undefined | null): T | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const { key } = masterKey();
  const expected = createHmac("sha256", key).update(body).digest();
  let provided: Buffer;
  try { provided = fromB64u(sig); } catch { return null; }
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  try { return JSON.parse(fromB64u(body).toString("utf-8")) as T; } catch { return null; }
}
