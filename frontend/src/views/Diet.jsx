import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { macroLine } from '../components/DietSheets.jsx'
import { useDiet, isoAdd } from '../store/useDiet.js'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtNum, todayISO, uid } from '../lib/format.js'
import { lastBW } from '../lib/history.js'
import { sumEntries, toKg, entryNutrients } from '../lib/nutrition.js'
import { toEntry, entryFood, loadTaco, localFood } from '../lib/food.js'
import { mealsOf, mealName, targetsOf } from '../lib/diet.js'
import { dietLocked, markDietSeen } from '../lib/trainer.js'
import { confirmSheet } from '../sheets.jsx'
import { profileSheet, portionSheet, foodPickerSheet, MACRO_COLOR, Attribution } from '../components/DietSheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

const r0 = v => Math.round(v || 0)

function Bar({ label, value, target, color }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0
  const over = target && value > target * 1.1
  return <div className="mbar">
    <div className="l"><span>{label}</span><span><b>{r0(value)}</b>{target ? ' / ' + r0(target) : ''} g</span></div>
    <div className="t"><i style={{ width: pct + '%', background: over ? 'var(--red)' : color }} /></div>
  </div>
}

/** Calories left and the three macros against today's targets. Used on Diet and on Home. */
// `menu`: the totals are a trainer's planned menu, not food eaten — the ring shows the menu's
// calories and the line says how they compare to the target.
export function DietSummary({ tot, tgt, onClick, menu }) {
  const left = tgt ? tgt.kcal - tot.kcal : null
  const v = tgt ? Math.min(1, tot.kcal / tgt.kcal) : 0
  const over = left != null && left < 0
  return <div className={'card' + (onClick ? ' tappable' : '')} onClick={onClick} style={onClick ? { cursor: 'pointer' } : null}>
    <div className="dsum">
      <div className="dring" style={{ '--v': v, '--ring': over ? 'var(--red)' : 'var(--acc)' }}>
        <div><b>{menu || left == null ? r0(tot.kcal) : r0(Math.abs(left))}</b>
          <span>{menu ? t('kcal in menu') : left == null ? 'kcal' : over ? t('kcal over') : t('kcal left')}</span></div>
      </div>
      <div className="mbars">
        <Bar label={t('Protein')} value={tot.p} target={tgt?.p} color={MACRO_COLOR.p} />
        <Bar label={t('Carbs')} value={tot.c} target={tgt?.c} color={MACRO_COLOR.c} />
        <Bar label={t('Fat')} value={tot.f} target={tgt?.f} color={MACRO_COLOR.f} />
      </div>
    </div>
    <div className="small dim" style={{ marginTop: 10 }}>
      {menu ? (tgt ? t('The menu has {0} of the {1} kcal target.', r0(tot.kcal), r0(tgt.kcal)) : t('Set the targets to compare the menu with them.'))
        : tgt ? t('{0} of {1} kcal eaten', r0(tot.kcal), r0(tgt.kcal)) + (tgt.by === 'trainer' ? ' · ' + t('targets from your trainer') : '')
        : t('{0} kcal eaten — set your targets to see what is left.', r0(tot.kcal))}
    </div>
  </div>
}

