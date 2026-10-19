import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from './helpers.mjs';

tempData();
const { validateTrainerSupps } = await import('../trainer/validate.js');
const { dayStatus, pending, cleanDay, dueOn, slotsOf } = await import('../supp/log.js');
const { createTrainer } = await import('../trainer/routes.js');
const { runDaily, addDailyCheck } = await import('../trainer/daily.js');
const { suppCheck, suppsFor } = await import('../trainer/supp-checks.js');
const store = await import('../trainer/store.js');
const log = await import('../supp/store.js');
const { suppRoutes } = await import('../supp/routes.js');

addDailyCheck(suppCheck);

const SUPPS = {
  items: [
    { id: 'sCre', name: 'Creatina', dose: '5 g', days: [1, 2, 3, 4, 5], perDay: 1, note: 'com água' },
    { id: 'sWhey', name: 'Whey', dose: '30 g', days: [], times: ['08:00', '20:00'] }
  ],
  note: 'Depois do treino'
};

/* ---------------- validation ---------------- */

test('a well-formed supplement list passes, times fix the doses per day', () => {
  const r = validateTrainerSupps(SUPPS);
  assert.equal(r.ok, true, r.errors?.join('; '));
  assert.deepEqual(r.supps.items[0].days, [1, 2, 3, 4, 5]);
  assert.equal(r.supps.items[0].perDay, 1);
  assert.equal(r.supps.items[0].note, 'com água');
  // Two times given, so the day has two doses whatever perDay said.
  assert.equal(r.supps.items[1].perDay, 2);
  assert.deepEqual(r.supps.items[1].times, ['08:00', '20:00']);
  assert.equal(r.supps.note, 'Depois do treino');
});

test('ids must be stable supplement ids, unique, and a name is required', () => {
  assert.equal(validateTrainerSupps({ items: [{ ...SUPPS.items[0], id: 'x1' }] }).ok, false);
  assert.equal(validateTrainerSupps({ items: [SUPPS.items[0], { ...SUPPS.items[1], id: 'sCre' }] }).ok, false);
  assert.equal(validateTrainerSupps({ items: [{ id: 'sA', name: '  ' }] }).ok, false);
  assert.equal(validateTrainerSupps({ items: [] }).ok, false);
});

test('days are normalised: all seven and nonsense both mean every day', () => {
  const all = validateTrainerSupps({ items: [{ id: 'sA', name: 'A', days: [0, 1, 2, 3, 4, 5, 6] }] });
  assert.deepEqual(all.supps.items[0].days, []);
  const junk = validateTrainerSupps({ items: [{ id: 'sA', name: 'A', days: [3, 3, 9, -1, 'x', 1] }] });
  assert.deepEqual(junk.supps.items[0].days, [1, 3]);
  const capped = validateTrainerSupps({ items: [{ id: 'sA', name: 'A', perDay: 99 }] });
  assert.equal(capped.supps.items[0].perDay, 1);
  // Times are positional labels for the doses, so they are never sorted or de-duplicated —
  // the slot index is what a tick is stored under. An entry that is not a clock time is ''.
  const bogusTimes = validateTrainerSupps({ items: [{ id: 'sA', name: 'A', times: ['25:00', '07:30', '07:30'] }] });
  assert.deepEqual(bogusTimes.supps.items[0].times, ['', '07:30']);
  assert.equal(bogusTimes.supps.items[0].perDay, 2);
  // Evening first stays evening first: sorting would relabel a dose already ticked as slot 0.
  const kept = validateTrainerSupps({ items: [{ id: 'sA', name: 'A', times: ['20:00', '08:00'] }] });
  assert.deepEqual(kept.supps.items[0].times, ['20:00', '08:00']);
  // `perDay` wins over how many times were filled in, and the labels are padded to match.
  const padded = validateTrainerSupps({ items: [{ id: 'sA', name: 'A', perDay: 3, times: ['', '09:00'] }] });
  assert.deepEqual(padded.supps.items[0], { id: 'sA', name: 'A', dose: '', days: [], perDay: 3, times: ['', '09:00', ''] });
  // No usable label at all: no `times` key, so the app numbers the doses instead.
  assert.equal('times' in validateTrainerSupps({ items: [{ id: 'sA', name: 'A', perDay: 2, times: ['', ''] }] }).supps.items[0], false);
});

