import { describe, expect, it } from 'vitest'
import { validateRelease } from './check-ios-release.mjs'

describe('iOS archive inputs', () => {
  it('rejects a simulated Coach preview even when a backend URL is absent', () => {
    expect(() => validateRelease({ native: true, preview: true }, {})).toThrow('cannot be archived')
  })
  it('rejects an unmarked web build and a live reload server', () => {
    expect(() => validateRelease(null, {})).toThrow('build:ios')
    expect(() => validateRelease({ native: true, preview: false }, { server: { url: 'https://example.com' } })).toThrow('Live reload')
    expect(() => validateRelease({ native: true, preview: false }, { server: { cleartext: true } })).toThrow('cleartext')
  })
  it('accepts a bundled standalone build', () => {
    expect(() => validateRelease({ native: true, preview: false }, {})).not.toThrow()
  })
})
