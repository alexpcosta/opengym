/* Food search (through Open Food Facts) and the food diary. Every route needs a session:
 * the OFF budget is shared by the whole instance, and an open proxy would let anyone spend it.
 */
import * as off from '../food/off.js';
import * as diary from './store.js';
import { cleanDay } from './entries.js';
import { readFoods } from '../trainer/store.js';

const MAX_SPAN_DAYS = 62;
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

export function dietRoutes({ json, readBody, readSession }) {
  const guard = (req, res) => {
    const user = readSession(req);
    if (!user) json(res, 401, { error: 'not signed in' });
    return user;
  };
  const q = req => new URL(req.url, 'http://x').searchParams;

  return {
    'GET /api/food/search': async (req, res) => {
      if (!guard(req, res)) return;
      const p = q(req);
      try { json(res, 200, await off.search(p.get('q'), p.get('lang') || 'es')); }
      catch (e) { console.error('food search', e.message); json(res, 502, { error: 'food search is unavailable right now', items: [] }); }
    },

    'GET /api/food/barcode': async (req, res) => {
      if (!guard(req, res)) return;
      const p = q(req);
      try { json(res, 200, await off.barcode(p.get('code'), p.get('lang') || 'es')); }
      catch (e) { console.error('food barcode', e.message); json(res, 502, { error: 'barcode lookup is unavailable right now', item: null }); }
    },

    // Foods a trainer created for everyone (trainer/routes.js manages them).
    'GET /api/food/trainer': async (req, res) => {
      if (!guard(req, res)) return;
      json(res, 200, { foods: readFoods() });
    },

    'GET /api/diet/days': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const p = q(req);
      const from = p.get('from'), to = p.get('to');
      if (!diary.ISO.test(from || '') || !diary.ISO.test(to || '') || from > to) return json(res, 400, { error: 'from and to must be ISO dates' });
      if (daysBetween(from, to) > MAX_SPAN_DAYS) return json(res, 400, { error: `at most ${MAX_SPAN_DAYS} days at a time` });
      json(res, 200, { days: diary.readDays(user.id, from, to) });
    },

    'PUT /api/diet/day': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      if (!diary.ISO.test(body.date || '')) return json(res, 400, { error: 'date must be an ISO date' });
      const r = diary.writeDay(user.id, body.date, cleanDay(body));
      if (!r.ok) return json(res, 409, { error: 'a newer version of this day exists', day: r.day });
      json(res, 200, { ok: true, _ts: r.day._ts });
    }
  };
}
