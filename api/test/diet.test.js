import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from './helpers.mjs';

tempData();
const off = await import('../food/off.js');
const diary = await import('../diet/store.js');
const { cleanEntry, cleanDay, totals } = await import('../diet/entries.js');

/* ---------------- Open Food Facts normalisation ---------------- */

test('a product becomes a food with nutrients per 100 g and its serving', () => {
  const f = off.normalize({
    code: '7790387110234', product_name: 'Yerba Mate', product_name_es: 'Yerba mate Taragüi', brands: ['Taragüi', 'Las Marías'],
    nutriments: { 'energy-kcal_100g': 343.4, proteins_100g: 11, carbohydrates_100g: 68.4, fat_100g: 4.3, fiber_100g: '12' },
    serving_quantity: 25, serving_size: '1 cebada (25 g)'
  }, 'es');
  assert.equal(f.name, 'Yerba mate Taragüi');
  assert.equal(f.brand, 'Taragüi');
  assert.deepEqual(f.per100, { kcal: 343.4, p: 11, c: 68.4, f: 4.3, fib: 12 });
  assert.deepEqual(f.unit, { n: '1 cebada (25 g)', g: 25 });
});

test('energy falls back to kJ, and a product without energy or name is dropped', () => {
  assert.equal(off.normalize({ code: '1', product_name: 'X', nutriments: { 'energy-kj_100g': 418.4 } }).per100.kcal, 100);
  assert.equal(off.normalize({ code: '1', product_name: 'X', nutriments: {} }), null);
  assert.equal(off.normalize({ code: '1', nutriments: { 'energy-kcal_100g': 50 } }), null);
  assert.equal(off.normalize({ code: '1', product_name_pt: 'Leite', nutriments: { 'energy-kcal_100g': 61 } }, 'es').name, 'Leite');
});

test('search is cached, deduplicated by query, and stops when the shared budget is spent', async () => {
  off._reset();
  let calls = 0;
  const fetchJSON = async url => { calls++; assert.match(url, /langs=es%2Cpt/); return { hits: [{ code: '1', product_name: 'Leche', nutriments: { 'energy-kcal_100g': 61 } }] }; };
  const a = await off.search('  Leche   ENTERA ', 'es', { fetchJSON });
  const b = await off.search('leche entera', 'es', { fetchJSON });
  assert.equal(a.items.length, 1);
  assert.equal(b.cached, true);
  assert.equal(calls, 1);
  let limited = null;
  for (let i = 0; i < 12 && !limited; i++) {
    const r = await off.search('q' + i, 'es', { fetchJSON });
    if (r.limited) limited = r;
  }
  assert.ok(limited, 'the bucket runs dry before OFF\'s own limit');
  assert.deepEqual(limited.items, []);
});

test('an unknown barcode is cached as missing; a non-barcode is not looked up', async () => {
  off._reset();
  let calls = 0;
  const fetchJSON = async () => { calls++; return { status: 0 }; };
  assert.equal((await off.barcode('7840050000123', 'es', { fetchJSON })).item, null);
  assert.equal((await off.barcode('7840050000123', 'es', { fetchJSON })).cached, true);
  assert.equal((await off.barcode('abc', 'es', { fetchJSON })).item, null);
  assert.equal(calls, 1);
});

/* ---------------- diary entries ---------------- */

const entry = over => ({ id: 'e1', meal: 'm1', src: 'taco', fid: 't1', name: 'Arroz, integral, cozido', g: 150, per100: { kcal: 124, p: 2.6, c: 25.8, f: 1, fib: 2.7 }, at: 1, ...over });

test('entries are bounded and totals scale by grams', () => {
  const e = cleanEntry(entry({ g: 99999, src: 'bogus', per100: { kcal: -5, p: 'x' } }));
  assert.equal(e.g, 5000);
  assert.equal(e.src, 'custom');
  assert.equal(e.per100.kcal, 0);
  assert.equal(cleanEntry({ id: 'x' }), null);
  const t = totals([entry(), entry({ id: 'e2', g: 50 })]);
  assert.deepEqual(t, { kcal: 248, p: 5.2, c: 51.6, f: 2, fib: 5.4 });
});

test('a day keeps the newest version; an older device cannot overwrite it', () => {
  const uid = 'stuA';
  assert.equal(diary.writeDay(uid, '2026-10-18', cleanDay({ entries: [entry()], _ts: 200 })).ok, true);
  const stale = diary.writeDay(uid, '2026-10-18', cleanDay({ entries: [], _ts: 100 }));
  assert.equal(stale.ok, false);
  assert.equal(stale.day.entries.length, 1);
  assert.equal(diary.writeDay(uid, '2026-10-31', cleanDay({ entries: [entry()], _ts: 1 })).ok, true);
  assert.equal(diary.writeDay(uid, '2026-11-01', cleanDay({ entries: [entry()], _ts: 1 })).ok, true);
  assert.deepEqual(Object.keys(diary.readDays(uid, '2026-10-01', '2026-11-30')).sort(), ['2026-10-18', '2026-10-31', '2026-11-01']);
  // Emptying a day removes it rather than storing an empty shell.
  diary.writeDay(uid, '2026-11-01', cleanDay({ entries: [], _ts: 5 }));
  assert.equal(diary.readDay(uid, '2026-11-01'), null);
});
