// Food search for the diet diary.
//
// Three sources, in the order they answer:
//   · TACO (NEPA/UNICAMP) — ~600 basic foods, bundled, lazy-loaded once, searched offline as
//     you type. Names in Portuguese and Spanish.
//   · Your own foods (S.customFoods) and your trainer's (GET /api/food/trainer).
//   · Open Food Facts — packaged products and barcodes, through this server only
//     (api/food/off.js). Only on an explicit search, never per keystroke: the whole instance
//     shares a budget of a few searches a minute.
//
// A food, whatever its source: { src, fid, name, brand?, per100: { kcal, p, c, f, fib }, unit? }
// where unit = { n: label, g: grams } is a serving the food comes in.

import { api } from './api.js'
import { getLang } from './i18n.js'
import { uid } from './format.js'

let taco = null
let tacoLoading = null

/** Accent- and case-insensitive form used for matching ("Pão" → "pao"). */
export const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%]+/g, ' ').trim()

/** The table, loaded on first use (a separate chunk — most screens never need it). */
export function loadTaco() {
  if (taco) return Promise.resolve(taco)
  if (!tacoLoading) {
    tacoLoading = import('../food/taco.json').then(m => {
      const data = m.default || m
      taco = data.foods.map(([id, pt, es, g, kcal, p, c, f, fib]) => ({
        src: 'taco', fid: id, pt, es, group: data.groups[g] || '',
        per100: { kcal: kcal || 0, p: p || 0, c: c || 0, f: f || 0, fib: fib || 0 },
        _pt: fold(pt), _es: fold(es)
      }))
      return taco
    })
  }
  return tacoLoading
}

/**
 * A food's name in the language of whoever is looking. TACO foods carry both names, so a menu
 * a trainer wrote in Portuguese reads in Spanish on a Spanish-speaking student's phone. Other
 * sources keep their own name. Synchronous: until the table has loaded, the stored name shows.
 */
export function localName(food, lang = getLang()) {
  if (food?.src !== 'taco' || !taco) return food?.name || ''
  const f = taco.find(x => x.fid === food.fid)
  return f ? tacoName(f, lang) : food.name
}
/** The same food with its name localised — what a planned item becomes when it is logged. */
export const localFood = (food, lang) => (food?.src === 'taco' ? { ...food, name: localName(food, lang) } : food)

/** A TACO food named in the language the app is in — Spanish for Spanish, Portuguese otherwise. */
export const tacoName = (food, lang = getLang()) => (lang === 'es' ? food.es : food.pt)
export const asFood = (food, lang) => food.src === 'taco'
  ? { src: 'taco', fid: food.fid, name: tacoName(food, lang), per100: food.per100 }
  : food

function score(words, hay, q) {
  // Every typed word must start a word of the name ("arr int" finds "Arroz, integral").
  const parts = hay.split(' ')
  for (const w of words) if (!parts.some(p => p.startsWith(w))) return -1
  let s = 0
  if (hay.startsWith(q)) s += 4
  if (parts[0].startsWith(words[0])) s += 2
  // Prepared forms first: "cozido/cocido" is what people eat, "cru/crudo" what they buy.
  if (/\b(cozid|cocid|assad|asad|grelhad|plancha|horno)/.test(hay)) s += 0.5
  return s - hay.length / 200
}

/** Offline search over TACO plus extra foods (own, trainer's). Returns foods, best first. */
export async function searchLocal(query, { extra = [], lang = getLang(), limit = 40 } = {}) {
  const q = fold(query)
  if (q.length < 2) return []
  const words = q.split(' ')
  const table = await loadTaco()
  const hits = []
  for (const f of extra) {
    const s = score(words, fold(f.name + ' ' + (f.brand || '')), q)
    if (s >= 0) hits.push([s + 1, f])   // your own and your trainer's foods rank above the table
  }
  for (const f of table) {
    const own = lang === 'es' ? f._es : f._pt
    const other = lang === 'es' ? f._pt : f._es
    const s = Math.max(score(words, own, q), score(words, other, q) - 0.5)
    if (s >= 0) hits.push([s, asFood(f, lang)])
  }
  return hits.sort((a, b) => b[0] - a[0]).slice(0, limit).map(h => h[1])
}

export const searchOnline = (query, lang = getLang()) =>
  api('/api/food/search?q=' + encodeURIComponent(query) + '&lang=' + encodeURIComponent(lang))
export const lookupBarcode = (code, lang = getLang()) =>
  api('/api/food/barcode?code=' + encodeURIComponent(code) + '&lang=' + encodeURIComponent(lang))
export const fetchTrainerFoods = () => api('/api/food/trainer').then(d => d.foods || [])

/** A diary entry for `g` grams of `food` in `meal`. `unit` remembers how it was entered. */
export function toEntry(food, g, meal, unit) {
  return {
    id: uid(), meal, src: food.src, fid: food.fid || '', name: food.name, ...(food.brand ? { brand: food.brand } : {}),
    g: Math.round(g * 10) / 10,
    per100: { ...food.per100 },
    ...(unit ? { unit } : {}),
    at: Date.now()
  }
}

/** The food an entry was made from — for "log again" and editing the amount. */
export const entryFood = e => ({ src: e.src, fid: e.fid, name: e.name, ...(e.brand ? { brand: e.brand } : {}), per100: e.per100, ...(e.unit?.g ? { unit: { n: e.unit.n, g: e.unit.g } } : {}) })

/**
 * Foods from recent days, most often eaten first, with the amount used last time:
 * the fastest way to log what you eat every day.
 */
export function recentFoods(days, limit = 30) {
  const seen = new Map()
  Object.keys(days).sort().forEach(d => (days[d]?.entries || []).forEach(e => {
    if (e.src === 'quick') return
    const key = e.src + ':' + (e.fid || e.name)
    const cur = seen.get(key) || { food: entryFood(e), n: 0, g: e.g, last: d }
    cur.n++; cur.g = e.g; cur.last = d; cur.food = entryFood(e)
    seen.set(key, cur)
  }))
  return [...seen.values()].sort((a, b) => b.n - a.n || (b.last > a.last ? 1 : -1)).slice(0, limit)
}
