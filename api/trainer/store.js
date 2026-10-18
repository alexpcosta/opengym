/* Files the trainer module owns, all under $DATA_DIR/trainer.
 *
 * Why not inside a student's state file: a client PUTs its whole state and the newest `_ts`
 * wins, so anything the server wrote in there would be erased by the next device to sync an
 * older copy (the same reason the Coach keeps its proposals in coach/<uid>.json). A trainer's
 * plan lives here, versioned, and every student device pulls it and applies it locally — a
 * device that synced a stale copy simply sees the newer version on its next boot and reapplies.
 *
 *   plans/<uid>.json   the trainer-authored workout plan for one student
 *   diets/<uid>.json   the trainer-authored diet for one student
 *   foods.json         foods a trainer created, visible to every student
 *   events.json        the feed: workouts done, PRs, missed days, diet checks (ring buffer)
 *   state.json         once-a-day markers, so a daily check never fires twice
 *   settings.json      instance-wide check times (when "missed" and diet checks run)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA = process.env.DATA_DIR || '/data';
const DIR = path.join(DATA, 'trainer');
const MAX_EVENTS = 1000;

const safe = uid => String(uid).replace(/[^a-zA-Z0-9_-]/g, '');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/* ---------- per-student plan and diet ---------- */
const planFile = uid => path.join(DIR, 'plans', safe(uid) + '.json');
const dietFile = uid => path.join(DIR, 'diets', safe(uid) + '.json');
export const readPlan = uid => readJSON(planFile(uid), null);
export const writePlan = (uid, rec) => writeJSON(planFile(uid), rec);
export const readDiet = uid => readJSON(dietFile(uid), null);
export const writeDiet = (uid, rec) => writeJSON(dietFile(uid), rec);

/* ---------- trainer foods ---------- */
const foodsFile = () => path.join(DIR, 'foods.json');
export const readFoods = () => readJSON(foodsFile(), []);
export const writeFoods = list => writeJSON(foodsFile(), list);

/* ---------- event feed ---------- */
// Kept in memory once read: every workout sync appends to it, and re-reading a file of a
// thousand events on each of those would be the one hot path in an otherwise idle module.
let events = null;
const eventsFile = () => path.join(DIR, 'events.json');
export function listEvents() {
  if (!events) events = readJSON(eventsFile(), []);
  return events;
}
export function addEvent(ev) {
  const list = listEvents();
  const rec = { id: crypto.randomBytes(6).toString('base64url'), at: Date.now(), ...ev };
  list.push(rec);
  if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS);
  writeJSON(eventsFile(), list);
  return rec;
}
/** Whether an event of this kind already exists for this student and date (daily dedupe). */
export const hasEvent = (kind, sid, date) => listEvents().some(e => e.kind === kind && e.sid === sid && e.date === date);

/* ---------- daily markers ---------- */
let daily = null;
const dailyFile = () => path.join(DIR, 'state.json');
const loadDaily = () => (daily = daily || readJSON(dailyFile(), { marks: {} }));
export const marked = (key, date) => loadDaily().marks[key] === date;
export function mark(key, date) {
  loadDaily().marks[key] = date;
  writeJSON(dailyFile(), daily);
}

/* ---------- instance-wide check times ---------- */
export const DEFAULT_TIMES = { missedAt: '21:00', dietAt: '22:00', summaryAt: '22:30' };
const settingsFile = () => path.join(DIR, 'settings.json');
export const readTimes = () => ({ ...DEFAULT_TIMES, ...readJSON(settingsFile(), {}) });
export const writeTimes = times => writeJSON(settingsFile(), times);

/** Tests only: forget the in-memory copies so a fresh DATA_DIR is read from disk. */
export function _reset() { events = null; daily = null; }
