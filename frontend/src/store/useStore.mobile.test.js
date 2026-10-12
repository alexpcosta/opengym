import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), reminder: vi.fn() }))
const api = vi.hoisted(() => vi.fn())
vi.mock('../lib/mobile.js', () => ({ MOBILE: true, nativeLoad: native.load, nativeSave: native.save, syncReminder: native.reminder }))
vi.mock('../lib/api.js', () => ({ api }))
vi.mock('../lib/demoSeed.js', () => ({ buildDemoState: () => ({ routines: [{ id: 'example', ex: [] }], workouts: [], bodyweight: [] }) }))

let values
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.clearAllMocks()
  values = new Map()
  vi.stubGlobal('localStorage', {
    getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: k => values.delete(k),
  })
  vi.stubGlobal('document', { addEventListener: vi.fn() })
  native.load.mockResolvedValue(null)
  native.save.mockResolvedValue(undefined)
  native.reminder.mockResolvedValue(true)
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('native preview boot', () => {
  it('seeds example data in separate storage and never contacts the server', async () => {
    vi.stubEnv('VITE_DEMO', '1')
    const real = JSON.stringify({ routines: [{ id: 'personal' }] })
    values.set('gym_state_v1', real)
    values.set('gym_user', JSON.stringify({ id: 'web-user' }))
    const { useStore } = await import('./useStore.js')
    expect(useStore.getState().user).toBeNull()
    await useStore.getState().boot()
    await vi.advanceTimersByTimeAsync(800)
    expect(useStore.getState().S.routines[0].id).toBe('example')
    expect(values.get('gym_state_v1')).toBe(real)
    expect(values.has('gym_preview_state_v1')).toBe(true)
    expect(native.save).toHaveBeenCalled()
    expect(api).not.toHaveBeenCalled()
  })
  it('restores edits from the file after WebView storage eviction without reseeding', async () => {
    vi.stubEnv('VITE_DEMO', '1')
    native.load.mockResolvedValue({ _ts: Date.now(), routines: [{ id: 'edited' }], workouts: [], bodyweight: [] })
    const { useStore } = await import('./useStore.js')
    await useStore.getState().boot()
    expect(useStore.getState().S.routines[0].id).toBe('edited')
    expect(values.has('gym_demo_seeded_v1')).toBe(true)
    expect(api).not.toHaveBeenCalled()
  })
  it('keeps the standalone build empty on first launch', async () => {
    vi.stubEnv('VITE_DEMO', '0')
    const { useStore } = await import('./useStore.js')
    await useStore.getState().boot()
    expect(useStore.getState().S.routines).toEqual([])
    expect(values.has('gym_demo_seeded_v1')).toBe(false)
    expect(api).not.toHaveBeenCalled()
  })
})
