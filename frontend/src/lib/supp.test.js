import { describe, it, expect } from 'vitest'
import { dueOn, slotsOf, ticksOf, dueItems, dayStatus, weekdayOf, slotTime, suppsOf, suppLocked, suppUnseen } from './supp.js'
import { applyTrainerSupps, markSuppsSeen } from './trainer.js'

const ITEMS = [
  { id: 'sCre', name: 'Creatina', dose: '5 g', days: [1, 2, 3, 4, 5], perDay: 1 },
  { id: 'sWhey', name: 'Whey', dose: '30 g', days: [], perDay: 2, times: ['08:00', '20:00'] }
]

describe('what is due', () => {
  it('an empty days list means every day', () => {
    expect(dueOn(ITEMS[1], 0)).toBe(true)
    expect(dueOn(ITEMS[0], 0)).toBe(false)
    expect(dueOn(ITEMS[0], 1)).toBe(true)
  })

  it('times say how many doses a day has', () => {
    expect(slotsOf(ITEMS[1])).toBe(2)
    expect(slotsOf({ id: 's1', perDay: 3 })).toBe(3)
    expect(slotsOf({ id: 's1' })).toBe(1)
    expect(slotsOf({ id: 's1', perDay: 99 })).toBe(6)
  })

  it('only the items that fall on the weekday are listed', () => {
    expect(dueItems(ITEMS, 1).map(i => i.id)).toEqual(['sCre', 'sWhey'])
    expect(dueItems(ITEMS, 6).map(i => i.id)).toEqual(['sWhey'])
  })

  it('a dose carries its time when the trainer gave one', () => {
    expect(slotTime(ITEMS[1], 1)).toBe('20:00')
    expect(slotTime(ITEMS[0], 0)).toBe(null)
    // Positional and padded: an unlabelled dose falls back to being numbered.
    const partly = { id: 's1', perDay: 3, times: ['', '09:00', ''] }
    expect(slotTime(partly, 0)).toBe(null)
    expect(slotTime(partly, 1)).toBe('09:00')
    expect(slotsOf(partly)).toBe(3)
  })
})

describe('how a day went', () => {
  it('counts the ticked doses against the ones that were due', () => {
    expect(dayStatus(ITEMS, null, 1)).toEqual({ due: 3, taken: 0, status: 'none' })
    expect(dayStatus(ITEMS, { taken: { sCre: [0] } }, 1)).toEqual({ due: 3, taken: 1, status: 'partial' })
    expect(dayStatus(ITEMS, { taken: { sCre: [0], sWhey: [0, 1] } }, 1)).toEqual({ due: 3, taken: 3, status: 'ok' })
  })

  it('a day nothing falls on is rest, not a miss', () => {
    expect(dayStatus([ITEMS[0]], null, 0).status).toBe('rest')
    expect(dayStatus([], null, 1).status).toBe('rest')
  })

  it('ticks for doses the plan no longer has count neither way', () => {
    expect(dayStatus([ITEMS[0]], { taken: { sCre: [0, 3], sGone: [0] } }, 1)).toEqual({ due: 1, taken: 1, status: 'ok' })
    expect(ticksOf({ taken: { sCre: [0, 9] } }, ITEMS[0])).toEqual(new Set([0]))
  })

  it('reads the weekday of an ISO date', () => {
    expect(weekdayOf('2026-10-19')).toBe(1)   // a Monday
    expect(weekdayOf('2026-10-18')).toBe(0)
  })
})

describe('applying a trainer’s list', () => {
  const sent = { version: 3, items: ITEMS, note: 'Depois do treino', by: 'Coach', updatedAt: 111 }

  it('lands in state, keeps what has been seen, and unlocks on removal', () => {
    const s = {}
    applyTrainerSupps(s, sent)
    expect(s.supps.version).toBe(3)
    expect(s.supps.items).toHaveLength(2)
    expect(s.supps.items[1].times).toEqual(['08:00', '20:00'])
    expect(suppsOf(s)).toHaveLength(2)
    expect(suppLocked(s)).toBe(true)
    // Not looked at yet, so the Home card shows.
    expect(suppUnseen(s)).toBe(true)
    markSuppsSeen(s)
    expect(suppUnseen(s)).toBe(false)

    // A newer version is news again.
    applyTrainerSupps(s, { ...sent, version: 4 })
    expect(suppUnseen(s)).toBe(true)

    // A tombstone keeps the version — a removal already applied is not re-applied every boot.
    applyTrainerSupps(s, { version: 5, removed: true })
    expect(s.supps).toEqual({ version: 5, removed: true })
    expect(suppLocked(s)).toBe(false)
    // The server has none at all (a data reset): the list simply goes.
    applyTrainerSupps(s, null)
    expect(s.supps).toBe(null)
    expect(suppsOf(s)).toBe(null)
  })

  it('an empty list is the same as no list', () => {
    const s = {}
    applyTrainerSupps(s, { version: 2, items: [] })
    expect(suppLocked(s)).toBe(false)
    expect(s.supps.removed).toBe(true)
  })
})
