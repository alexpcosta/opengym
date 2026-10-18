// The food diary on this device: recent days cached locally, synced one day at a time with
// /api/diet/* (api/diet/store.js). Not part of the main state blob — see that file for why.
//
// Sync rule, per day, the same one the state blob uses: the newer `_ts` wins, and a day this
// device changed but has not managed to send yet (`dirty`) is never overwritten by a pull.
import { create } from 'zustand'
import { api } from '../lib/api.js'
import { isoOf, todayISO } from '../lib/format.js'

const KEY = 'gym_diet_v1'
const KEEP_DAYS = 45
const clone = o => JSON.parse(JSON.stringify(o))

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    if (v && v.days) return { days: v.days, dirty: v.dirty || [] }
  } catch { /* corrupt or blocked storage — start empty */ }
  return { days: {}, dirty: [] }
}

export const isoAdd = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const EMPTY_DAY = () => ({ entries: [], _ts: 0 })

export const useDiet = create((set, get) => {
  let flushTm = null
  const save = () => {
    const { days, dirty } = get()
    // Keep the cache small: recent days only, plus anything not yet sent.
    const cutoff = isoAdd(todayISO(), -KEEP_DAYS)
    const kept = {}
    Object.entries(days).forEach(([d, day]) => { if (d >= cutoff || dirty.includes(d)) kept[d] = day })
    try { localStorage.setItem(KEY, JSON.stringify({ days: kept, dirty })) } catch { /* full or blocked */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && get().dirty.length) get().flush()
  })

  return {
    ...load(),
    loading: false,
    error: null,

    day: date => get().days[date] || EMPTY_DAY(),

    /** Pull a range of days from the server and merge it in. */
    async pull(from, to) {
      set({ loading: true })
      try {
        const { days: remote } = await api('/api/diet/days?from=' + from + '&to=' + to)
        const days = { ...get().days }
        const dirty = new Set(get().dirty)
        for (let d = from; d <= to; d = isoAdd(d, 1)) {
          if (dirty.has(d)) continue
          if (remote[d]) { if ((remote[d]._ts || 0) >= (days[d]?._ts || 0)) days[d] = remote[d] }
          else if (days[d]) delete days[d]      // emptied on another device
        }
        set({ days, loading: false, error: null })
        save()
      } catch (e) { set({ loading: false, error: e.message }) }
      if (get().dirty.length) get().flush()
    },

    /** Change one day: fn(day) mutates a copy; it is saved locally at once and sent shortly. */
    edit(date, fn) {
      const day = clone(get().days[date] || EMPTY_DAY())
      fn(day)
      day._ts = Date.now()
      const dirty = get().dirty.includes(date) ? get().dirty : [...get().dirty, date]
      set({ days: { ...get().days, [date]: day }, dirty })
      save()
      clearTimeout(flushTm)
      flushTm = setTimeout(() => get().flush(), 1500)
    },

    async flush() {
      clearTimeout(flushTm)
      for (const date of [...get().dirty]) {
        const day = get().days[date] || EMPTY_DAY()
        try {
          await api('/api/diet/day', { method: 'PUT', body: JSON.stringify({ date, ...day }) })
          // Only clear it if it did not change again while the request was out.
          if ((get().days[date]?._ts || 0) === day._ts) set({ dirty: get().dirty.filter(d => d !== date) })
        } catch (e) {
          if (e.status === 409) {
            // Another device wrote a newer version of this day: theirs wins, as with the plan.
            try {
              const { days: remote } = await api('/api/diet/days?from=' + date + '&to=' + date)
              set({ days: { ...get().days, [date]: remote[date] || EMPTY_DAY() }, dirty: get().dirty.filter(d => d !== date) })
            } catch { /* try again next time */ }
          } else break   // offline — keep everything queued
        }
      }
      save()
    },

    /** Sign-out: nothing of this profile's diary stays on the device. */
    reset() {
      clearTimeout(flushTm)
      try { localStorage.removeItem(KEY) } catch { /* */ }
      set({ days: {}, dirty: [], error: null })
    }
  }
})
