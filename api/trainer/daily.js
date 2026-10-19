/* The once-a-day checks: a planned workout that did not happen, and (with the diet module)
 * a food diary that is empty or off target, plus the trainer's daily summary.
 *
 * One 60-second loop for all of them. Each check runs on the student's own clock (`S.tz`,
 * stamped by their app on every launch), once its check time has passed, and leaves a mark
 * for the day so it never fires twice — the mark is set whether or not it found anything,
 * so logging a workout at 23:00 does not produce a late "skipped" a minute later.
 */
import * as store from './store.js';
import { missedToday } from './notify.js';
import { msg } from './messages.js';
import { effectiveRoutineId, userNow, zoneOf } from '../lib/schedule.js';

/** Extra checks registered by other modules (the diet module adds its own). */
const extra = [];
export const addDailyCheck = fn => { extra.push(fn); };

export function runDaily(ctx, at = new Date()) {
  const { students, readState, notifyAdmins } = ctx;
  const times = store.readTimes();
  for (const u of students()) {
    const S = readState(u.id);
    if (!S) continue;
    const now = userNow(zoneOf(S), at);
    if (!now) continue;

    const key = 'missed:' + u.id;
    if (!store.marked(key, now.date) && now.hhmm >= times.missedAt) {
      store.mark(key, now.date);
      const r = missedToday(S, now, times.missedAt, effectiveRoutineId);
      if (r) {
        store.addEvent({ kind: 'missed', sid: u.id, date: now.date, data: { routine: r.name, routineId: r.id } });
        notifyAdmins('missed', lang => ({
          title: msg(lang, 'missedT', { name: u.name, routine: r.name || msg(lang, 'freestyle') }),
          body: msg(lang, 'missedB'),
          tag: 'trainer-missed-' + u.id, url: '#/trainer/s/' + u.id
        }));
      }
    }
    for (const fn of extra) {
      try { fn.student?.(ctx, u, S, now, times); } catch (e) { console.error('trainer daily check', e); }
    }
  }
  for (const fn of extra) {
    try { fn.global?.(ctx, times, at); } catch (e) { console.error('trainer daily check', e); }
  }
}

export function startDaily(ctx) {
  const tick = () => { try { runDaily(ctx); } catch (e) { console.error('trainer daily', e); } };
  setTimeout(tick, 15000).unref();
  setInterval(tick, 60000).unref();
}
