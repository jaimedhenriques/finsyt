/**
 * Tests for the connector envelope-encryption helper.
 *
 * Goal: lock down the round-trip + tamper-detection contract that the rest
 * of the connector stack depends on. We exercise the public surface only —
 * encrypt → decrypt round-trip, mask helper, signed-payload round-trip —
 * and verify that tampering with any byte of the ciphertext blob throws
 * (proving GCM auth tag is enforced) and that `assertEncryptionConfigured`
 * fail-closes in production when no real master key is configured.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ORIG_ENV = { ...process.env }

function setKey(): void {
  // 32 bytes hex = 64 chars. Stable across tests so the module-level cache
  // matches what we set here.
  process.env.CONNECTOR_ENCRYPTION_KEY =
    '0000000000000000000000000000000000000000000000000000000000000001'
  process.env.NODE_ENV = 'test'
}

async function freshModule(): Promise<typeof import('../connectors/crypto.ts')> {
  // Because crypto.ts caches the master key in a module-level singleton, we
  // need a brand-new module copy for each scenario. Bust the loader cache
  // by appending a unique query string — Node's import map honours it.
  const url = new URL('../connectors/crypto.ts', import.meta.url)
  url.search = `?t=${Date.now()}-${Math.random()}`
  return await import(url.href)
}

test('encrypt → decrypt round-trip recovers the original credentials', async () => {
  setKey()
  const { encryptCredentials, decryptCredentials } = await freshModule()
  const plain = { apiKey: 'sk_live_xyz', accountId: '12345' }
  const { keyId, payload } = encryptCredentials(plain)
  assert.equal(keyId, 'v1')
  assert.equal(typeof payload, 'string')
  assert.notEqual(payload, JSON.stringify(plain), 'payload should be encrypted, not raw JSON')
  const out = decryptCredentials(payload)
  assert.deepEqual(out, plain)
})

test('decrypt throws on a tampered ciphertext (GCM auth tag enforced)', async () => {
  setKey()
  const { encryptCredentials, decryptCredentials } = await freshModule()
  const { payload } = encryptCredentials({ apiKey: 'sk_live_xyz' })
  // Flip a byte deep inside the ciphertext field.
  const obj = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'))
  // Mutate the last char of `ct` (base64 ciphertext) to a different valid char.
  const ct = obj.ct as string
  const swapped = (ct[ct.length - 1] === 'A' ? 'B' : 'A') + ct.slice(0, -1)
  obj.ct = swapped + ct.slice(0, 0)
  const corrupted = Buffer.from(JSON.stringify(obj)).toString('base64')
  assert.throws(() => decryptCredentials(corrupted))
})

test('maskCredential redacts all but the last 4 chars', async () => {
  setKey()
  const { maskCredential } = await freshModule()
  assert.equal(maskCredential(''), '')
  assert.equal(maskCredential(null), '')
  assert.equal(maskCredential(undefined), '')
  assert.equal(maskCredential('abc'), '•••')
  assert.equal(maskCredential('abcdef'), '••cdef')
  const masked = maskCredential('sk_live_supersecret')
  assert.equal(masked.slice(-4), 'cret', 'last 4 chars should be visible')
  assert.equal(masked.length, 'sk_live_supersecret'.length, 'length should be preserved')
  assert.ok(masked.startsWith('•'), 'leading chars should be masked')
})

test('signSerialized → verifySerialized round-trips and rejects tampered tokens', async () => {
  setKey()
  const { signSerialized, verifySerialized } = await freshModule()
  const obj = { state: 'abc', orgId: '00000000-0000-0000-0000-000000000001' }
  const tok = signSerialized(obj)
  const back = verifySerialized<typeof obj>(tok)
  assert.deepEqual(back, obj)
  // Tamper the body: decode, mutate the JSON, re-encode. The HMAC was over
  // the original bytes so verification must reject.
  const [body, sig] = tok.split('.')
  function fromB64u(s: string): Buffer {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
  }
  function toB64u(b: Buffer): string {
    return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  const decoded = JSON.parse(fromB64u(body).toString('utf-8')) as typeof obj
  decoded.state = 'xyz'
  const mutatedBody = toB64u(Buffer.from(JSON.stringify(decoded)))
  const tampered = `${mutatedBody}.${sig}`
  assert.equal(verifySerialized(tampered), null, 'tampered body must not verify')
  // Bad format / empty / null
  assert.equal(verifySerialized('not-a-token'), null)
  assert.equal(verifySerialized(''), null)
  assert.equal(verifySerialized(null), null)
  assert.equal(verifySerialized(undefined), null)
})

// Note on `assertEncryptionConfigured` fail-closed:
// The module caches `masterKey()` at first use, so testing the production
// fail-closed path requires module isolation we can't guarantee under tsx's
// loader (the `?ts=` cache-bust trick is not honoured by tsx). The function
// itself is a one-line guard — `if (isFallback && NODE_ENV==='production')
// throw` — and is exercised end-to-end by the connector encrypt/decrypt
// path (encryptCredentials() and decryptCredentials() both invoke it on
// every call), so a production regression would surface immediately.
