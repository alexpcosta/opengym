/* What a trainer may send a student. The trainer is a trusted admin, but the student's app
 * applies this verbatim, so it is held to the same shape the plan editor produces: library
 * ids or custom exercises carried alongside, bounded numbers, a week that only points at
 * routines in the plan. Routine ids are stable (`t…`) because a student's history and
 * progression hang off `routineId` — re-sending an edited plan must not orphan them.
 */
import { libraryHas } from '../coach/payload.js';

const POLICIES = ['off', 'linear', 'greyskull', 'double', 'time'];
const MODES = ['reps', 'time', 'cardio'];
const MAX_ROUTINES = 14;
const MAX_EX_PER_ROUTINE = 30;
const MAX_CUSTOM = 100;
export const ROUTINE_ID = /^t[A-Za-z0-9_-]{1,40}$/;

const isStr = v => typeof v === 'string' && v.trim().length > 0;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const clampStr = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const between = (v, lo, hi) => isNum(v) && v >= lo && v <= hi;
const intIn = (v, lo, hi, dflt) => (Number.isInteger(v) && v >= lo && v <= hi ? v : dflt);

/** Returns { ok, plan:{routines, week, customEx, note} } or { ok:false, errors }. */
export function validateTrainerPlan(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return { ok: false, errors: ['plan must be an object'] };
  if (!Array.isArray(data.routines) || !data.routines.length) errors.push('the plan needs at least one routine');
  if ((data.routines || []).length > MAX_ROUTINES) errors.push(`at most ${MAX_ROUTINES} routines`);

  const customEx = (Array.isArray(data.customEx) ? data.customEx : [])
    .filter(c => c && isStr(c.id) && isStr(c.n))
    .slice(0, MAX_CUSTOM)
    .map(c => ({ id: clampStr(c.id, 40), n: clampStr(c.n, 60), bp: clampStr(c.bp || 'waist', 30), ...(isStr(c.desc) ? { desc: clampStr(c.desc, 400) } : {}) }));
  const customIds = new Set(customEx.map(c => c.id));

  const seen = new Set();
  const routines = [];
  (Array.isArray(data.routines) ? data.routines : []).slice(0, MAX_ROUTINES).forEach((r, ri) => {
    const where = `routine ${ri + 1}`;
    if (!r || typeof r !== 'object') { errors.push(`${where} is not an object`); return; }
    if (!ROUTINE_ID.test(r.id || '')) { errors.push(`${where} has an invalid id`); return; }
    if (seen.has(r.id)) { errors.push(`${where} repeats id ${r.id}`); return; }
    seen.add(r.id);
    if (!isStr(r.name)) errors.push(`${where} needs a name`);
    const ex = [];
    (Array.isArray(r.ex) ? r.ex : []).slice(0, MAX_EX_PER_ROUTINE).forEach((e, ei) => {
      if (!e || !isStr(e.id)) { errors.push(`${where}, exercise ${ei + 1} has no id`); return; }
      if (!libraryHas(e.id) && !customIds.has(e.id)) { errors.push(`${where}, exercise ${ei + 1} (${e.id}) is unknown`); return; }
      const clean = { id: e.id, sets: intIn(e.sets, 1, 20, 3) };
      const mode = MODES.includes(e.mode) ? e.mode : (isNum(e.min) ? 'cardio' : 'reps');
      if (mode === 'cardio') {
        // Written out, unlike the Coach's validator: a cardio entry that lost its mode on the
        // way would read back as reps for any exercise whose body part isn't "cardio".
        clean.mode = 'cardio';
        clean.min = intIn(e.min, 1, 600, 20);
        clean.speed = between(e.speed, 0.1, 50) ? e.speed : 8;
      } else if (mode === 'time') {
        clean.mode = 'time';
        clean.sec = intIn(e.sec, 5, 3600, 45);
        if (between(e.weight, 0.01, 1000)) clean.weight = e.weight;
      } else {
        clean.mode = 'reps';
        clean.reps = intIn(e.reps, 1, 100, 10);
        if (between(e.weight, 0.01, 1000)) clean.weight = e.weight;
      }
      if (POLICIES.includes(e.prog)) clean.prog = e.prog;
      if (between(e.inc, 0.01, 50)) clean.inc = e.inc;
      if (Number.isInteger(e.repsMin) && e.repsMin >= 1 && e.repsMin <= 100) clean.repsMin = e.repsMin;
      if (isStr(e.sg)) clean.sg = clampStr(e.sg, 30);
      ex.push(clean);
    });
    if (!ex.length) errors.push(`${where} (${clampStr(r.name, 40)}) has no exercises`);
    routines.push({
      id: r.id,
      name: clampStr(r.name || 'Routine', 40),
      emoji: clampStr(r.emoji || 'figureStrength', 40),
      ...(POLICIES.includes(r.prog) ? { prog: r.prog } : {}),
      ex
    });
  });

  const known = new Set(routines.map(r => r.id));
  const week = {};
  Object.entries(data.week && typeof data.week === 'object' ? data.week : {}).forEach(([d, rid]) => {
    const day = +d;
    if (!Number.isInteger(day) || day < 0 || day > 6) { errors.push(`week day ${d} is not 0-6`); return; }
    if (!rid) return;                       // an empty day is a rest day
    if (!known.has(rid)) { errors.push(`week day ${d} points at a routine that is not in the plan`); return; }
    week[day] = rid;
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, plan: { routines, week, customEx, note: clampStr(data.note, 1000) } };
}

/* ------------------------------ diets ------------------------------ */
const MEAL_ID = /^m[A-Za-z0-9_-]{1,40}$/;
const SOURCES = ['taco', 'off', 'trainer', 'custom'];
const MAX_MEALS = 10;
const MAX_ITEMS = 30;
const MAX_ALT = 5;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const n1 = (v, lo, hi) => (isNum(v) ? Math.min(hi, Math.max(lo, Math.round(v * 10) / 10)) : null);

function cleanFood(f) {
  if (!f || typeof f !== 'object' || !isStr(f.name)) return null;
  const p = f.per100 || {};
  const kcal = n1(p.kcal, 0, 950);
  if (kcal == null) return null;
  return {
    src: SOURCES.includes(f.src) ? f.src : 'custom', fid: clampStr(f.fid, 60), name: clampStr(f.name, 120),
    ...(isStr(f.brand) ? { brand: clampStr(f.brand, 60) } : {}),
    per100: { kcal, p: n1(p.p, 0, 100) || 0, c: n1(p.c, 0, 100) || 0, f: n1(p.f, 0, 100) || 0, fib: n1(p.fib, 0, 100) || 0 },
    ...(f.unit && n1(f.unit.g, 0.1, 2000) ? { unit: { n: isStr(f.unit.n) ? clampStr(f.unit.n, 40) : null, g: n1(f.unit.g, 0.1, 2000) } } : {})
  };
}

/**
 * Returns { ok, diet:{targets, calc, meals, note} } or { ok:false, errors }. Targets are
 * required (they are what the student's day is measured against); a menu is optional — a
 * trainer may send numbers only and let the student choose the food.
 */
export function validateTrainerDiet(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return { ok: false, errors: ['diet must be an object'] };
  const t = data.targets || {};
  const targets = { kcal: n1(t.kcal, 0, 10000), p: n1(t.p, 0, 1000), c: n1(t.c, 0, 2000), f: n1(t.f, 0, 1000) };
  if (!targets.kcal || targets.kcal < 500) errors.push('the daily calorie target must be at least 500 kcal');
  for (const k of ['p', 'c', 'f']) if (targets[k] == null) targets[k] = 0;

  const seenMeals = new Set();
  const meals = [];
  (Array.isArray(data.meals) ? data.meals : []).slice(0, MAX_MEALS).forEach((m, mi) => {
    const where = `meal ${mi + 1}`;
    if (!m || !MEAL_ID.test(m.id || '')) { errors.push(`${where} has an invalid id`); return; }
    if (seenMeals.has(m.id)) { errors.push(`${where} repeats id ${m.id}`); return; }
    seenMeals.add(m.id);
    if (!isStr(m.name)) errors.push(`${where} needs a name`);
    const seenItems = new Set();
    const items = [];
    (Array.isArray(m.items) ? m.items : []).slice(0, MAX_ITEMS).forEach((it, ii) => {
      const food = cleanFood(it?.food);
      const g = n1(it?.g, 0.1, 5000);
      if (!it || !isStr(it.id) || seenItems.has(it.id) || !food || !g) { errors.push(`${where}, food ${ii + 1} is incomplete`); return; }
      seenItems.add(it.id);
      const alt = (Array.isArray(it.alt) ? it.alt : []).slice(0, MAX_ALT)
        .map(a => ({ food: cleanFood(a?.food), g: n1(a?.g, 0.1, 5000) })).filter(a => a.food && a.g);
      items.push({ id: clampStr(it.id, 40), food, g, ...(alt.length ? { alt } : {}) });
    });
    meals.push({ id: m.id, name: clampStr(m.name || 'Meal', 40), ...(HHMM.test(m.time || '') ? { time: m.time } : {}), items });
  });

  // The calculator inputs the trainer used, kept so the numbers can be explained and redone.
  const c = data.calc && typeof data.calc === 'object' ? data.calc : null;
  const calc = c ? {
    sex: c.sex === 'female' ? 'female' : 'male', birth: /^\d{4}-\d{2}-\d{2}$/.test(c.birth || '') ? c.birth : null,
    heightCm: n1(c.heightCm, 50, 260), kg: n1(c.kg, 20, 400),
    activity: clampStr(c.activity, 20), goal: clampStr(c.goal, 20), pace: n1(c.pace, 0, 2), manual: !!c.manual
  } : null;

  if (errors.length) return { ok: false, errors };
  return { ok: true, diet: { targets, calc, meals, note: clampStr(data.note, 1000) } };
}

/** A food a trainer offers every student (GET /api/food/trainer). */
export function validateTrainerFood(f) {
  const food = cleanFood({ ...f, src: 'trainer' });
  if (!food) return null;
  return { id: /^tf[A-Za-z0-9_-]{1,40}$/.test(f.id || '') ? f.id : null, name: food.name, ...(food.brand ? { brand: food.brand } : {}), per100: food.per100, ...(food.unit ? { unit: food.unit } : {}) };
}
