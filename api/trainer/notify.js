/* Pure functions that decide what a trainer hears about. No I/O: the routes and the daily
 * loop feed them state and act on the answer, which is what makes them testable without a
 * server, a clock or a push service.
 */
import { libraryName } from '../coach/payload.js';

// A workout counts as "just finished" only if it ended in the last few hours. Without this, a
// FitNotes import, a restored backup or a phone syncing for the first time would push every
// workout in the history at once.
export const RECENT_MS = 6 * 3600000;
export const MAX_PER_SYNC = 3;

/** Workouts in `next` that were not in `prev` and finished recently — the ones worth a push. */
export function newWorkouts(prev, next, now = Date.now()) {
  const old = new Set((prev?.workouts || []).map(w => w && w.id));
  return (next?.workouts || [])
    .filter(w => w && w.id && !old.has(w.id))
    .filter(w => {
      const end = w.end || w.start || 0;
      return end >= now - RECENT_MS && end <= now + 10 * 60000;
    })
    .slice(-MAX_PER_SYNC);
}

export const setsDone = w => (w.entries || []).reduce((n, e) => n + (e.sets || []).filter(s => s && s.done).length, 0);

/** Display name for an exercise id: the built-in library first, then the student's own. */
export function exerciseName(S, id) {
  return libraryName(id) || (S?.customEx || []).find(c => c.id === id)?.n || id;
}

export function workoutSummary(w, S) {
  return {
    wid: w.id,
    date: w.d,
    routine: w.name || '',
    routineId: w.routineId || null,
    dur: Math.max(0, (w.end || 0) - (w.start || 0)),
    sets: setsDone(w),
    vol: Math.round(w.vol || 0),
    unit: S?.unit || 'kg',
    prs: (w.prs || []).map(id => exerciseName(S, id))
  };
}

/**
 * The routine a student skipped today, or null. Only asked once the check time has passed
 * where the student is; "skipped" means today has a planned routine and no logged workout.
 */
export function missedToday(S, now, at, effectiveRoutineId) {
  if (!S || !now || now.hhmm < at) return null;
  if ((S.workouts || []).some(w => w.d === now.date)) return null;
  const rid = effectiveRoutineId(S, now.date);
  if (!rid) return null;
  const r = (S.routines || []).find(x => x.id === rid);
  return { id: rid, name: r?.name || '' };
}

/**
 * Planned vs done over the `days` days ending `today` (inclusive). A day counts as done when
 * any workout was logged on it — a rescheduled or freestyle session still means they trained.
 */
export function adherence(S, today, days, effectiveRoutineId, isoMinus) {
  const doneDays = new Set((S?.workouts || []).map(w => w.d));
  let planned = 0, done = 0;
  const list = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = isoMinus(today, i);
    const rid = S ? effectiveRoutineId(S, d) : null;
    const did = doneDays.has(d);
    if (rid) { planned++; if (did) done++; }
    list.push({ d, planned: rid, done: did });
  }
  return { planned, done, workouts: list.filter(x => x.done).length, days: list };
}