/* ---------------- the day's arithmetic ---------------- */

const ITEMS = validateTrainerSupps(SUPPS).supps.items;

test('a day is rest, not marked, partial or complete', () => {
  // Monday: creatine once plus whey twice = three doses.
  assert.deepEqual(dayStatus(ITEMS, null, 1), { due: 3, taken: 0, status: 'none' });
  assert.deepEqual(dayStatus(ITEMS, { taken: { sCre: [0] } }, 1), { due: 3, taken: 1, status: 'partial' });
  assert.deepEqual(dayStatus(ITEMS, { taken: { sCre: [0], sWhey: [0, 1] } }, 1), { due: 3, taken: 3, status: 'ok' });
  // Sunday: creatine is weekdays only, so only the two whey doses are due.
  assert.equal(dayStatus(ITEMS, { taken: { sWhey: [0, 1] } }, 0).status, 'ok');
  assert.equal(dayStatus([ITEMS[0]], null, 0).status, 'rest');
  // A tick for a dose that no longer exists counts for nothing and against nothing.
  assert.deepEqual(dayStatus([ITEMS[0]], { taken: { sCre: [0, 4], sGone: [0] } }, 1), { due: 1, taken: 1, status: 'ok' });
  assert.equal(dueOn(ITEMS[1], 0), true);
  assert.equal(slotsOf(ITEMS[1]), 2);
});

test('pending names the supplements that still have a dose to tick', () => {
  assert.deepEqual(pending(ITEMS, { taken: { sCre: [0] } }, 1).map(i => i.name), ['Whey']);
  assert.deepEqual(pending(ITEMS, { taken: { sCre: [0], sWhey: [0] } }, 1).map(i => i.name), ['Whey']);
  assert.deepEqual(pending(ITEMS, { taken: { sCre: [0], sWhey: [0, 1] } }, 1), []);
});

test('a stored day keeps sorted, de-duplicated, in-range slots only', () => {
  const d = cleanDay({ taken: { sA: [2, 0, 0, 9, -1, 1.5], sB: [], sC: 'nope' }, _ts: 7 });
  assert.deepEqual(d, { taken: { sA: [0, 2] }, _ts: 7 });
  assert.ok(cleanDay({}).ok !== false && typeof cleanDay({})._ts === 'number');
});

/* ---------------- storage ---------------- */

test('a day round-trips by month, and the newer copy wins', () => {
  assert.equal(log.writeDay('stu', '2026-10-19', cleanDay({ taken: { sCre: [0] }, _ts: 10 })).ok, true);
  assert.deepEqual(log.readDay('stu', '2026-10-19').taken, { sCre: [0] });
  // An older copy from a second device is refused and the stored one handed back.
  const stale = log.writeDay('stu', '2026-10-19', cleanDay({ taken: {}, _ts: 5 }));
  assert.equal(stale.ok, false);
  assert.deepEqual(stale.day.taken, { sCre: [0] });
  // Unticking everything removes the day rather than storing an empty one.
  assert.equal(log.writeDay('stu', '2026-10-19', cleanDay({ taken: {}, _ts: 20 })).ok, true);
  assert.equal(log.readDay('stu', '2026-10-19'), null);
  assert.deepEqual(Object.keys(log.readDays('stu', '2026-10-01', '2026-10-31')), []);
});

/* ---------------- routes against fakes ---------------- */

const STUDENT = { routines: [{ id: 'tA', name: 'Upper' }], week: {}, dayPlan: {}, workouts: [] };

