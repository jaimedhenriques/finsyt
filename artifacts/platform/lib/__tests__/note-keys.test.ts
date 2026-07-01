/**
 * Regression tests for research-note key validation (lib/note-keys).
 *
 * Background: private-company profiles namespace their notes with a
 * `PRIVATE:<coresignal id>` key instead of a ticker. The /api/notes route
 * previously validated every key against a ticker-only regex, so private keys
 * were rejected with 400 and private notes / "Pin to notebook" silently fell
 * back to local-only storage. These tests lock in that both shapes are accepted
 * and that wildcard / whitespace inputs (which could reach the SQL `like`
 * clause) are still rejected.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isValidNoteKey, readNoteSymbol, MAX_NOTE_KEY_LEN } from '../note-keys'

test('isValidNoteKey accepts public tickers', () => {
  for (const s of ['AAPL', 'MSFT', 'BRK.B', 'BF-B', 'A', '7203']) {
    assert.equal(isValidNoteKey(s), true, s)
  }
})

test('isValidNoteKey accepts private-entity keys', () => {
  for (const s of ['PRIVATE:1', 'PRIVATE:12345', 'PRIVATE:99999999999999999999']) {
    assert.equal(isValidNoteKey(s), true, s)
  }
})

test('isValidNoteKey rejects malformed or SQL-unsafe keys', () => {
  for (const s of [
    '',                  // empty
    'private:123',       // lowercase (the route upper-cases before validating)
    'PRIVATE:',          // no id
    'PRIVATE:abc',       // non-numeric id
    'PRIVATE:12 34',     // whitespace in id
    'AA%',               // SQL `like` wildcard
    'AA_',               // SQL `like` wildcard
    'ABCDEFGHIJKLM',     // 13 chars — over the 12-char ticker limit
    'AA BB',             // whitespace
    ':123',              // missing PRIVATE prefix
  ]) {
    assert.equal(isValidNoteKey(s), false, s)
  }
})

test('readNoteSymbol parses both ticker and private-entity prefixes', () => {
  assert.equal(readNoteSymbol('[AAPL] 2024-01-01T00:00:00.000Z'), 'AAPL')
  assert.equal(readNoteSymbol('[BRK.B] some note'), 'BRK.B')
  assert.equal(readNoteSymbol('[PRIVATE:12345] my note'), 'PRIVATE:12345')
  assert.equal(readNoteSymbol('no prefix here'), null)
})

test('a private key survives the route store/read contract', () => {
  // Mirrors the POST path (upper-case + slice + validate) and the GET path
  // (readNoteSymbol on the stored `[KEY] …` title) without touching the DB.
  const stored = 'private:12345'.toUpperCase().slice(0, MAX_NOTE_KEY_LEN)
  assert.equal(stored, 'PRIVATE:12345')
  assert.equal(isValidNoteKey(stored), true)
  const title = `[${stored}] AI brief body`
  assert.equal(readNoteSymbol(title), stored)
})
