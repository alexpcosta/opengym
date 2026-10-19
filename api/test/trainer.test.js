import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from './helpers.mjs';

tempData();
const { validateTrainerPlan } = await import('../trainer/validate.js');
const { newWorkouts, workoutSummary, missedToday, adherence, RECENT_MS } = await import('../trainer/notify.js');
const { msg, fmtDur } = await import('../trainer/messages.js');
const { createTrainer } = await import('../trainer/routes.js');
const { runDaily } = await import('../trainer/daily.js');
const store = await import('../trainer/store.js');
const { effectiveRoutineId, userNow, isoMinus } = await import('../lib/schedule.js');

const PLAN = {
  routines: [
    { id: 'tA', name: 'Upper', emoji: 'figureStrength', prog: 'double', ex: [{ id: '0001', sets: 3, reps: 10, mode: 'reps', weight: 20 }, { id: 'cx1', sets: 2, min: 15, speed: 9 }] },
    { id: 'tB', name: 'Lower', ex: [{ id: '0007', sets: 3, sec: 45, mode: 'time' }] }
  ],
  week: { 1: 'tA', 4: 'tB', 6: '' },
  customEx: [{ id: 'cx1', n: 'Bike intervals', bp: 'cardio' }],
  note: 'Go easy on week one'
};

/* ---------------- validation ---------------- */

test('a well-formed trainer plan passes with modes written out', () => {
  const r = validateTrainerPlan(PLAN);
  assert.equal(r.ok, true, r.errors?.join('; '));
  assert.deepEqual(r.plan.week, { 1: 'tA', 4: 'tB' });
  const bike = r.plan.routines[0].ex[1];
  assert.equal(bike.mode, 'cardio');
  assert.equal(bike.min, 15);
  assert.equal(r.plan.routines[1].ex[0].mode, 'time');
  assert.equal(r.plan.note, 'Go easy on week one');
});

test('routine ids must be stable trainer ids, unique, and the week must resolve', () => {
  assert.equal(validateTrainerPlan({ ...PLAN, routines: [{ ...PLAN.routines[0], id: 'r1' }] }).ok, false);
  assert.equal(validateTrainerPlan({ ...PLAN, routines: [PLAN.routines[0], { ...PLAN.routines[1], id: 'tA' }] }).ok, false);
  assert.equal(validateTrainerPlan({ ...PLAN, week: { 2: 'tZ' } }).ok, false);
  assert.equal(validateTrainerPlan({ ...PLAN, week: { 9: 'tA' } }).ok, false);
});