function harness() {
  const db = {
    users: [{ id: 'adm', name: 'Coach', admin: true }, { id: 'stu', name: 'Ana' }],
    subs: []
  };
  const states = { adm: { lang: 'pt', tz: 'America/Asuncion' }, stu: { lang: 'es', unit: 'kg', tz: 'America/Asuncion', ...STUDENT } };
  const pushes = [];
  const json = (res, code, body) => { res.code = code; res.body = body; };
  const readBody = req => Promise.resolve(req.body || {});
  const readSession = req => req.user || null;
  const t = createTrainer({
    json, readBody, readSession,
    requireAdmin: (req, res) => {
      if (!req.user) { res.code = 401; return null; }
      if (!req.user.admin) { res.code = 403; return null; }
      return req.user;
    },
    readState: uid => states[uid] || null,
    sendPush: (uid, payload) => { pushes.push({ uid, payload }); return Promise.resolve(); },
    isAdmin: u => !!u?.admin,
    getDb: () => db,
    saveDb: () => {}
  });
  const routes = { ...t.routes, ...suppRoutes({ json, readBody, readSession }) };
  const call = async (key, user, { body, url } = {}) => {
    const res = {};
    await routes[key]({ user, body, url: url || '/x' }, res);
    return res;
  };
  return { t, db, states, pushes, call };
}

test('sending supplements versions them, refuses stale edits and tells the student', async () => {
  const h = harness();
  const [adm, stu] = h.db.users;
  const put = await h.call('PUT /api/trainer/supps', adm, { body: { id: 'stu', baseVersion: 0, supps: SUPPS } });
  assert.equal(put.code, 200, JSON.stringify(put.body));
  assert.equal(put.body.version, 1);
  assert.equal(put.body.supps.items, 2);
  assert.equal(h.pushes.at(-1).uid, 'stu');
  assert.equal(h.pushes.at(-1).payload.title, 'Tu entrenador actualizó tus suplementos');
  assert.equal(h.pushes.at(-1).payload.url, '#/supps');

  assert.equal((await h.call('PUT /api/trainer/supps', adm, { body: { id: 'stu', baseVersion: 0, supps: SUPPS } })).code, 409);

  const mine = await h.call('GET /api/trainer/my-supps', stu);
  assert.equal(mine.body.supps.version, 1);
  assert.equal(mine.body.supps.items.length, 2);
  assert.equal(mine.body.supps.by, 'Coach');
  assert.equal(mine.body.supps.acked, false);

  await h.call('POST /api/trainer/my-supps/ack', stu, { body: { version: 1 } });
  const list = await h.call('GET /api/trainer/students', adm);
  assert.equal(list.body.students.find(s => s.id === 'stu').supps.acked, true);

  // A removal is a tombstone, so the student's device learns to drop the list.
  const rm = await h.call('POST /api/trainer/supps/remove', adm, { body: { id: 'stu' } });
  assert.equal(rm.body.version, 2);
  assert.equal((await h.call('GET /api/trainer/my-supps', stu)).body.supps.removed, true);
  assert.equal(suppsFor('stu'), null);
});

