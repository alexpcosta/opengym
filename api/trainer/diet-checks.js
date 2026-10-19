/* The trainer's daily diet checks, registered with trainer/daily.js.
 *
 *   per student, at `dietAt` on the student's clock: nothing logged today → "diet-missing";
 *     calories more than 15 % off the target, or protein under 90 % of it → "diet-off".
 *   per admin, at `summaryAt` on the admin's clock: one push with how every student's day went.
 *
 * Only students who have targets are checked — their trainer's diet, or targets they set
 * themselves. Someone who never set the diary up is not "missing" anything.
 */
import * as store from './store.js';
import { readDay } from '../diet/store.js';
import { totals } from '../diet/entries.js';
import { msg, fmtNum } from './messages.js';
import { userNow, zoneOf } from '../lib/schedule.js';

export const OFF_RANGE = 0.15;
export const PROTEIN_MIN = 0.9;

/** The targets a student's day is measured against: the trainer's diet, else their own. */
export function targetsFor(uid, S) {
  const d = store.readDiet(uid);
  if (d && !d.removed && d.targets?.kcal) return d.targets;
  if (S?.dietTargets?.kcal) return S.dietTargets;
  return null;
}

/** How one day went against the targets: { status: 'none'|'off'|'ok', tot }. */
export function dayStatus(day, targets) {
  const entries = day?.entries || [];
  const tot = totals(entries);
  if (!entries.length) return { status: 'none', tot };
  const kcalOff = Math.abs(tot.kcal - targets.kcal) > targets.kcal * OFF_RANGE;
  const lowProtein = targets.p > 0 && tot.p < targets.p * PROTEIN_MIN;
  return { status: kcalOff || lowProtein ? 'off' : 'ok', tot };
}

export const dietCheck = {
  student(ctx, u, S, now, times) {
    const key = 'diet:' + u.id;
    if (store.marked(key, now.date) || now.hhmm < times.dietAt) return;
    store.mark(key, now.date);
    const targets = targetsFor(u.id, S);
    if (!targets) return;
    const { status, tot } = dayStatus(readDay(u.id, now.date), targets);
    const url = '#/trainer/s/' + u.id;
    if (status === 'none') {
      store.addEvent({ kind: 'diet-missing', sid: u.id, date: now.date, data: {} });
      ctx.notifyAdmins('dietMissing', lang => ({
        title: msg(lang, 'dietMissingT', { name: u.name }), body: msg(lang, 'dietMissingB'),
        tag: 'trainer-diet-' + u.id, url
      }));
    } else if (status === 'off') {
      const data = { kcal: Math.round(tot.kcal), target: Math.round(targets.kcal), p: Math.round(tot.p), pt: Math.round(targets.p || 0) };
      store.addEvent({ kind: 'diet-off', sid: u.id, date: now.date, data });
      ctx.notifyAdmins('dietOff', lang => ({
        title: msg(lang, 'dietOffT', { name: u.name }),
        body: msg(lang, 'dietOffB', { kcal: fmtNum(lang, data.kcal), target: fmtNum(lang, data.target), p: data.p, pt: data.pt }),
        tag: 'trainer-diet-' + u.id, url
      }));
    }
  },

  global(ctx, times, at) {
    if (!ctx.admins) return;
    for (const a of ctx.admins()) {
      if (!ctx.prefsOf(a).dietSummary) continue;
      const now = userNow(zoneOf(ctx.readState(a.id)), at);
      if (!now) continue;
      const key = 'summary:' + a.id;
      if (store.marked(key, now.date) || now.hhmm < times.summaryAt) continue;
      store.mark(key, now.date);
      const counts = { ok: 0, off: 0, none: 0 };
      for (const u of ctx.students()) {
        const S = ctx.readState(u.id);
        const targets = targetsFor(u.id, S);
        if (!targets) continue;
        // Each student's own "today" — a summary at 22:30 here is about the day they are having.
        const theirs = userNow(zoneOf(S), at);
        if (!theirs) continue;
        counts[dayStatus(readDay(u.id, theirs.date), targets).status]++;
      }
      const n = counts.ok + counts.off + counts.none;
      if (!n) continue;
      if (!store.hasEvent('summary', null, now.date)) store.addEvent({ kind: 'summary', sid: null, date: now.date, data: { ...counts, n } });
      const lang = ctx.langOf(a.id);
      ctx.sendPush(a.id, {
        title: msg(lang, 'summaryT'), body: msg(lang, 'summaryB', { n, ...counts }),
        tag: 'trainer-summary', url: '#/trainer'
      }).catch(() => {});
    }
  }
};
