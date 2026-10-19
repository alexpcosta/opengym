/* Date and plan helpers shared by the reminder loop in server.js and the trainer module.
   Pure functions over a user's synced state — no I/O, so both can be tested directly. */

// Duplicated (not imported) from frontend/src/lib/history.js effectiveRoutineId — tiny pure
// helper, not worth sharing across the two runtimes.
export function effectiveRoutineId(S, iso) {
  const ov = S.dayPlan?.[iso];
  if (ov === 'rest') return null;
  if (ov && S.routines?.some(r => r.id === ov)) return ov;
  const wd = new Date(iso + 'T12:00:00').getDay();
  return S.week?.[wd] || null;
}

// Computes "now" in an arbitrary IANA zone (e.g. "Europe/Lisbon") instead of the server's own —
// each user's reminder fires by their own clock, wherever they and their phone actually are.
export function userNow(tz, at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).formatToParts(at);
    const g = t => parts.find(p => p.type === t)?.value;
    const date = `${g('year')}-${g('month')}-${g('day')}`;
    // Intl renders midnight as "24" in some engines with hour12:false — normalise it.
    const hh = g('hour') === '24' ? '00' : g('hour');
    // Weekday is derived from the zone's own date, not the server's — a Sunday-evening review
    // has to be Sunday where the user is, which is what the reminder already assumes for time.
    return { date, hhmm: `${hh}:${g('minute')}`, weekday: new Date(date + 'T12:00:00Z').getUTCDay() };
  } catch { return null; } // unknown/invalid tz string — skip this user rather than guess
}

/** The zone a user's day is counted in: stamped by the client on boot, then the reminder's. */
export const zoneOf = S => S?.tz || S?.reminder?.tz || 'UTC';

/** ISO date `n` days before `iso` (calendar arithmetic at noon, so DST never shifts the day). */
export function isoMinus(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