test('a trainer can prescribe supplements for themselves, without pushing to themselves', async () => {
  const h = harness();
  const adm = h.db.users[0];
  const before = h.pushes.length;
  const r = await h.call('PUT /api/trainer/supps', adm, { body: { id: 'adm', baseVersion: 0, supps: SUPPS } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(h.pushes.length, before);
  assert.equal((await h.call('GET /api/trainer/my-supps', adm)).body.supps.items.length, 2);
  // Not an admin: no access at all.
  assert.equal((await h.call('PUT /api/trainer/supps', h.db.users[1], { body: { id: 'stu', baseVersion: 0, supps: SUPPS } })).code, 403);
  assert.equal((await h.call('PUT /api/trainer/supps', adm, { body: { id: 'nobody', baseVersion: 0, supps: SUPPS } })).code, 404);
});

test('the student logs a dose through their own routes only', async () => {
  const h = harness();
  const stu = h.db.users[1];
  const put = await h.call('PUT /api/supp/day', stu, { body: { date: '2026-10-19', taken: { sCre: [0] }, _ts: 100 } });
  assert.equal(put.code, 200, JSON.stringify(put.body));
  const got = await h.call('GET /api/supp/days', stu, { url: '/api/supp/days?from=2026-10-19&to=2026-10-19' });
  assert.deepEqual(got.body.days['2026-10-19'].taken, { sCre: [0] });
  // The log belongs to the session, never to an id in the body.
  assert.equal((await h.call('PUT /api/supp/day', null, { body: { date: '2026-10-19' } })).code, 401);
  assert.equal((await h.call('PUT /api/supp/day', stu, { body: { date: 'nope' } })).code, 400);
  assert.equal((await h.call('GET /api/supp/days', stu, { url: '/api/supp/days?from=2026-01-01&to=2026-12-31' })).code, 400);
  log.writeDay('stu', '2026-10-19', { taken: {}, _ts: 999 });
});

test('a copy of another student’s list is offered as a starting point', async () => {
  const h = harness();
  const adm = h.db.users[0];
  await h.call('PUT /api/trainer/supps', adm, { body: { id: 'stu', baseVersion: store.readSupps('stu')?.version || 0, supps: SUPPS } });
  const r = await h.call('GET /api/trainer/supps', adm, { url: '/api/trainer/supps?id=stu' });
  assert.equal(r.body.supps.items.length, 2);
  assert.equal(r.body.supps.note, 'Depois do treino');
});

/* ---------------- the daily check ---------------- */

test('an unticked day reaches the trainer once, on the student clock', async () => {
  const h = harness();
  const adm = h.db.users[0];
  await h.call('PUT /api/trainer/supps', adm, { body: { id: 'stu', baseVersion: store.readSupps('stu')?.version || 0, supps: SUPPS } });
  const ctx = { students: h.t.students, admins: h.t.admins, prefsOf: h.t.prefsOf, langOf: h.t.langOf, readState: uid => h.states[uid], sendPush: (uid, p) => { h.pushes.push({ uid, payload: p }); return Promise.resolve(); }, notifyAdmins: h.t.notifyAdmins };
  const before = store.listEvents().length;
  // 21:35 in Asunción on Monday 19 Oct = 00:35 UTC on the 20th. Nothing ticked all day.
  runDaily(ctx, new Date(Date.UTC(2026, 9, 20, 0, 35)));
  runDaily(ctx, new Date(Date.UTC(2026, 9, 20, 0, 36)));
  const evs = store.listEvents().slice(before).filter(e => e.kind.startsWith('supp'));
  assert.deepEqual(evs.map(e => e.kind), ['supp-missing']);
  assert.equal(evs[0].date, '2026-10-19');
  assert.equal(evs[0].data.due, 3);
  const pushed = h.pushes.filter(p => p.payload.tag === 'trainer-supp-stu');
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].uid, 'adm');
  // The trainer reads Portuguese even though the student uses the app in Spanish.
  assert.equal(pushed[0].payload.title, 'Ana não marcou suplementos hoje');
  assert.match(pushed[0].payload.body, /3 tomas/);
});

