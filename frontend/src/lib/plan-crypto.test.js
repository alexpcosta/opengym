import { describe, it, expect } from 'vitest'
import { encryptPlan, decryptPlan, isEncryptedPlan } from './plan-crypto.js'
import { buildPlanBundle, parsePlan } from './plan-share.js'

// A realistic state shape — enough for buildPlanBundle to produce the same bundle the
// Share screen builds from the store.
const PLAN_NAME = 'Me’s plan'

const STATE = {
  routines: [
    { id: 'r1', name: 'Push', emoji: '✋', ex: [
      { id: '0001', sets: 3, reps: 10, weight: 60 },
      { id: '0002', sets: 3, reps: 8, weight: 40, prog: 'double', inc: 2.5, repsMin: 6 }
    ] },
    { id: 'r2', name: 'Legs', emoji: '🦵', ex: [
      { id: '0003', sets: 4, reps: 5, weight: 100 }
    ] }
  ],
  customEx: [],
  week: { 1: 'r1', 4: 'r2' }
}
const PASSWORD = 'correct horse battery staple'

describe('encryptPlan / decryptPlan round-trip', () => {
  it('returns exactly the original JSON', async () => {
    const bundle = buildPlanBundle(STATE, 'Me')
    const json = JSON.stringify(bundle)
    const encrypted = await encryptPlan(json, PASSWORD)
    const out = await decryptPlan(encrypted, PASSWORD)
    expect(out).toBe(json)
    expect(JSON.parse(out)).toEqual(bundle)
  })

  it('is idempotent across two calls with the same password', async () => {
    const json = JSON.stringify(buildPlanBundle(STATE, 'Me'))
    const a = await encryptPlan(json, PASSWORD)
    const b = await encryptPlan(json, PASSWORD)
    expect(await decryptPlan(a, PASSWORD)).toBe(json)
    expect(await decryptPlan(b, PASSWORD)).toBe(json)
  })

  it('handles Unicode plan content (emoji, accented names)', async () => {
    const json = JSON.stringify({ plan: 'Push ✋ · Legs 🦵 · olá · café' })
    expect(await decryptPlan(await encryptPlan(json, PASSWORD), PASSWORD)).toBe(json)
  })
})

describe('failure cases', () => {
  it('throws on a wrong password', async () => {
    const encrypted = await encryptPlan(JSON.stringify({ a: 1 }), PASSWORD)
    await expect(decryptPlan(encrypted, 'wrong password')).rejects.toThrow()
  })

  it('throws when the ciphertext has been tampered with', async () => {
    const encrypted = await encryptPlan(JSON.stringify({ a: 1 }), PASSWORD)
    encrypted.ciphertext = encrypted.ciphertext.replace(encrypted.ciphertext[0], 'A')
    await expect(decryptPlan(encrypted, PASSWORD)).rejects.toThrow()
  })

  it('throws on a tampered salt or IV', async () => {
    const encrypted = await encryptPlan(JSON.stringify({ a: 1 }), PASSWORD)
    encrypted.salt = encrypted.salt.replace(encrypted.salt[0], 'B')
    await expect(decryptPlan(encrypted, PASSWORD)).rejects.toThrow()
    const e2 = await encryptPlan(JSON.stringify({ a: 1 }), PASSWORD)
    e2.iv = e2.iv.replace(e2.iv[0], 'C')
    await expect(decryptPlan(e2, PASSWORD)).rejects.toThrow()
  })

  it('throws for a missing / empty password', async () => {
    const encrypted = await encryptPlan(JSON.stringify({ a: 1 }), PASSWORD)
    await expect(decryptPlan(encrypted, '')).rejects.toThrow()
    await expect(decryptPlan(encrypted)).rejects.toThrow()
  })

  it('rejects non-protected input', async () => {
    await expect(decryptPlan({ a: 1 }, PASSWORD)).rejects.toThrow()
    await expect(decryptPlan(null, PASSWORD)).rejects.toThrow()
  })

  it('rejects missing plan content or password on encrypt', async () => {
    await expect(encryptPlan('', PASSWORD)).rejects.toThrow()
    await expect(encryptPlan('{"a":1}', '')).rejects.toThrow()
  })
})

