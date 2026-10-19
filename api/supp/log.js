/* Shape and arithmetic of the supplement log — shared by the log routes and the trainer's
 * daily supplement check. Pure functions.
 *
 * A plan item is due on some weekdays, `perDay` times on each of them. The log says which of
 * those slots were ticked: `taken[itemId] = [0, 2]`. Slot indexes, not clock times, so a
 * trainer who changes 08:00 to 09:00 does not erase what was already marked, and a student in
 * another time zone is never "late".
 */
export const MAX_ITEMS = 40;
export const MAX_PER_DAY = 6;

const isStr = v => typeof v === 'string' && v.trim().length > 0;

/** Whether `item` is due on this weekday (0 = Sunday). An empty `days` means every day. */
export const dueOn = (item, weekday) => !item.days?.length || item.days.includes(weekday);

/** How many doses of `item` a due day has. */
export const slotsOf = item => Math.min(MAX_PER_DAY, Math.max(1, item.perDay || item.times?.length || 1));

/**
 * How one day went: { due, taken, status }, where status is
 *   'rest'    — nothing was due (no item falls on this weekday)
 *   'none'    — something was due and nothing was marked
 *   'partial' — some doses marked, some not
 *   'ok'      — every dose due that day was marked
 * Slots ticked for an item that is no longer due (the plan changed) are ignored, not counted
 * against the student and not credited either.
 */
export function dayStatus(items, day, weekday) {
  let due = 0, taken = 0;
  for (const it of items || []) {
    if (!dueOn(it, weekday)) continue;
    const n = slotsOf(it);
    due += n;
    const ticks = day?.taken?.[it.id];
    if (Array.isArray(ticks)) taken += ticks.filter(s => s >= 0 && s < n).length;
  }
  return { due, taken, status: !due ? 'rest' : !taken ? 'none' : taken >= due ? 'ok' : 'partial' };
}

/** The items of a due day that have at least one dose still unmarked, for a push body. */
export function pending(items, day, weekday) {
  return (items || []).filter(it => {
    if (!dueOn(it, weekday)) return false;
    const n = slotsOf(it);
    const ticks = Array.isArray(day?.taken?.[it.id]) ? day.taken[it.id].filter(s => s >= 0 && s < n) : [];
    return ticks.length < n;
  });
}

/** A clean stored day, or an empty one. Unknown item ids are kept: the plan may be older here. */
export function cleanDay(body) {
  const taken = {};
  const src = body?.taken && typeof body.taken === 'object' ? body.taken : {};
  for (const [id, slots] of Object.entries(src).slice(0, MAX_ITEMS)) {
    if (!isStr(id) || !Array.isArray(slots)) continue;
    const clean = [...new Set(slots.filter(s => Number.isInteger(s) && s >= 0 && s < MAX_PER_DAY))].sort((a, b) => a - b);
    if (clean.length) taken[String(id).slice(0, 40)] = clean;
  }
  return { taken, _ts: typeof body?._ts === 'number' && Number.isFinite(body._ts) ? Math.round(body._ts) : Date.now() };
}