export default function Diet() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const days = useDiet(s => s.days)
  const pull = useDiet(s => s.pull)
  const edit = useDiet(s => s.edit)
  const today = todayISO()
  const [date, setDate] = useState(today)
  useEffect(() => { pull(isoAdd(date, -14), isoAdd(date, 1)) }, [date])
  // The trainer's menu names TACO foods in their language; once the table is here they read in ours.
  const [, setTaco] = useState(false)
  useEffect(() => { if (S.diet?.meals?.length) loadTaco().then(() => setTaco(true)) }, [!!S.diet?.meals?.length])

  const bw = lastBW(S)
  const kg = bw ? toKg(bw.w, S.unit) : 0
  const tgt = targetsOf(S, kg, today)
  // Calculated targets follow the body weight; the stored copy is what the trainer's daily
  // checks on the server read, so keep it in step.
  useEffect(() => {
    if (S.dietTargets?.auto && tgt?.auto && (tgt.kcal !== S.dietTargets.kcal || tgt.p !== S.dietTargets.p || tgt.c !== S.dietTargets.c || tgt.f !== S.dietTargets.f)) {
      update(s => { s.dietTargets = { kcal: tgt.kcal, p: tgt.p, c: tgt.c, f: tgt.f, auto: true } })
    }
  }, [tgt?.kcal, tgt?.p, tgt?.c, tgt?.f])

  const day = days[date] || { entries: [] }
  const tot = sumEntries(day.entries)
  const meals = mealsOf(S)
  const known = new Set(meals.map(m => m.id))
  const orphans = day.entries.filter(e => !known.has(e.meal))

  const add = meal => foodPickerSheet({
    title: t('Add to {0}', mealName(meal)),
    onAdd: (food, g, unit) => { edit(date, d => { d.entries.push(toEntry(food, g, meal.id, unit)) }); toast(t('Added to {0}', mealName(meal))) }
  })
  const editEntry = e => portionSheet({
    food: entryFood(e), g: e.g, unit: e.unit, saveText: t('Save'),
    onSave: (g, unit) => edit(date, d => { const x = d.entries.find(y => y.id === e.id); if (x) { x.g = g; if (unit) x.unit = unit; else delete x.unit } }),
    onDelete: () => edit(date, d => { d.entries = d.entries.filter(y => y.id !== e.id) })
  })
  const prev = days[isoAdd(date, -1)]
  const copyPrev = () => confirmSheet({
    title: t('Copy the previous day?'), message: t('Adds the {0} foods from {1} to this day.', prev.entries.length, fmtDate(isoAdd(date, -1), true)),
    confirmText: t('Copy'),
    onConfirm: () => edit(date, d => { prev.entries.forEach(e => d.entries.push({ ...JSON.parse(JSON.stringify(e)), id: uid(), at: Date.now() })) })
  })
  const label = date === today ? t('Today') : date === isoAdd(today, -1) ? t('Yesterday') : fmtDate(date, true)

  // The trainer's menu: each planned item can be eaten as written, swapped for one of its
  // alternatives, or skipped. Logged entries remember which item they were (`planned`).
  const done = new Set(day.entries.map(e => e.planned).filter(Boolean))
  const logPlanned = (meal, item, food = item.food, g = item.g) => edit(date, d => {
    d.entries.push({ ...toEntry(localFood(food), g, meal.id), planned: item.id })
  })
  const choosePlanned = (meal, item) => useUI.getState().openSheet(close => <>
    <h3>{localFood(item.food).name}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{t('Planned by your trainer. Pick what you actually ate — the amount can be changed next.')}</div>
    <div className="list">{[{ food: item.food, g: item.g }, ...(item.alt || [])].map((o, i) => <div key={i} className="item" onClick={() => {
      close()
      const food = localFood(o.food)
      portionSheet({ food, g: o.g, onSave: (g, unit) => edit(date, d => { d.entries.push({ ...toEntry(food, g, meal.id, unit), planned: item.id }) }) })
    }}>
      <div className="grow"><div className="tt">{i ? t('or') + ' ' : ''}{localFood(o.food).name}</div><div className="ss">{fmtNum(o.g)} g · {macroLine(o.food.per100, o.g)}</div></div>
      <Icon name="plus" className="chev" />
    </div>)}</div>
  </>)
  const ateAsPlanned = meal => edit(date, d => {
    (meal.items || []).forEach(it => { if (!done.has(it.id)) d.entries.push({ ...toEntry(localFood(it.food), it.g, meal.id), planned: it.id }) })
  })

  const EntryRow = ({ e }) => {
    const n = entryNutrients(e)
    return <div className="item" onClick={() => editEntry(e)}>
      <div className="grow"><div className="tt">{e.name}</div>
        <div className="ss">{e.src === 'quick' ? t('Quick add') : (e.unit?.q ? fmtNum(e.unit.q) + ' × ' + (e.unit.n || fmtNum(e.unit.g) + ' g') + ' · ' : '') + (e.src === 'quick' ? '' : fmtNum(e.g) + ' g')}
          {' · '}{t('P')} {fmtNum(n.p)} · {t('C')} {fmtNum(n.c)} · {t('F')} {fmtNum(n.f)}</div></div>
      <span className="food-k small">{r0(n.kcal)} kcal</span>
    </div>
  }

  return <div className="narrow">
    <div className="hdr">
      <div style={{ minWidth: 0 }}><h1>{t('Diet')}</h1><div className="sub">{label}</div></div>
      <div className="row" style={{ gap: 6 }}>
        <button className="iconbtn" onClick={() => setDate(isoAdd(date, -1))} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
        <button className="iconbtn" onClick={() => setDate(isoAdd(date, 1))} disabled={date >= today} aria-label={t('Next day')} style={date >= today ? { opacity: .35 } : null}><Icon name="chevronRight" /></button>
        <button className="iconbtn" onClick={() => profileSheet({ lockedTargets: !!S.diet?.targets?.kcal })} aria-label={t('Your data')}><Icon name="gear" /></button>
      </div>
    </div>

    {dietLocked(S) && <div className="card row" style={{ gap: 10, borderColor: 'var(--acc)' }} onClick={() => update(s => { markDietSeen(s) })}>
      <span className="lrow-i" style={{ background: 'var(--acc)' }}><Icon name="clipboard" /></span>
      <div style={{ minWidth: 0 }}>
        <div className="small" style={{ fontWeight: 600 }}>{t('Diet from {0}', S.diet.by || t('your trainer'))}</div>
        {S.diet.note ? <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{S.diet.note}</div>
          : <div className="small muted">{t('Your trainer sets your targets and menu.')}</div>}
      </div>
    </div>}

    {!tgt && <div className="card" style={{ borderColor: 'var(--acc)' }}>
      <div className="row" style={{ gap: 10, marginBottom: 6 }}>
        <span className="lrow-i"><Icon name="target" /></span>
        <div style={{ fontSize: 19, fontWeight: 600 }}>{t('Set up your diet')}</div>
      </div>
      <div className="muted small" style={{ marginBottom: 12 }}>{t('Tell us a little about you and your goal — we work out how many calories, protein, carbs and fat a day you need.')}</div>
      <Button variant="primary" icon="sparkles" onClick={() => profileSheet()}>{t('Calculate my targets')}</Button>
    </div>}

    <DietSummary tot={tot} tgt={tgt} />
    {date !== today && <Button size="sm" onClick={() => setDate(today)}>{t('Back to today')}</Button>}

    {meals.map(m => {
      const list = day.entries.filter(e => e.meal === m.id)
      const kcal = sumEntries(list).kcal
      return <div key={m.id}>
        <div className="meal-h"><h4 className="sec">{mealName(m)}{m.time ? ' · ' + m.time : ''}</h4><span className="small muted food-k">{r0(kcal)} kcal</span></div>
        {(m.items || []).length > 0 && <div className="list" style={{ marginBottom: 8 }}>{m.items.filter(it => !done.has(it.id)).map(it =>
          <div key={it.id} className="item planned" onClick={() => choosePlanned(m, it)}>
            <div className="grow"><div className="tt">{localFood(it.food).name}</div>
              <div className="ss">{t('planned')} · {fmtNum(it.g)} g{it.alt?.length ? ' · ' + t(it.alt.length === 1 ? '{0} alternative' : '{0} alternatives', it.alt.length) : ''}</div></div>
            <span className="food-k small">{r0(entryNutrients({ g: it.g, per100: it.food.per100 }).kcal)} kcal</span>
            <button className="iconbtn" style={{ width: 34, height: 34, fontSize: 16, color: 'var(--acc)' }} aria-label={t('Eaten')}
              onClick={ev => { ev.stopPropagation(); logPlanned(m, it) }}><Icon name="check" /></button>
          </div>)}</div>}
        {list.length > 0 && <div className="list" style={{ marginBottom: 8 }}>{list.map(e => <EntryRow key={e.id} e={e} />)}</div>}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" variant="tinted" icon="plus" onClick={() => add(m)}>{t('Add food')}</Button>
          {(m.items || []).some(it => !done.has(it.id)) && <Button size="sm" icon="check" onClick={() => ateAsPlanned(m)}>{t('Ate as planned')}</Button>}
        </div>
      </div>
    })}
    {orphans.length > 0 && <>
      <div className="meal-h"><h4 className="sec">{t('Other')}</h4><span className="small muted food-k">{r0(sumEntries(orphans).kcal)} kcal</span></div>
      <div className="list">{orphans.map(e => <EntryRow key={e.id} e={e} />)}</div>
    </>}

    {!day.entries.length && prev?.entries?.length > 0 && <><div style={{ height: 18 }} />
      <Button icon="clipboard" onClick={copyPrev}>{t('Copy the previous day')}</Button></>}
    <Attribution />
    <div style={{ height: 30 }} />
  </div>
}
