/* Open Food Facts, through this server only.
 *
 * Why a proxy instead of the browser calling OFF directly: OFF asks every app to identify
 * itself (User-Agent) and rate-limits per IP — 10 searches and 15 product reads a minute.
 * Behind this server every student shares one IP, so the limit is the server's to manage:
 * a token bucket keeps us under it, a cache answers repeats (most students eat the same
 * things), and the students' own IPs never reach a third party.
 *
 * Data: Open Food Facts, ODbL (database) / DbCL (contents). Attribution is shown wherever
 * results are shown.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const DATA = process.env.DATA_DIR || '/data';
const CACHE_FILE = path.join(DATA, 'food', 'cache.json');
const SEARCH_URL = process.env.OFF_SEARCH_URL || 'https://search.openfoodfacts.org/search';
const PRODUCT_URL = process.env.OFF_PRODUCT_URL || 'https://world.openfoodfacts.org/api/v2/product/';
const VERSION = createRequire(import.meta.url)('../package.json').version;
const CONTACT = process.env.OFF_CONTACT || process.env.ORIGIN || 'self-hosted';
export const USER_AGENT = `openGym/${VERSION} (${CONTACT})`;

const FIELDS = 'code,product_name,product_name_es,product_name_pt,product_name_en,brands,nutriments,serving_quantity,serving_size';
const DAY = 86400000;
const TTL = { search: 7 * DAY, product: 30 * DAY, missing: DAY };
const MAX_CACHE = 4000;
const TIMEOUT_MS = 8000;

/* ---------------- rate limits (below OFF's own: 10 search / 15 product per minute) ---------------- */
export function bucket(perMinute, now = () => Date.now()) {
  let tokens = perMinute, last = now();
  return {
    take() {
      const t = now();
      tokens = Math.min(perMinute, tokens + ((t - last) / 60000) * perMinute);
      last = t;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    }
  };
}
let searchBucket = bucket(8);
let productBucket = bucket(12);

/* ---------------- cache ---------------- */
let cache = null;
let saveTimer = null;
function loadCache() {
  if (cache) return cache;
  try { cache = new Map(Object.entries(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')))); }
  catch { cache = new Map(); }
  return cache;
}
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true, mode: 0o700 });
      const tmp = CACHE_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(cache)), { mode: 0o600 });
      fs.renameSync(tmp, CACHE_FILE);
    } catch (e) { console.error('food cache save', e.message); }
  }, 20000);
  saveTimer.unref?.();
}
function cacheGet(key) {
  const hit = loadCache().get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) { cache.delete(key); return null; }
  // Re-insert so the Map's order doubles as least-recently-used.
  cache.delete(key); cache.set(key, hit);
  return hit;
}
function cachePut(key, value, ttl) {
  const c = loadCache();
  c.set(key, { at: Date.now(), ttl, value });
  while (c.size > MAX_CACHE) c.delete(c.keys().next().value);
  saveSoon();
}

/* ---------------- normalisation ---------------- */
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(+v) ? +v : null);
const r1 = v => Math.round(v * 10) / 10;
const clampNum = (v, hi) => (v == null ? 0 : Math.max(0, Math.min(hi, r1(v))));

/** One OFF product → the app's food shape, or null when it has no usable name or energy. */
export function normalize(p, lang = 'es') {
  if (!p || typeof p !== 'object') return null;
  const n = p.nutriments || {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null) {
    const kj = num(n['energy-kj_100g']) ?? num(n.energy_100g);
    if (kj != null) kcal = kj / 4.184;
  }
  const name = [p['product_name_' + lang], p.product_name, p.product_name_es, p.product_name_pt, p.product_name_en]
    .find(s => typeof s === 'string' && s.trim());
  if (!name || kcal == null || kcal < 0 || kcal > 950) return null;
  const brand = Array.isArray(p.brands) ? p.brands[0] : typeof p.brands === 'string' ? p.brands.split(',')[0] : '';
  const sq = num(p.serving_quantity);
  return {
    src: 'off',
    fid: String(p.code || ''),
    name: name.trim().slice(0, 120),
    brand: String(brand || '').trim().slice(0, 60),
    per100: {
      kcal: clampNum(kcal, 950),
      p: clampNum(num(n.proteins_100g), 100),
      c: clampNum(num(n.carbohydrates_100g), 100),
      f: clampNum(num(n.fat_100g), 100),
      fib: clampNum(num(n.fiber_100g), 100)
    },
    ...(sq && sq > 0 && sq <= 2000 ? { unit: { n: String(p.serving_size || '').trim().slice(0, 40) || null, g: r1(sq) } } : {})
  };
}

/* ---------------- fetching ---------------- */
async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Open Food Facts answered ' + res.status);
  return res.json();
}
const inflight = new Map();
function once(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const LANGS = new Set(['es', 'pt', 'en', 'de', 'fr', 'it', 'pl', 'tr', 'ru', 'zh', 'ko', 'hi']);
export const cleanQuery = q => String(q || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 80);

/**
 * Full-text search. Resolves { items, cached } or { items: [], limited: true } when the
 * shared budget is spent — the client still has its offline table to show.
 */
export async function search(q, lang = 'es', { fetchJSON = getJSON } = {}) {
  const query = cleanQuery(q);
  const l = LANGS.has(lang) ? lang : 'es';
  if (query.length < 2) return { items: [] };
  const key = 's:' + l + ':' + query;
  const hit = cacheGet(key);
  if (hit) return { items: hit.value, cached: true };
  return once(key, async () => {
    if (!searchBucket.take()) return { items: [], limited: true };
    // Spanish and Portuguese names are searched together: students here shop products
    // labelled in either, whichever language the app is in.
    const langs = [...new Set([l, 'es', 'pt'])].join(',');
    const url = SEARCH_URL + '?' + new URLSearchParams({ q: query, langs, page_size: '25', fields: FIELDS });
    const data = await fetchJSON(url);
    const items = (data.hits || []).map(p => normalize(p, l)).filter(Boolean);
    cachePut(key, items, TTL.search);
    return { items };
  });
}

/** Barcode lookup. Resolves { item } (null when OFF does not know it) or { item: null, limited: true }. */
export async function barcode(code, lang = 'es', { fetchJSON = getJSON } = {}) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length < 6 || c.length > 14) return { item: null };
  const l = LANGS.has(lang) ? lang : 'es';
  const key = 'b:' + c;
  const hit = cacheGet(key);
  // A cached product keeps the name it was first seen with: the key has no language, and a
  // product's own label is what people recognise anyway.
  if (hit) return { item: hit.value, cached: true };
  return once(key, async () => {
    if (!productBucket.take()) return { item: null, limited: true };
    const data = await fetchJSON(PRODUCT_URL + encodeURIComponent(c) + '?' + new URLSearchParams({ fields: FIELDS }));
    const item = data.notFound || data.status === 0 ? null : normalize(data.product, l);
    cachePut(key, item, item ? TTL.product : TTL.missing);
    return { item };
  });
}
/** Tests only. */
export function _reset() { cache = new Map(); inflight.clear(); searchBucket = bucket(8); productBucket = bucket(12); }