test('unknown exercises and empty routines are rejected', () => {
  const bad = validateTrainerPlan({ routines: [{ id: 'tA', name: 'A', ex: [{ id: 'nope', sets: 3 }] }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => e.includes('nope')));
  assert.equal(validateTrainerPlan({ routines: [] }).ok, false);
});

/* ---------------- what counts as a new workout ---------------- */

const now = Date.UTC(2026, 9, 18, 20, 0);
const wk = (id, endAgoMs, over = {}) => ({ id, d: '2026-10-18', name: 'Upper', routineId: 'tA', start: now - endAgoMs - 3000000, end: now - endAgoMs, vol: 1234.4, prs: [], entries: [{ id: '0001', sets: [{ w: 20, r: 10, done: true }, { w: 20, r: 9, done: true }, { w: 20, r: 0, done: false }] }], ...over });

test('only workouts that are new and recently finished are reported', () => {
  const prev = { workouts: [wk('w1', 1000)] };
  const next = { workouts: [wk('w1', 1000), wk('w2', 60000), wk('old', RECENT_MS + 60000)] };
  assert.deepEqual(newWorkouts(prev, next, now).map(w => w.id), ['w2']);
});

test('a history import does not flood the trainer', () => {
  const many = Array.from({ length: 50 }, (_, i) => wk('i' + i, 1000 + i));
  assert.equal(newWorkouts(null, { workouts: many }, now).length, 3);
  const imported = Array.from({ length: 50 }, (_, i) => wk('h' + i, RECENT_MS + 86400000 * (i + 1)));
  assert.equal(newWorkouts({ workouts: [] }, { workouts: imported }, now).length, 0);
});

test('a summary carries duration, done sets, volume and PR names', () => {
  const s = workoutSummary(wk('w2', 0, { prs: ['0001', 'cx9'] }), { unit: 'kg', customEx: [{ id: 'cx9', n: 'Sled push' }] });
  assert.equal(s.sets, 2);
  assert.equal(s.dur, 3000000);
  assert.equal(s.vol, 1234);
  assert.equal(s.prs.length, 2);
  assert.equal(s.prs[1], 'Sled push');
  assert.equal(fmtDur(s.dur), '50 min');
  assert.equal(fmtDur(3900000), '1h 05m');
});

/* ---------------- missed days and adherence ---------------- */

const STUDENT = { routines: [{ id: 'tA', name: 'Upper' }], week: { 1: 'tA', 3: 'tA' }, dayPlan: {}, workouts: [] };

test('a planned day with nothing logged is missed only after the check time', () => {
  const mon = { date: '2026-10-19', hhmm: '21:05' };   // a Monday
  assert.deepEqual(missedToday(STUDENT, mon, '21:00', effectiveRoutineId), { id: 'tA', name: 'Upper' });
  assert.equal(missedToday(STUDENT, { ...mon, hhmm: '20:59' }, '21:00', effectiveRoutineId), null);
  assert.equal(missedToday({ ...STUDENT, workouts: [{ d: '2026-10-19' }] }, mon, '21:00', effectiveRoutineId), null);
  assert.equal(missedToday(STUDENT, { date: '2026-10-20', hhmm: '22:00' }, '21:00', effectiveRoutineId), null);   // rest day
  assert.equal(missedToday({ ...STUDENT, dayPlan: { '2026-10-19': 'rest' } }, mon, '21:00', effectiveRoutineId), null);
});

test('adherence counts planned days and the ones that were trained', () => {
  const S = { ...STUDENT, workouts: [{ d: '2026-10-12' }, { d: '2026-10-17' }] };   // Mon 12 trained, Wed 14 not, Sat 17 extra
  const a = adherence(S, '2026-10-18', 7, effectiveRoutineId, isoMinus);
  assert.equal(a.planned, 2);
  assert.equal(a.done, 1);
  assert.equal(a.workouts, 2);
  assert.equal(a.days.length, 7);
  assert.equal(a.days[0].d, '2026-10-12');
});

test('userNow reads the date and time in the given zone', () => {
  const at = new Date(Date.UTC(2026, 9, 19, 2, 30));   // 02:30 UTC = 23:30 the day before in Asunción (UTC-3)
  assert.deepEqual(userNow('America/Asuncion', at), { date: '2026-10-18', hhmm: '23:30', weekday: 0 });
  assert.equal(userNow('Not/AZone', at), null);
});

/* ---------------- messages ---------------- */

test('push text follows the recipient language and falls back to English', () => {
  assert.equal(msg('pt', 'doneT', { name: 'Ana', routine: 'Upper' }), 'Ana concluiu Upper');
  assert.equal(msg('es', 'planT'), 'Tu entrenador actualizó tu plan');
  assert.equal(msg('xx', 'planT'), 'Your trainer updated your plan');
});

/* ---------------- routes against fakes ---------------- */

function harness() {
  const db = {
    users: [
      { id: 'adm', name: 'Coach', admin: true },
      { id: 'stu', name: 'Ana' },
      { id: 'off', name: 'Gone', disabled: true }
    ],
    subs: []
  };
  const states = { adm: { lang: 'pt' }, stu: { lang: 'es', unit: 'kg', tz: 'America/Asuncion', ...STUDENT } };
  const pushes = [];
  const t = createTrainer({
    json: (res, code, body) => { res.code = code; res.body = body; },
    readBody: req => Promise.resolve(req.body || {}),
    readSession: req => req.user || null,
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
  const call = async (key, user, { body, url } = {}) => {
    const res = {};
    await t.routes[key]({ user, body, url: url || '/x' }, res);
    return res;
  };
  return { t, db, states, pushes, call };
}

test('only admins reach the trainer routes, and students are everyone else', async () => {
  const h = harness();
  assert.equal((await h.call('GET /api/trainer/students', h.db.users[1])).code, 403);
  const r = await h.call('GET /api/trainer/students', h.db.users[0]);
  assert.equal(r.code, 200);
  // The trainer comes first, as themselves; disabled profiles are left out.
  assert.deepEqual(r.body.students.map(s => s.id), ['adm', 'stu']);
  assert.equal(r.body.students[0].self, true);
});

test('a trainer can write a plan and a diet for themselves, without pushing to themselves', async () => {
  const h = harness();
  const adm = h.db.users[0];
  const before = h.pushes.length;
  const plan = await h.call('PUT /api/trainer/plan', adm, { body: { id: 'adm', baseVersion: store.readPlan('adm')?.version || 0, plan: PLAN } });
  assert.equal(plan.code, 200, JSON.stringify(plan.body));
  const diet = await h.call('PUT /api/trainer/diet', adm, { body: { id: 'adm', baseVersion: store.readDiet('adm')?.version || 0, diet: { targets: { kcal: 2400, p: 160, c: 260, f: 70 } } } });
  assert.equal(diet.code, 200, JSON.stringify(diet.body));
  assert.equal(h.pushes.length, before);
  assert.equal((await h.call('GET /api/trainer/my-plan', adm)).body.plan.routines.length, 2);
  assert.equal((await h.call('GET /api/trainer/my-diet', adm)).body.diet.targets.kcal, 2400);
  // Another admin is still not a target.
  h.db.users.push({ id: 'adm2', name: 'Other', admin: true });
  assert.equal((await h.call('PUT /api/trainer/plan', adm, { body: { id: 'adm2', baseVersion: 0, plan: PLAN } })).code, 404);
});

test('sending a plan versions it, refuses stale edits and tells the student', async () => {
  const h = harness();
  const [adm, stu] = h.db.users;
  const put = await h.call('PUT /api/trainer/plan', adm, { body: { id: 'stu', baseVersion: 0, plan: PLAN } });
  assert.equal(put.code, 200, JSON.stringify(put.body));
  assert.equal(put.body.version, 1);
  assert.equal(h.pushes.at(-1).uid, 'stu');
  assert.equal(h.pushes.at(-1).payload.title, 'Tu entrenador actualizó tu plan');

  const stale = await h.call('PUT /api/trainer/plan', adm, { body: { id: 'stu', baseVersion: 0, plan: PLAN } });
  assert.equal(stale.code, 409);

  const mine = await h.call('GET /api/trainer/my-plan', stu);
  assert.equal(mine.body.plan.version, 1);
  assert.equal(mine.body.plan.routines.length, 2);
  assert.equal(mine.body.plan.by, 'Coach');

  await h.call('POST /api/trainer/my-plan/ack', stu, { body: { version: 1 } });
  const list = await h.call('GET /api/trainer/students', adm);
  assert.equal(list.body.students.find(s => s.id === 'stu').plan.acked, true);

  const rm = await h.call('POST /api/trainer/plan/remove', adm, { body: { id: 'stu' } });
  assert.equal(rm.body.version, 2);
  const after = await h.call('GET /api/trainer/my-plan', stu);
  assert.equal(after.body.plan.removed, true);
});

test('a finished workout becomes an event and a push to the admin, PRs separately', () => {
  const h = harness();
  const before = store.listEvents().length;
  const w = { ...wk('fresh', 0), start: Date.now() - 2400000, end: Date.now(), prs: ['0001'] };
  h.t.onStateSaved(h.db.users[1], { workouts: [] }, { unit: 'kg', workouts: [w] });
  const evs = store.listEvents().slice(before);
  assert.deepEqual(evs.map(e => e.kind), ['done', 'pr']);
  assert.equal(h.pushes.length, 2);
  assert.equal(h.pushes[0].uid, 'adm');
  assert.equal(h.pushes[0].payload.title, 'Ana concluiu Upper');
  assert.equal(h.pushes[0].payload.url, '#/trainer/s/stu');

  // An admin's own workouts are not news to anyone.
  h.t.onStateSaved(h.db.users[0], { workouts: [] }, { workouts: [{ ...w, id: 'mine' }] });
  assert.equal(h.pushes.length, 2);
});

test('the admin can turn a kind of push off', async () => {
  const h = harness();
  await h.call('PUT /api/trainer/prefs', h.db.users[0], { body: { prefs: { done: false }, times: { missedAt: '20:30', dietAt: 'bogus' } } });
  const w = { ...wk('quiet', 0), start: Date.now() - 60000, end: Date.now() };
  h.t.onStateSaved(h.db.users[1], { workouts: [] }, { workouts: [w] });
  assert.equal(h.pushes.length, 0);
  const times = store.readTimes();
  assert.equal(times.missedAt, '20:30');
  assert.equal(times.dietAt, '22:00');
  store.writeTimes(store.DEFAULT_TIMES);
});

test('the daily loop reports a skipped day once, on the student clock', () => {
  const h = harness();
  const ctx = { students: h.t.students, readState: uid => h.states[uid], notifyAdmins: h.t.notifyAdmins };
  const before = store.listEvents().filter(e => e.kind === 'missed').length;
  // Monday 19 Oct, 21:10 in Asunción = 00:10 UTC on the 20th.
  const at = new Date(Date.UTC(2026, 9, 20, 0, 10));
  runDaily(ctx, at);
  runDaily(ctx, new Date(at.getTime() + 60000));
  const missed = store.listEvents().filter(e => e.kind === 'missed');
  assert.equal(missed.length - before, 1);
  assert.equal(missed.at(-1).date, '2026-10-19');
  assert.equal(h.pushes.filter(p => p.payload.tag === 'trainer-missed-stu').length, 1);
});

/* ---------------- diets ---------------- */
const { validateTrainerDiet, validateTrainerFood } = await import('../trainer/validate.js');
const { dayStatus, dietCheck } = await import('../trainer/diet-checks.js');
const { addDailyCheck } = await import('../trainer/daily.js');
const diary = await import('../diet/store.js');
const { cleanDay } = await import('../diet/entries.js');
addDailyCheck(dietCheck);

const RICE = { src: 'taco', fid: 't1', name: 'Arroz, integral, cozido', per100: { kcal: 124, p: 2.6, c: 25.8, f: 1, fib: 2.7 } };
const CHICKEN = { src: 'taco', fid: 't410', name: 'Frango, peito, sem pele, grelhado', per100: { kcal: 159, p: 32, c: 0, f: 2.5, fib: 0 } };
const DIET = {
  targets: { kcal: 2000, p: 150, c: 200, f: 60 },
  calc: { sex: 'female', birth: '1995-05-10', heightCm: 165, kg: 62, activity: 'moderate', goal: 'lose', pace: 0.5 },
  meals: [{ id: 'm1', name: 'Almoço', time: '12:30', items: [{ id: 'i1', food: RICE, g: 150, alt: [{ food: CHICKEN, g: 100 }, { food: { name: 'broken' }, g: 1 }] }] }],
  note: 'Beber 2 L de água'
};

test('a trainer diet is validated: targets required, foods complete, alternatives cleaned', () => {
  const r = validateTrainerDiet(DIET);
  assert.equal(r.ok, true, r.errors?.join('; '));
  assert.equal(r.diet.meals[0].items[0].alt.length, 1);
  assert.equal(r.diet.meals[0].time, '12:30');
  assert.equal(validateTrainerDiet({ ...DIET, targets: { kcal: 100 } }).ok, false);
  assert.equal(validateTrainerDiet({ ...DIET, meals: [{ id: 'bad', name: 'x', items: [] }] }).ok, false);
  assert.equal(validateTrainerDiet({ targets: { kcal: 1800, p: 120 } }).ok, true);          // numbers only, no menu
  assert.equal(validateTrainerFood({ name: 'Chipa', per100: { kcal: 330, p: 9, c: 40, f: 15 } }).name, 'Chipa');
  assert.equal(validateTrainerFood({ name: 'No energy' }), null);
});

test('a day is ok, off target, or not logged', () => {
  const T = { kcal: 2000, p: 150 };
  const entry = (food, g) => ({ id: 'e' + g, name: food.name, g, per100: food.per100 });
  assert.equal(dayStatus(null, T).status, 'none');
  assert.equal(dayStatus({ entries: [entry(RICE, 800), entry(CHICKEN, 600)] }, T).status, 'ok');        // 1946 kcal, 213 g protein
  assert.equal(dayStatus({ entries: [entry(RICE, 300)] }, T).status, 'off');                           // 372 kcal
  assert.equal(dayStatus({ entries: [entry(RICE, 1600)] }, T).status, 'off');                          // kcal fine, protein far short
});

test('sending a diet versions it and the student pulls and acks it', async () => {
  const h = harness();
  const [adm, stu] = h.db.users;
  const put = await h.call('PUT /api/trainer/diet', adm, { body: { id: 'stu', baseVersion: 0, diet: DIET } });
  assert.equal(put.code, 200, JSON.stringify(put.body));
  assert.equal(h.pushes.at(-1).payload.title, 'Tu entrenador actualizó tu dieta');
  const mine = await h.call('GET /api/trainer/my-diet', stu);
  assert.equal(mine.body.diet.targets.kcal, 2000);
  assert.equal(mine.body.diet.meals[0].items[0].food.name, RICE.name);
  await h.call('POST /api/trainer/my-diet/ack', stu, { body: { version: 1 } });
  const detail = await h.call('GET /api/trainer/student', adm, { url: '/x?id=stu' });
  assert.equal(detail.body.diet.ackedVersion, 1);
  assert.equal(detail.body.targets.kcal, 2000);
  assert.equal(detail.body.diary.length, 14);
  const copy = await h.call('GET /api/trainer/diet', adm, { url: '/x?id=stu' });
  assert.equal(copy.body.diet.meals.length, 1);
  const rm = await h.call('POST /api/trainer/diet/remove', adm, { body: { id: 'stu' } });
  assert.equal(rm.body.version, 2);
  assert.equal((await h.call('GET /api/trainer/my-diet', stu)).body.diet.removed, true);
});

test('trainer foods can be added, edited and deleted', async () => {
  const h = harness();
  const adm = h.db.users[0];
  const a = await h.call('POST /api/trainer/foods', adm, { body: { food: { name: 'Chipa', per100: { kcal: 330, p: 9, c: 40, f: 15 }, unit: { n: '1 unidad', g: 60 } } } });
  assert.equal(a.code, 200);
  const id = a.body.food.id;
  const b = await h.call('POST /api/trainer/foods', adm, { body: { food: { id, name: 'Chipa casera', per100: { kcal: 320 } } } });
  assert.equal(b.body.foods.length, 1);
  assert.equal(b.body.foods[0].name, 'Chipa casera');
  assert.equal((await h.call('POST /api/trainer/foods', h.db.users[1], { body: { food: {} } })).code, 403);
  const c = await h.call('POST /api/trainer/foods/delete', adm, { body: { id } });
  assert.equal(c.body.foods.length, 0);
});

test('the daily diet check reports an empty or off-target day once, and a summary to the admin', async () => {
  const h = harness();
  const [adm] = h.db.users;
  h.states.adm.tz = 'America/Asuncion';
  await h.call('PUT /api/trainer/diet', adm, { body: { id: 'stu', baseVersion: (store.readDiet('stu')?.version || 0), diet: DIET } });
  diary.writeDay('stu', '2026-10-19', cleanDay({ entries: [{ id: 'e1', name: 'Arroz', src: 'taco', g: 300, per100: RICE.per100 }], _ts: 1 }));
  const ctx = { students: h.t.students, admins: h.t.admins, prefsOf: h.t.prefsOf, langOf: h.t.langOf, readState: uid => h.states[uid], sendPush: (uid, p) => { h.pushes.push({ uid, payload: p }); return Promise.resolve(); }, notifyAdmins: h.t.notifyAdmins };
  const before = store.listEvents().length;
  // 22:05 in Asunción on Monday 19 Oct (= 01:05 UTC on the 20th): diet check runs, summary not yet.
  runDaily(ctx, new Date(Date.UTC(2026, 9, 20, 1, 5)));
  runDaily(ctx, new Date(Date.UTC(2026, 9, 20, 1, 6)));
  const evs = store.listEvents().slice(before);
  assert.deepEqual(evs.filter(e => e.kind.startsWith('diet')).map(e => e.kind), ['diet-off']);
  assert.equal(evs.find(e => e.kind === 'diet-off').data.kcal, 372);
  // 22:35: the summary, once.
  runDaily(ctx, new Date(Date.UTC(2026, 9, 20, 1, 35)));
  runDaily(ctx, new Date(Date.UTC(2026, 9, 20, 1, 36)));
  const summaries = h.pushes.filter(p => p.payload.tag === 'trainer-summary');
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].uid, 'adm');
  assert.match(summaries[0].payload.body, /1 alunos: 0 na meta · 1 fora · 0 sem registo/);
});
