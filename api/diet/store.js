/* The food diary: what a student ate, per day, under $DATA_DIR/diet/<uid>/<YYYY-MM>.json.
 *
 * Not in the synced state blob on purpose. A diary grows by a few dozen entries a day —
 * over a year that is more than the whole rest of a profile, and the state blob is PUT in
 * full on every change. Here it is one small file per month and one day per request, and a
 * conflict can only ever cost one day: the newer `_ts` wins, per day, the same rule the
 * state blob uses for everything.
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.DATA_DIR || '/data';
const DIR = path.join(DATA, 'diet');
const safe = uid => String(uid).replace(/[^a-zA-Z0-9_-]/g, '');
export const ISO = /^\d{4}-\d{2}-\d{2}$/;
const monthFile = (uid, month) => path.join(DIR, safe(uid), month + '.json');

function readMonth(uid, month) {
  try { return JSON.parse(fs.readFileSync(monthFile(uid, month), 'utf8')); } catch { return { days: {} }; }
}
function writeMonth(uid, month, rec) {
  const file = monthFile(uid, month);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rec), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Days from `from` to `to` (inclusive ISO dates) that have anything stored: { date: day }. */
export function readDays(uid, from, to) {
  const out = {};
  for (const month of monthsBetween(from, to)) {
    const rec = readMonth(uid, month);
    for (const [d, day] of Object.entries(rec.days || {})) if (d >= from && d <= to) out[d] = day;
  }
  return out;
}

export const readDay = (uid, date) => readMonth(uid, date.slice(0, 7)).days?.[date] || null;

/**
 * Store one day if it is at least as new as what is there. Returns { ok, day } — on a
 * conflict ok is false and `day` is the stored (newer) version for the client to adopt.
 */
export function writeDay(uid, date, day) {
  const month = date.slice(0, 7);
  const rec = readMonth(uid, month);
  rec.days = rec.days || {};
  const cur = rec.days[date];
  if (cur && (cur._ts || 0) > (day._ts || 0)) return { ok: false, day: cur };
  if (!day.entries.length && !day.water) delete rec.days[date];
  else rec.days[date] = day;
  writeMonth(uid, month, rec);
  return { ok: true, day };
}
