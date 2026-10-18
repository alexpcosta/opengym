// Which doses this profile ticked, per day, synced with /api/supp/* (api/supp/store.js).
// Not part of the main state blob — the trainer's daily check reads these days on the server,
// and a blob that a stale device re-PUTs would take ticks away again.
//
// Sync rule, per day, the same one the diary and the state blob use: the newer `_ts` wins, and
// a day this device changed but has not managed to send yet (`dirty`) is never overwritten.
import { create } from 'zustand'
import { api } from '../lib/api.js'
import { isoOf, todayISO } from '../lib/format.js'

const KEY = 'gym_supp_v1'
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
const EMPTY_DAY = () => ({ taken: {}, _ts: 0 })

export const useSupp = create((set, get) => {
  let flushTm = null
  const save = () => {
    const { days, dirty } = get()
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
        const { days: remote } = await api('/api/supp/days?from=' + from + '&to=' + to)
        const days = { ...get().days }
        const dirty = new Set(get().dirty)
        for (let d = from; d <= to; d = isoAdd(d, 1)) {
          if (dirty.has(d)) continue
          if (remote[d]) { if ((remote[d]._ts || 0) >= (days[d]?._ts || 0)) days[d] = remote[d] }
          else if (days[d]) delete days[d]      // unticked on another device
        }
        set({ days, loading: false, error: null })
        save()
      } catch (e) { set({ loading: false, error: e.message }) }
      if (get().dirty.length) get().flush()
    },

    /** Tick or untick one dose. Saved locally at once and sent a moment later. */
    toggle(date, itemId, slot) {
      get().edit(date, day => {
        const list = new Set(day.taken[itemId] || [])
        if (list.has(slot)) list.delete(slot); else list.add(slot)
        if (list.size) day.taken[itemId] = [...list].sort((a, b) => a - b)
        else delete day.taken[itemId]
      })
    },

    /** Tick every dose of a day's list at once ("took everything"). */
    takeAll(date, items) {
      get().edit(date, day => {
        items.forEach(({ id, slots }) => { day.taken[id] = Array.from({ length: slots }, (_, i) => i) })
      })
    },

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
          await api('/api/supp/day', { method: 'PUT', body: JSON.stringify({ date, ...day }) })
          // Only clear it if it did not change again while the request was out.
          if ((get().days[date]?._ts || 0) === day._ts) set({ dirty: get().dirty.filter(d => d !== date) })
        } catch (e) {
          if (e.status === 409) {
            // Another device ticked this day more recently: theirs wins, as with the diary.
            try {
              const { days: remote } = await api('/api/supp/days?from=' + date + '&to=' + date)
              set({ days: { ...get().days, [date]: remote[date] || EMPTY_DAY() }, dirty: get().dirty.filter(d => d !== date) })
            } catch { /* try again next time */ }
          } else break   // offline — keep everything queued
        }
      }
      save()
    },

    /** Sign-out: nothing of this profile's log stays on the device. */
    reset() {
      clearTimeout(flushTm)
      try { localStorage.removeItem(KEY) } catch { /* */ }
      set({ days: {}, dirty: [], error: null })
    }
  }
})
