/* Trainer mode: admins plan for students and hear about what they do.
 *
 * Every user who is not an admin is a student of every admin — there is no linking table on
 * purpose (one trainer, or a few, running one instance). Written as a factory over
 * server.js's own helpers, like coach/routes.js, so this module never imports the server and
 * the server never has a cycle.
 *
 * Returns { routes, onStateSaved, notifyAdmins, students, admins } — the routes are spread
 * into server.js's table, onStateSaved is called by PUT /api/data after a write, and the
 * rest is handed to the daily loop.
 */
import * as store from './store.js';
import { validateTrainerPlan, validateTrainerDiet, validateTrainerFood, validateTrainerSupps } from './validate.js';
import { targetsFor, dayStatus } from './diet-checks.js';
import { readDays } from '../diet/store.js';
import { totals } from '../diet/entries.js';
import { readDays as readSuppDays } from '../supp/store.js';
import { dayStatus as suppDayStatus } from '../supp/log.js';
import { suppsFor } from './supp-checks.js';
import crypto from 'node:crypto';
import { newWorkouts, workoutSummary, adherence } from './notify.js';
import { msg, fmtNum, fmtDur } from './messages.js';
import { effectiveRoutineId, userNow, zoneOf, isoMinus } from '../lib/schedule.js';

export const DEFAULT_PREFS = {
  done: true, pr: true, missed: true, dietMissing: true, dietOff: true, dietSummary: true,
  suppMissing: true, suppPartial: true
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function createTrainer({ json, readBody, readSession, requireAdmin, readState, sendPush, isAdmin, getDb, saveDb }) {
  const students = () => getDb().users.filter(u => !isAdmin(u) && !u.disabled);
  const admins = () => getDb().users.filter(u => isAdmin(u) && !u.disabled);
  // A trainer can also write a plan and a diet for themselves: their own id resolves too.
  const findStudent = (id, admin) => students().find(u => u.id === id) || (admin && id === admin.id ? admin : null);
  const langOf = uid => readState(uid)?.lang || 'en';
  const prefsOf = admin => ({ ...DEFAULT_PREFS, ...(admin.trainerPrefs || {}) });
  const todayOf = S => userNow(zoneOf(S))?.date || new Date().toISOString().slice(0, 10);

  /** Push to every admin who wants this kind of event, each in their own language. */
  function notifyAdmins(prefKey, build) {
    for (const a of admins()) {
      if (!prefsOf(a)[prefKey]) continue;
      const payload = build(langOf(a.id));
      if (payload) sendPush(a.id, payload).catch(() => {});
    }
  }

  /** Called after a student's state lands on disk: new workouts become events and pushes. */
  function onStateSaved(user, prev, next) {
    if (!user || isAdmin(user)) return;
    for (const w of newWorkouts(prev, next)) {
      const sum = workoutSummary(w, next);
      store.addEvent({ kind: 'done', sid: user.id, date: sum.date, data: sum });
      const url = '#/trainer/s/' + user.id;
      notifyAdmins('done', lang => ({
        title: msg(lang, 'doneT', { name: user.name, routine: sum.routine || msg(lang, 'freestyle') }),
        body: msg(lang, 'doneB', { dur: fmtDur(sum.dur), sets: sum.sets, vol: fmtNum(lang, sum.vol) + ' ' + sum.unit }),
        tag: 'trainer-done-' + sum.wid, url
      }));
      if (sum.prs.length) {
        store.addEvent({ kind: 'pr', sid: user.id, date: sum.date, data: { wid: sum.wid, routine: sum.routine, prs: sum.prs } });
        notifyAdmins('pr', lang => ({
          title: msg(lang, 'prT', { name: user.name }),
          body: sum.prs.join(', '),
          tag: 'trainer-pr-' + sum.wid, url
        }));
      }
    }
  }

  /** The plan as a student's device receives it — no authoring metadata beyond who and when. */
  const planForStudent = rec => rec && {
    version: rec.version, removed: !!rec.removed, routines: rec.routines || [], week: rec.week || {},
    customEx: rec.customEx || [], note: rec.note || '', updatedAt: rec.updatedAt, by: rec.updatedByName || '',
    acked: (rec.ackedVersion || 0) >= rec.version
  };
  const planStatus = rec => rec && !rec.removed
    ? { version: rec.version, updatedAt: rec.updatedAt, acked: (rec.ackedVersion || 0) >= rec.version, ackedAt: rec.ackedAt || null, routines: (rec.routines || []).length }
    : null;

  const dietForStudent = rec => rec && {
    version: rec.version, removed: !!rec.removed, targets: rec.targets || null, meals: rec.meals || [],
    note: rec.note || '', updatedAt: rec.updatedAt, by: rec.updatedByName || '',
    acked: (rec.ackedVersion || 0) >= rec.version
  };

  const suppsForStudent = rec => rec && {
    version: rec.version, removed: !!rec.removed, items: rec.items || [],
    note: rec.note || '', updatedAt: rec.updatedAt, by: rec.updatedByName || '',
    acked: (rec.ackedVersion || 0) >= rec.version
  };
  const suppStatus = rec => rec && !rec.removed
    ? { version: rec.version, updatedAt: rec.updatedAt, acked: (rec.ackedVersion || 0) >= rec.version, ackedAt: rec.ackedAt || null, items: (rec.items || []).length }
    : null;

  /** The weekday an ISO date falls on, counted the same way the daily check counts it. */
  const weekdayOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay();

  /** The last `n` days of a student's supplement log, each with how many doses were ticked. */
  function suppDays(uid, items, today, n) {
    const days = readSuppDays(uid, isoMinus(today, n - 1), today);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = isoMinus(today, i);
      const day = days[d] || null;
      // `ticks` is the raw per-item map (the trainer taps a day to see which dose was
      // missed); `taken` from suppDayStatus is the count. Different keys, or one shadows the other.
      out.push({ d, ticks: day?.taken || {}, ...suppDayStatus(items, day, weekdayOf(d)) });
    }
    return out;
  }
  // Last 7 days, without today (still being taken): of the days that had doses due, how many
  // were fully ticked.
  function suppWeek(uid, items, today) {
    if (!items?.length) return null;
    const days = readSuppDays(uid, isoMinus(today, 7), isoMinus(today, 1));
    let due = 0, ok = 0;
    for (let i = 1; i <= 7; i++) {
      const d = isoMinus(today, i);
      const st = suppDayStatus(items, days[d], weekdayOf(d));
      if (st.status === 'rest') continue;
      due++;
      if (st.status === 'ok') ok++;
    }
    return { days: due, ok };
  }

  /** The last `n` days of a student's food diary, each with totals and how it went. */
  function diaryDays(uid, S, today, n) {
    const from = isoMinus(today, n - 1);
    const days = readDays(uid, from, today);
    const targets = targetsFor(uid, S);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = isoMinus(today, i);
      const day = days[d] || null;
      const entries = day?.entries || [];
      const status = targets ? dayStatus(day, targets).status : entries.length ? 'logged' : 'none';
      out.push({ d, entries, tot: totals(entries), status });
    }
    return out;
  }
  // Last 7 days, without today (still being eaten): how many were logged and on target.
  function dietWeek(uid, S, today) {
    const targets = targetsFor(uid, S);
    if (!targets) return null;
    const days = readDays(uid, isoMinus(today, 7), isoMinus(today, 1));
    let logged = 0, ok = 0;
    for (let i = 1; i <= 7; i++) {
      const st = dayStatus(days[isoMinus(today, i)], targets).status;
      if (st !== 'none') logged++;
      if (st === 'ok') ok++;
    }
    return { logged, ok };
  }

  /** Shared by plans and diets: version check, write, tell the student. */
  const FILES = {
    plan: [store.readPlan, store.writePlan],
    diet: [store.readDiet, store.writeDiet],
    supps: [store.readSupps, store.writeSupps]
  };
  // What the student is told when a kind of plan lands, and where the notification opens.
  const NOTIFY = {
    plan: ['planT', 'planB', '#/plan'],
    diet: ['dietT', 'dietB', '#/diet'],
    supps: ['suppT', 'suppB', '#/supps']
  };
  function sendVersioned(res, admin, u, kind, clean, baseVersion) {
    const [read, write] = FILES[kind];
    const existing = read(u.id);
    // Two admins editing the same student, or a stale tab: refuse rather than overwrite.
    if ((existing?.version || 0) !== (+baseVersion || 0)) {
      return json(res, 409, { error: 'this changed since you opened it — reload and try again', version: existing?.version || 0 });
    }
    const rec = {
      ...clean,
      version: (existing?.version || 0) + 1,
      updatedAt: Date.now(), updatedBy: admin.id, updatedByName: admin.name,
      ackedVersion: existing?.ackedVersion || 0, ackedAt: existing?.ackedAt || null
    };
    write(u.id, rec);
    const lang = langOf(u.id);
    const [titleKey, bodyKey, url] = NOTIFY[kind];
    // Writing your own plan is not news to you.
    if (u.id !== admin.id) sendPush(u.id, { title: msg(lang, titleKey), body: msg(lang, bodyKey), tag: 'trainer-' + kind, url }).catch(() => {});
    json(res, 200, { version: rec.version, [kind]: (kind === 'supps' ? suppStatus : planStatus)(rec) });
  }
  function removeVersioned(res, admin, u, kind, empty) {
    const [read, write] = FILES[kind];
    const existing = read(u.id);
    if (!existing || existing.removed) return json(res, 200, { version: existing?.version || 0 });
    // A tombstone, not a delete: the student's device has to see a newer version to know it
    // should take the trainer's routines (or diet) away and unlock.
    const rec = {
      ...empty, version: existing.version + 1, removed: true, note: '',
      updatedAt: Date.now(), updatedBy: admin.id, updatedByName: admin.name,
      ackedVersion: existing.ackedVersion || 0, ackedAt: existing.ackedAt || null
    };
    write(u.id, rec);
    json(res, 200, { version: rec.version });
  }
  function ackVersioned(user, kind, version) {
    const [read, write] = FILES[kind];
    const rec = read(user.id);
    const v = Math.round(+version || 0);
    if (rec && v > (rec.ackedVersion || 0) && v <= rec.version) {
      rec.ackedVersion = v; rec.ackedAt = Date.now();
      write(user.id, rec);
    }
  }

  const unreadFor = (admin, sid) => {
    const seen = admin.trainerSeenAt || 0;
    return store.listEvents().filter(e => e.at > seen && (!sid || e.sid === sid)).length;
  };

  const routes = {
    /* ------------------------------ admin ------------------------------ */
    'GET /api/trainer/students': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      // The trainer first, as "you": the same page writes their own plan and diet.
      const list = [admin, ...students()].map(u => {
        const S = readState(u.id) || {};
        const today = todayOf(S);
        const w = S.workouts || [];
        const a7 = adherence(S, today, 7, effectiveRoutineId, isoMinus);
        const a28 = adherence(S, today, 28, effectiveRoutineId, isoMinus);
        return {
          id: u.id, name: u.name, created: u.created || null, self: u.id === admin.id,
          workouts: w.length, lastWorkout: w.length ? w[w.length - 1].d : null,
          lastSync: S._ts || null,
          hasPush: getDb().subs.some(s => s.userId === u.id),
          plan: planStatus(store.readPlan(u.id)),
          diet: planStatus(store.readDiet(u.id)),
          diet7: dietWeek(u.id, S, today),
          supps: suppStatus(store.readSupps(u.id)),
          supp7: suppWeek(u.id, suppsFor(u.id), today),
          adherence7: { planned: a7.planned, done: a7.done },
          adherence28: { planned: a28.planned, done: a28.done },
          unread: unreadFor(admin, u.id)
        };
      });
      json(res, 200, { students: list, unread: unreadFor(admin), now: Date.now() });
    },

    'GET /api/trainer/student': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const id = new URL(req.url, 'http://x').searchParams.get('id');
      const u = findStudent(id, admin);
      if (!u) return json(res, 404, { error: 'no such student' });
      const S = readState(u.id) || {};
      const plan = store.readPlan(u.id);
      const diet = store.readDiet(u.id);
      const supps = store.readSupps(u.id);
      const trainerIds = new Set((plan && !plan.removed ? plan.routines : []).map(r => r.id));
      const today = todayOf(S);
      json(res, 200, {
        user: { id: u.id, name: u.name, created: u.created || null },
        unit: S.unit || 'kg', lang: S.lang || 'en', tz: zoneOf(S), today,
        lastSync: S._ts || null,
        body: S.body || 'male', targetW: S.targetW ?? null,
        profile: S.profile || null, dietTargets: S.dietTargets || null,
        bodyweight: S.bodyweight || [],
        // Their own routines, read-only for the trainer: what they were doing before (or
        // besides) the trainer's plan. The trainer's own routines come from `plan`.
        ownRoutines: (S.routines || []).filter(r => !trainerIds.has(r.id)),
        customEx: S.customEx || [],
        workouts: (S.workouts || []).slice().reverse(),
        plan: plan && !plan.removed ? { ...planForStudent(plan), ackedVersion: plan.ackedVersion || 0, ackedAt: plan.ackedAt || null } : null,
        planVersion: plan?.version || 0,
        diet: diet && !diet.removed ? { ...dietForStudent(diet), calc: diet.calc || null, ackedVersion: diet.ackedVersion || 0, ackedAt: diet.ackedAt || null } : null,
        dietVersion: diet?.version || 0,
        supps: supps && !supps.removed ? { ...suppsForStudent(supps), ackedVersion: supps.ackedVersion || 0, ackedAt: supps.ackedAt || null } : null,
        suppVersion: supps?.version || 0,
        suppLog: suppDays(u.id, suppsFor(u.id) || [], today, 14),
        targets: targetsFor(u.id, S),
        diary: diaryDays(u.id, S, today, 14),
        adherence: adherence(S, today, 28, effectiveRoutineId, isoMinus).days
      });
    },

    'PUT /api/trainer/plan': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const u = findStudent(body.id, admin);
      if (!u) return json(res, 404, { error: 'no such student' });
      const v = validateTrainerPlan(body.plan);
      if (!v.ok) return json(res, 400, { error: v.errors.join('; '), errors: v.errors });
      sendVersioned(res, admin, u, 'plan', v.plan, body.baseVersion);
    },

    'POST /api/trainer/plan/remove': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const u = findStudent(body.id, admin);
      if (!u) return json(res, 404, { error: 'no such student' });
      removeVersioned(res, admin, u, 'plan', { routines: [], week: {}, customEx: [] });
    },

    'PUT /api/trainer/diet': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const u = findStudent(body.id, admin);
      if (!u) return json(res, 404, { error: 'no such student' });
      const v = validateTrainerDiet(body.diet);
      if (!v.ok) return json(res, 400, { error: v.errors.join('; '), errors: v.errors });
      sendVersioned(res, admin, u, 'diet', v.diet, body.baseVersion);
    },

    'POST /api/trainer/diet/remove': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const u = findStudent(body.id, admin);
      if (!u) return json(res, 404, { error: 'no such student' });
      removeVersioned(res, admin, u, 'diet', { targets: null, meals: [], calc: null });
    },

    // Another student's diet as a starting point ("copy diet from…").
    'GET /api/trainer/diet': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const u = findStudent(new URL(req.url, 'http://x').searchParams.get('id'), admin);
      if (!u) return json(res, 404, { error: 'no such student' });
      const rec = store.readDiet(u.id);
      json(res, 200, { diet: rec && !rec.removed ? { targets: rec.targets, meals: rec.meals || [], calc: rec.calc || null, note: rec.note || '' } : null });
    },

    /* Supplements: what to take, on which days, how much and how many times a day. The
     * student ticks each dose off and the daily check (trainer/supp-checks.js) tells the
     * trainer about a day that went unticked. */
    'PUT /api/trainer/supps': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const u = findStudent(body.id, admin);
      if (!u) return json(res, 404, { error: 'no such student' });
      const v = validateTrainerSupps(body.supps);
      if (!v.ok) return json(res, 400, { error: v.errors.join('; '), errors: v.errors });
      sendVersioned(res, admin, u, 'supps', v.supps, body.baseVersion);
    },

    'POST /api/trainer/supps/remove': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const u = findStudent(body.id, admin);
      if (!u) return json(res, 404, { error: 'no such student' });
      removeVersioned(res, admin, u, 'supps', { items: [] });
    },

    // Another student's list as a starting point ("copy supplements from…").
    'GET /api/trainer/supps': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const u = findStudent(new URL(req.url, 'http://x').searchParams.get('id'), admin);
      if (!u) return json(res, 404, { error: 'no such student' });
      const rec = store.readSupps(u.id);
      json(res, 200, { supps: rec && !rec.removed ? { items: rec.items || [], note: rec.note || '' } : null });
    },

    /* Foods the trainer offers every student, e.g. "Chipa (casera)" with its numbers. */
    'GET /api/trainer/foods': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      json(res, 200, { foods: store.readFoods() });
    },

    'POST /api/trainer/foods': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const food = validateTrainerFood(body.food || {});
      if (!food) return json(res, 400, { error: 'a food needs a name and its calories per 100 g' });
      const list = store.readFoods();
      if (!food.id) food.id = 'tf' + crypto.randomBytes(6).toString('base64url');
      const i = list.findIndex(f => f.id === food.id);
      if (i >= 0) list[i] = food; else { if (list.length >= 500) return json(res, 400, { error: 'at most 500 trainer foods' }); list.push(food); }
      store.writeFoods(list);
      json(res, 200, { food, foods: list });
    },

    'POST /api/trainer/foods/delete': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const list = store.readFoods().filter(f => f.id !== body.id);
      store.writeFoods(list);
      json(res, 200, { foods: list });
    },

    'GET /api/trainer/unread': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      json(res, 200, { unread: unreadFor(admin), students: students().length });
    },

    'GET /api/trainer/events': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const q = new URL(req.url, 'http://x').searchParams;
      const sid = q.get('sid');
      const limit = Math.max(1, Math.min(300, +q.get('limit') || 100));
      const names = new Map(getDb().users.map(u => [u.id, u.name]));
      const events = store.listEvents()
        .filter(e => !sid || e.sid === sid)
        .slice(-limit).reverse()
        .map(e => ({ ...e, sname: e.sid ? names.get(e.sid) || null : null }));
      json(res, 200, { events, seenAt: admin.trainerSeenAt || 0 });
    },

    'POST /api/trainer/events/read': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      admin.trainerSeenAt = Date.now();
      saveDb();
      json(res, 200, { seenAt: admin.trainerSeenAt });
    },

    'GET /api/trainer/prefs': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      json(res, 200, { prefs: prefsOf(admin), times: store.readTimes() });
    },

    'PUT /api/trainer/prefs': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const prefs = {};
      for (const k of Object.keys(DEFAULT_PREFS)) prefs[k] = body.prefs?.[k] === undefined ? prefsOf(admin)[k] : !!body.prefs[k];
      admin.trainerPrefs = prefs;
      saveDb();
      if (body.times) {
        const cur = store.readTimes();
        const times = {};
        for (const k of Object.keys(store.DEFAULT_TIMES)) times[k] = HHMM.test(body.times[k] || '') ? body.times[k] : cur[k];
        store.writeTimes(times);
      }
      json(res, 200, { prefs, times: store.readTimes() });
    },

    /* ------------------------------ student ------------------------------ */
    'GET /api/trainer/my-plan': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      json(res, 200, { plan: planForStudent(store.readPlan(user.id)) });
    },

    'POST /api/trainer/my-plan/ack': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      ackVersioned(user, 'plan', body.version);
      json(res, 200, { ok: true });
    },

    'GET /api/trainer/my-diet': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      json(res, 200, { diet: dietForStudent(store.readDiet(user.id)) });
    },

    'POST /api/trainer/my-diet/ack': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      ackVersioned(user, 'diet', body.version);
      json(res, 200, { ok: true });
    },

    'GET /api/trainer/my-supps': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      json(res, 200, { supps: suppsForStudent(store.readSupps(user.id)) });
    },

    'POST /api/trainer/my-supps/ack': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      ackVersioned(user, 'supps', body.version);
      json(res, 200, { ok: true });
    }
  };

  return { routes, onStateSaved, notifyAdmins, students, admins, prefsOf, langOf };
}