test('a half-ticked day is reported as partial, and a complete one is silent', async () => {
  const h = harness();
  const adm = h.db.users[0];
  await h.call('PUT /api/trainer/supps', adm, { body: { id: 'stu', baseVersion: store.readSupps('stu')?.version || 0, supps: SUPPS } });
  const ctx = { students: h.t.students, admins: h.t.admins, prefsOf: h.t.prefsOf, langOf: h.t.langOf, readState: uid => h.states[uid], sendPush: (uid, p) => { h.pushes.push({ uid, payload: p }); return Promise.resolve(); }, notifyAdmins: h.t.notifyAdmins };

  log.writeDay('stu', '2026-10-20', { taken: { sCre: [0] }, _ts: 1 });
  runDaily(ctx, new Date(Date.UTC(2026, 9, 21, 0, 35)));
  let evs = store.listEvents().filter(e => e.kind === 'supp-partial' && e.date === '2026-10-20');
  assert.equal(evs.length, 1);
  assert.equal(evs[0].data.taken, 1);
  assert.match(h.pushes.at(-1).payload.body, /Whey/);

  // Tuesday 21 Oct, everything ticked: no event, no push.
  log.writeDay('stu', '2026-10-21', { taken: { sCre: [0], sWhey: [0, 1] }, _ts: 1 });
  const n = h.pushes.length;
  runDaily(ctx, new Date(Date.UTC(2026, 9, 22, 0, 35)));
  assert.equal(h.pushes.length, n);
  assert.equal(store.listEvents().some(e => e.kind.startsWith('supp') && e.date === '2026-10-21'), false);
});

test('a day the list does not fall on is never missed, and the admin can switch it off', async () => {
  const h = harness();
  const adm = h.db.users[0];
  // Weekdays only, so Saturday 24 Oct has nothing due.
  await h.call('PUT /api/trainer/supps', adm, { body: { id: 'stu', baseVersion: store.readSupps('stu')?.version || 0, supps: { items: [SUPPS.items[0]] } } });
  const ctx = { students: h.t.students, admins: h.t.admins, prefsOf: h.t.prefsOf, langOf: h.t.langOf, readState: uid => h.states[uid], sendPush: (uid, p) => { h.pushes.push({ uid, payload: p }); return Promise.resolve(); }, notifyAdmins: h.t.notifyAdmins };
  runDaily(ctx, new Date(Date.UTC(2026, 9, 25, 0, 35)));   // Sat 24 Oct, 21:35 in Asunción
  assert.equal(store.listEvents().some(e => e.kind.startsWith('supp') && e.date === '2026-10-24'), false);

  await h.call('PUT /api/trainer/prefs', adm, { body: { prefs: { suppMissing: false }, times: { suppAt: '20:15' } } });
  assert.equal(store.readTimes().suppAt, '20:15');
  runDaily(ctx, new Date(Date.UTC(2026, 9, 26, 0, 20)));   // Sun 25 Oct, 21:20 — Monday's list, nothing due Sunday
  runDaily(ctx, new Date(Date.UTC(2026, 9, 27, 0, 20)));   // Mon 26 Oct, 21:20 — due, nothing ticked
  const pushed = h.pushes.filter(p => p.payload.tag === 'trainer-supp-stu');
  assert.equal(pushed.length, 0);
  // The event is still written: the feed has it even when the push is off.
  assert.equal(store.listEvents().some(e => e.kind === 'supp-missing' && e.date === '2026-10-26'), true);
  store.writeTimes(store.DEFAULT_TIMES);
});

test('the student page carries the list, its version and the log to review', async () => {
  const h = harness();
  const adm = h.db.users[0];
  await h.call('PUT /api/trainer/supps', adm, { body: { id: 'stu', baseVersion: store.readSupps('stu')?.version || 0, supps: SUPPS } });
  h.states.stu.tz = 'America/Asuncion';
  const r = await h.call('GET /api/trainer/student', adm, { url: '/api/trainer/student?id=stu' });
  assert.equal(r.code, 200);
  assert.equal(r.body.supps.items.length, 2);
  assert.equal(r.body.suppVersion, store.readSupps('stu').version);
  assert.equal(r.body.suppLog.length, 14);
  assert.ok(r.body.suppLog.every(d => 'due' in d && 'status' in d));
  const list = await h.call('GET /api/trainer/students', adm);
  const row = list.body.students.find(s => s.id === 'stu');
  assert.equal(row.supps.items, 2);
  assert.ok(row.supp7 && typeof row.supp7.ok === 'number');
});
