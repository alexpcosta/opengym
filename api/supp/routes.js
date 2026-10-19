/* The student's own supplement log: read a range of days, write one day. Every route needs a
 * session — a day belongs to whoever is signed in, never to an id in the body.
 */
import * as log from './store.js';
import { cleanDay } from './log.js';

const MAX_SPAN_DAYS = 62;
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

export function suppRoutes({ json, readBody, readSession }) {
  const guard = (req, res) => {
    const user = readSession(req);
    if (!user) json(res, 401, { error: 'not signed in' });
    return user;
  };

  return {
    'GET /api/supp/days': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const p = new URL(req.url, 'http://x').searchParams;
      const from = p.get('from'), to = p.get('to');
      if (!log.ISO.test(from || '') || !log.ISO.test(to || '') || from > to) return json(res, 400, { error: 'from and to must be ISO dates' });
      if (daysBetween(from, to) > MAX_SPAN_DAYS) return json(res, 400, { error: `at most ${MAX_SPAN_DAYS} days at a time` });
      json(res, 200, { days: log.readDays(user.id, from, to) });
    },

    'PUT /api/supp/day': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      if (!log.ISO.test(body.date || '')) return json(res, 400, { error: 'date must be an ISO date' });
      const r = log.writeDay(user.id, body.date, cleanDay(body));
      if (!r.ok) return json(res, 409, { error: 'a newer version of this day exists', day: r.day });
      json(res, 200, { ok: true, _ts: r.day._ts });
    }
  };
}
