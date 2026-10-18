/* Shape and arithmetic of diary entries — shared by the diary routes and the trainer's
 * daily diet checks. Pure functions.
 *
 * An entry carries its own nutrients per 100 g (copied from the food when it was logged),
 * so a day's totals never change because a food database was updated or a custom food
 * edited later. Amount is always grams; `unit` only remembers how it was entered.
 */
export const SOURCES = ['taco', 'off', 'trainer', 'custom', 'quick'];
export const MAX_ENTRIES = 200;

const isStr = v => typeof v === 'string' && v.trim().length > 0;
const n = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 10) / 10)) : 0);
const s = (v, len) => String(v == null ? '' : v).trim().slice(0, len);

/** A clean entry, or null when it cannot be one. Quick entries (kcal + macros only) use g = 100. */
export function cleanEntry(e) {
  if (!e || typeof e !== 'object' || !isStr(e.id) || !isStr(e.name)) return null;
  const src = SOURCES.includes(e.src) ? e.src : 'custom';
  const p = e.per100 || {};
  const out = {
    id: s(e.id, 40), meal: s(e.meal || 'm1', 30), src, fid: s(e.fid, 60), name: s(e.name, 120),
    g: n(e.g, 0, 5000),
    per100: { kcal: n(p.kcal, 0, 5000), p: n(p.p, 0, 1000), c: n(p.c, 0, 1000), f: n(p.f, 0, 1000), fib: n(p.fib, 0, 1000) },
    at: typeof e.at === 'number' && Number.isFinite(e.at) ? Math.round(e.at) : 0
  };
  if (isStr(e.brand)) out.brand = s(e.brand, 60);
  if (e.unit && typeof e.unit === 'object' && n(e.unit.g, 0, 5000) > 0) out.unit = { n: s(e.unit.n, 40) || null, g: n(e.unit.g, 0, 5000), q: n(e.unit.q ?? 1, 0, 100) };
  if (isStr(e.planned)) out.planned = s(e.planned, 40);
  return out;
}

export function cleanDay(body) {
  const entries = (Array.isArray(body?.entries) ? body.entries : []).slice(0, MAX_ENTRIES).map(cleanEntry).filter(Boolean);
  const day = { entries, _ts: typeof body?._ts === 'number' && Number.isFinite(body._ts) ? Math.round(body._ts) : Date.now() };
  const water = n(body?.water, 0, 20000);
  if (water) day.water = water;
  return day;
}

/** Totals for a list of entries: { kcal, p, c, f, fib } rounded to one decimal. */
export function totals(entries) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
  for (const e of entries || []) {
    const k = (e.g || 0) / 100;
    for (const key of Object.keys(t)) t[key] += (e.per100?.[key] || 0) * k;
  }
  for (const key of Object.keys(t)) t[key] = Math.round(t[key] * 10) / 10;
  return t;
}
