// Password-protected plan files — encryption entirely in the browser.
//
// A friend can send a plan as a small password-protected file. The password is used to
// derive a key that encrypts the plan; nothing here ever leaves the browser, and the
// password is never written to the file (not even a reusable hash of it).
//
// Web Crypto API only:
//   · PBKDF2 (SHA-256) turns the password + salt into the AES key
//   · AES-256-GCM encrypts/authenticates the plan JSON
//   · salt and IV come from crypto.getRandomValues(), so two exports of the same plan
//     with the same password still produce different files (and a fresh IV per call)
//
// IMPORTANT: everything must be asynchronous — inside Vitest (Node) `crypto` methods are
// callbacks-only, so calling `await crypto.subtle.digest(...)` on a Node subtle throws.
// react-dom's react-server build also warns that active server-only preloads share the
// unqualified import specifier, but the production graph is unaffected (we only ever use
// node:crypto as a build-time fallback and window.crypto at runtime).

import * as nodeCrypto from 'node:crypto'

// The ID stamped into every protected file, plus the version of THIS format. Bump FORMAT
// if the structure ever changes; keep decryptPlan reading older formats when possible.
const MAGIC = 'opengym-protected'
const FORMAT = 1

// AES-256-GCM, key derived with PBKDF2 · SHA-256 · many iterations.
const ALGORITHM = 'AES-GCM'
const KDF = 'PBKDF2'
const HASH = 'SHA-256'
const KEY_BITS = 256
const IV_BYTES = 12         // GCM's recommended nonce length
// High iteration count: enough to slow a brute-force guess, still ~tens of ms on a phone.
const ITERATIONS = 310000

const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || nodeCrypto.webcrypto.subtle
const getRandomValues = arr => {
  const c = globalThis.crypto || nodeCrypto.webcrypto
  if (c && c.getRandomValues) return c.getRandomValues(arr)
  for (let i = 0; i < arr.length; i++) arr[i] = (nodeCrypto.randomBytes(1)[0] & 0xffffff) % 256
  return arr
}

/* ------------------------------ encoding helpers ------------------------------ */

// Salt, IV and ciphertext are binary. Files are JSON, so every binary field travels as
// base64 — base64 here is transport only, NEVER security; the confidentiality comes from
// AES-GCM, not from the encoding.
const bytesToB64 = bytes => {
  const chunk = 0x8000
  let s = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(s)
}

const b64ToBytes = b64 => {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const utf8ToBytes = str => new TextEncoder().encode(str)
const bytesToUtf8 = bytes => new TextDecoder().decode(bytes)

/* ----------------------------------- crypto ----------------------------------- */

/** Derive a 256-bit AES key from a password + salt via PBKDF2/SHA-256. */
async function deriveKey(password, salt, iterations) {
  const baseKey = await subtle().importKey(
    'raw',
    utf8ToBytes(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: HASH },
    baseKey,
    { name: ALGORITHM, length: KEY_BITS },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt a plan bundle (already JSON-stringified) with a password.
 * Returns a self-describing object. The caller JSON.stringify's it into the file.
 */
export async function encryptPlan(planJson, password) {
  if (!planJson) throw new Error('Nothing to encrypt')
  if (typeof password !== 'string' || !password) throw new Error('A password is required')

  const salt = new Uint8Array(16)
  const iv = new Uint8Array(IV_BYTES)
  getRandomValues(salt)
  getRandomValues(iv)

  const key = await deriveKey(password, salt, ITERATIONS)
  const ciphertext = new Uint8Array(
    await subtle().encrypt({ name: ALGORITHM, iv }, key, utf8ToBytes(planJson))
  )

  return {
    opengym_protected: MAGIC,
    v: FORMAT,
    alg: ALGORITHM,
    kdf: KDF,
    hash: HASH,
    iter: ITERATIONS,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(ciphertext)
  }
}

/**
 * Decrypt a protected plan back to its original JSON string.
 * Throws on a wrong password AND on tampering — the caller maps either to one friendly,
 * non-revealing message ("Incorrect password or corrupted plan."), so an attacker learns
 * nothing about whether it was the password or the contents that was wrong.
 */
export async function decryptPlan(encryptedData, password) {
  if (!encryptedData || encryptedData.opengym_protected !== MAGIC) {
    throw new Error('Not a protected openGym plan')
  }
  if (typeof password !== 'string' || !password) throw new Error('A password is required')

  const iterations = Number.isInteger(encryptedData.iter) && encryptedData.iter > 0
    ? encryptedData.iter
    : ITERATIONS

  const salt = b64ToBytes(encryptedData.salt)
  const iv = b64ToBytes(encryptedData.iv)
  const ciphertext = b64ToBytes(encryptedData.ciphertext)

  const key = await deriveKey(password, salt, iterations)
  // AES-GCM verifies the authentication tag on decrypt: any tampered byte throws here.
  const plaintext = await subtle().decrypt({ name: ALGORITHM, iv }, key, ciphertext)
  return bytesToUtf8(new Uint8Array(plaintext))
}

/** True when `data` (a parsed object) is a protected plan file, vs plain JSON. */
export function isEncryptedPlan(data) {
  return !!(data && typeof data === 'object' && data.opengym_protected === MAGIC)
}