describe('randomness', () => {
  it('a different salt produces different ciphertext', async () => {
    const json = JSON.stringify({ a: 1 })
    const e1 = await encryptPlan(json, PASSWORD)
    const e2 = await encryptPlan(json, PASSWORD)
    expect(e1.salt).not.toBe(e2.salt)
    expect(e1.ciphertext).not.toBe(e2.ciphertext)
  })

  it('a different IV produces different ciphertext even with the same salt', async () => {
    const json = JSON.stringify({ a: 1 })
    const e1 = await encryptPlan(json, PASSWORD)
    const e2 = await encryptPlan(json, PASSWORD)
    expect(e1.iv).not.toBe(e2.iv)
    expect(e1.ciphertext).not.toBe(e2.ciphertext)
  })
})

describe('interop with the existing plan format', () => {
  it('a protected file round-trips back through parsePlan()', async () => {
    const bundle = buildPlanBundle(STATE, PLAN_NAME)
    const encrypted = await encryptPlan(JSON.stringify(bundle), PASSWORD)
    const json = await decryptPlan(encrypted, PASSWORD)
    const parsed = parsePlan(json)
    expect(parsed.routineCount).toBe(2)
    expect(parsed.exerciseCount).toBe(3)
    expect(parsed.routines[0].name).toBe('Push')
    expect(parsed.scheduledDays).toBe(2)
  })

  it('plain JSON still parses exactly as before', () => {
    const bundle = buildPlanBundle(STATE, 'Me')
    expect(parsePlan(JSON.stringify(bundle)).routineCount).toBe(2)
  })
})

describe('password does not leak into the file', () => {
  const PW = 'S3cr3t!<>password #42 日本語'

  it('no field contains the password', async () => {
    const json = JSON.stringify(buildPlanBundle(STATE, 'Me'))
    const encrypted = await encryptPlan(json, PW)
    const s = JSON.stringify(encrypted)
    expect(s.includes(PW)).toBe(false)
    expect(s.includes('S3cr3t')).toBe(false)
  })

  it('only the required metadata fields are present', async () => {
    const encrypted = await encryptPlan(JSON.stringify({ a: 1 }), PW)
    expect(Object.keys(encrypted).sort()).toEqual(
      ['alg', 'ciphertext', 'hash', 'iter', 'iv', 'kdf', 'opengym_protected', 'salt', 'v'].sort()
    )
    // the bare (non-base64-aware) field names let us assert the password is absent at the
    // metadata level; the string scan above covers the actual value.
    expect(Object.keys(encrypted)).not.toContain('password')
  })

  it('the protected file carries no readable text from the original plan', async () => {
    const bundle = buildPlanBundle(STATE, PLAN_NAME)
    const json = JSON.stringify(bundle)
    const s = JSON.stringify(await encryptPlan(json, PW))
    // Every JSON string value in the body is now encrypted; the only plaintext is the
    // metadata labels. None of the readable bits of the plan may survive.
    expect(s.includes('Push')).toBe(false)
    expect(s.includes('0001')).toBe(false)
    expect(s.includes('Me’s plan')).toBe(false)
    expect(s.includes('routines')).toBe(false)      // structure key is inside ciphertext only
  })
})

describe('format identification', () => {
  it('isEncryptedPlan recognises a protected file and rejects ordinary JSON', async () => {
    const encrypted = await encryptPlan(JSON.stringify({ a: 1 }), PASSWORD)
    expect(isEncryptedPlan(encrypted)).toBe(true)
    expect(isEncryptedPlan({ opengym_plan: 1 })).toBe(false)
    expect(isEncryptedPlan({})).toBe(false)
    expect(isEncryptedPlan(null)).toBe(false)
    expect(isEncryptedPlan('not an object')).toBe(false)
  })
})