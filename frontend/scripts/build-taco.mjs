#!/usr/bin/env node
// Builds src/food/taco.json — the food table the diet diary searches offline — from
// scripts/taco/taco-4ed.json (TACO 4ª ed., extracted by scripts/extract-taco.py) and
// scripts/taco/taco-es.txt (the Spanish names, one "number|name" per line).
//
//   node scripts/build-taco.mjs           write it
//   node scripts/build-taco.mjs --check   fail if it is out of date (CI)
//
// Output is compact on purpose (arrays, not objects): it is a lazy-loaded chunk, and every
// student downloads it once.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rows = JSON.parse(readFileSync(join(root, 'scripts/taco/taco-4ed.json'), 'utf8'))
const es = new Map(readFileSync(join(root, 'scripts/taco/taco-es.txt'), 'utf8').split('\n').filter(Boolean)
  .map(l => { const i = l.indexOf('|'); return [+l.slice(0, i), l.slice(i + 1).trim()] }))

const problems = []
for (const r of rows) if (!es.get(r.n)) problems.push(`no Spanish name for TACO ${r.n} (${r.pt})`)
for (const n of es.keys()) if (!rows.some(r => r.n === n)) problems.push(`Spanish name for unknown TACO ${n}`)
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }

const groups = [...new Set(rows.map(r => r.group || ''))]
const r1 = v => (v == null ? null : Math.round(v * 10) / 10)
const out = {
  source: 'TACO – Tabela Brasileira de Composição de Alimentos, 4ª ed. NEPA/UNICAMP, 2011',
  fields: ['id', 'pt', 'es', 'group', 'kcal', 'protein', 'carbs', 'fat', 'fiber'],
  groups,
  foods: rows.map(r => ['t' + r.n, r.pt, es.get(r.n), groups.indexOf(r.group || ''), r1(r.kcal), r1(r.p), r1(r.c), r1(r.f), r1(r.fib)])
}
const text = '{"source":' + JSON.stringify(out.source) + ',"fields":' + JSON.stringify(out.fields) +
  ',"groups":' + JSON.stringify(groups) + ',"foods":[\n' + out.foods.map(f => JSON.stringify(f)).join(',\n') + '\n]}\n'

const target = join(root, 'src/food/taco.json')
if (process.argv.includes('--check')) {
  let cur = ''
  try { cur = readFileSync(target, 'utf8') } catch { /* missing */ }
  if (cur !== text) { console.error('src/food/taco.json is out of date — run node scripts/build-taco.mjs'); process.exit(1) }
  console.log(`taco.json up to date (${out.foods.length} foods)`)
} else {
  writeFileSync(target, text)
  console.log(`${out.foods.length} foods → src/food/taco.json (${Math.round(text.length / 1024)} KB)`)
}
