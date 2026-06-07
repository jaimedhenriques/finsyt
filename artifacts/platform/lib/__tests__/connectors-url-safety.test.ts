/**
 * SSRF guard tests.
 *
 * `assertSafeUrlSync` is the shape/scheme/literal-IP gate used at every
 * connector boundary (REST executor, MCP client, /test endpoint). The
 * async `assertSafeUrl` adds a DNS resolve step on top — we cover the
 * sync layer here since it's deterministic and doesn't require network.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeUrlSync, UrlSafetyError } from '../connectors/url-safety.ts'

const REJECT_CASES: Array<{ url: string; reason: RegExp }> = [
  { url: 'ftp://example.com',                reason: /scheme|http/i },
  { url: 'file:///etc/passwd',               reason: /scheme|http/i },
  { url: 'http://127.0.0.1/',                reason: /loopback/i },
  { url: 'http://localhost/',                reason: /localhost|loopback/i },
  { url: 'http://10.0.0.1/',                 reason: /rfc1918|private|local/i },
  { url: 'http://192.168.1.1/',              reason: /rfc1918|private|local/i },
  { url: 'http://172.16.0.1/',               reason: /rfc1918|private|local/i },
  { url: 'http://169.254.169.254/latest',    reason: /link[- ]?local|metadata/i },
  { url: 'http://[::1]/',                    reason: /loopback/i },
  { url: 'http://[fc00::1]/',                reason: /unique|private|local/i },
  { url: 'not a url',                        reason: /invalid|parse/i },
]

const ACCEPT_CASES: string[] = [
  'https://api.stripe.com/v1/customers',
  'https://api.openai.com/v1/chat/completions',
  'http://example.com:8080/foo',
]

for (const { url, reason } of REJECT_CASES) {
  test(`assertSafeUrlSync rejects ${url}`, () => {
    let thrown: unknown = null
    try { assertSafeUrlSync(url) } catch (e) { thrown = e }
    assert.ok(thrown instanceof UrlSafetyError, `Expected UrlSafetyError for ${url}, got ${thrown}`)
    assert.match((thrown as Error).message, reason)
  })
}

for (const url of ACCEPT_CASES) {
  test(`assertSafeUrlSync accepts ${url}`, () => {
    assert.doesNotThrow(() => assertSafeUrlSync(url))
  })
}
