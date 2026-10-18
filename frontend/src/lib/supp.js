// Supplements, student side: what is due today and how a day went.
//
// The scheduling arithmetic is duplicated (not imported) from api/supp/log.js — the server
// runs the same sums for the trainer's daily check, and the two runtimes share no code. Both
// copies are a dozen lines of pure arithmetic; keep them in step.
//
// A plan item is due on some weekdays, `perDay` times on each. The log stores which of those
// slots were ticked, by index: `taken[itemId] = [0, 2]`. Indexes, not clock times, so a
// trainer who moves 08:00 to 09:00 does not erase what was already marked.

export const MAX_PER_DAY = 6
export const MAX_ITEMS = 40

// The log lives on the server (api/supp/*): no server, no ticking. Guests, the standalone
// mobile app and the static demo never see the screen.
export const suppAvailable = (user, { demo, mobile } = {}) => !!user && !demo && !mobile

/** The list in force — a trainer's, while they have one. null when there is none. */
export const suppsOf = S => (S?.supps && !S.supps.removed && S.supps.items?.length ? S.supps.items : null)
export const suppLocked = S => !!suppsOf(S)
/** "Your trainer updated your supplements": a version that has not been looked at yet. */
export const suppUnseen = S => suppLocked(S) && (S.supps.seenVersion || 0) < S.supps.version

/** Whether `item` is due on this weekday (0 = Sunday). An empty `days` means every day. */
export const dueOn = (item, weekday) => !item.days?.length || item.days.includes(weekday)

/** How many doses of `item` a due day has. */
export const slotsOf = item => Math.min(MAX_PER_DAY, Math.max(1, item.perDay || item.times?.length || 1))

/** The slots of `item` ticked on `day`, as a Set of indexes (an unknown item gives an empty one). */
export function ticksOf(day, item) {
  const n = slotsOf(item)
  const list = Array.isArray(day?.taken?.[item.id]) ? day.taken[item.id] : []
  return new Set(list.filter(s => s >= 0 && s < n))
}

/** The items due on this weekday, in the plan's order. */
export const dueItems = (items, weekday) => (items || []).filter(i => dueOn(i, weekday))

/**
 * How one day went: { due, taken, status } with status
 *   'rest' nothing due · 'none' nothing marked · 'partial' some · 'ok' every dose marked.
 */
export function dayStatus(items, day, weekday) {
  let due = 0, taken = 0
  for (const it of items || []) {
    if (!dueOn(it, weekday)) continue
    due += slotsOf(it)
    taken += ticksOf(day, it).size
  }
  return { due, taken, status: !due ? 'rest' : !taken ? 'none' : taken >= due ? 'ok' : 'partial' }
}

/** The weekday an ISO date falls on, counted the way the server counts it. */
export const weekdayOf = iso => new Date(iso + 'T12:00:00').getDay()

/** The label for one dose of an item: its own time when the trainer gave times, else "1 of 3". */
export const slotTime = (item, slot) => item.times?.[slot] || null
