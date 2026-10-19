/* The trainer's daily supplement check, registered with trainer/daily.js.
 *
 *   per student, at `suppAt` on the student's clock: a day that had doses due and none ticked
 *     → "supp-missing"; some ticked and some not → "supp-partial".
 *
 * Only students who have a supplement list are checked, and only on days the list actually
 * falls on — a list that is Monday-to-Friday is not "missed" on a Sunday. Like the diet check,
 * the day is marked whether or not anything was found, so ticking a dose at 23:00 does not
 * produce a late complaint a minute later.
 */
import * as store from './store.js';
import { readDay } from '../supp/store.js';
import { dayStatus, pending } from '../supp/log.js';
import { msg } from './messages.js';

/** The supplement list in force for a student, or null. */
export function suppsFor(uid) {
  const rec = store.readSupps(uid);
  return rec && !rec.removed && (rec.items || []).length ? rec.items : null;
}

export const suppCheck = {
  student(ctx, u, S, now, times) {
    const key = 'supp:' + u.id;
    if (store.marked(key, now.date) || now.hhmm < times.suppAt) return;
    store.mark(key, now.date);
    const items = suppsFor(u.id);
    if (!items) return;
    const day = readDay(u.id, now.date);
    const { due, taken, status } = dayStatus(items, day, now.weekday);
    if (status === 'rest' || status === 'ok') return;
    const names = pending(items, day, now.weekday).map(it => it.name).slice(0, 4).join(', ');
    const url = '#/trainer/s/' + u.id;
    const data = { due, taken, names };
    if (status === 'none') {
      store.addEvent({ kind: 'supp-missing', sid: u.id, date: now.date, data });
      ctx.notifyAdmins('suppMissing', lang => ({
        title: msg(lang, 'suppNoneT', { name: u.name }), body: msg(lang, 'suppNoneB', { due }),
        tag: 'trainer-supp-' + u.id, url
      }));
    } else {
      store.addEvent({ kind: 'supp-partial', sid: u.id, date: now.date, data });
      ctx.notifyAdmins('suppPartial', lang => ({
        title: msg(lang, 'suppPartT', { name: u.name }), body: msg(lang, 'suppPartB', { taken, due, names }),
        tag: 'trainer-supp-' + u.id, url
      }));
    }
  }
};
