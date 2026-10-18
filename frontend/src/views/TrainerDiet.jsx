import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { useTrainer, draftTargets } from '../store/useTrainer.js'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtNum, todayISO, uid, relTime } from '../lib/format.js'
import { ACTIVITY, ACTIVITY_NAME, ACTIVITY_DESC, GOALS, GOAL_NAME, PACES, computeTargets, entryNutrients, sumEntries } from '../lib/nutrition.js'
import { DEFAULT_MEALS, mealName } from '../lib/diet.js'
import { fetchStudents } from '../lib/trainer-api.js'
import { confirmSheet } from '../sheets.jsx'
import { foodPickerSheet, portionSheet, macroLine, MACRO_COLOR } from '../components/DietSheets.jsx'
import { DietSummary } from './Diet.jsx'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, Segmented, SelectRow, TextArea, TextField } from '../components/ui.jsx'

const ui = () => useUI.getState()
const r0 = v => Math.round(v || 0)
// What a menu item keeps of a food: enough to log it and to show it, nothing else.
const slim = f => ({ src: f.src === 'quick' ? 'custom' : f.src, fid: f.fid || '', name: f.name, ...(f.brand ? { brand: f.brand } : {}), per100: f.per100, ...(f.unit?.g ? { unit: f.unit } : {}) })
const itemsTotal = items => sumEntries((items || []).map(it => ({ g: it.g, per100: it.food.per100 })))

/* ---------------- one menu item: amount, alternatives, remove ---------------- */
function ItemSheet({ close, mealId, itemId }) {
  const { dietDraft, editDiet } = useTrainer()
  const item = dietDraft?.meals.find(m => m.id === mealId)?.items.find(i => i.id === itemId)
  if (!item) return null
  const editItem = fn => editDiet(x => { fn(x.meals.find(m => m.id === mealId).items.find(i => i.id === itemId)) })
  return <>
    <h3>{item.food.name}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{fmtNum(item.g)} g · {macroLine(item.food.per100, item.g)}</div>
    <Button icon="pencil" onClick={() => portionSheet({ food: item.food, g: item.g, saveText: t('Save'), onSave: g => editItem(it => { it.g = g }) })}>{t('Change amount')}</Button>
    <h4 className="sec">{t('Alternatives')}</h4>
    <div className="small dim" style={{ margin: '-4px 2px 8px' }}>{t('The student can swap this food for one of these.')}</div>
    {(item.alt || []).length > 0 && <div className="list" style={{ marginBottom: 8 }}>{item.alt.map((a, i) => <div key={i} className="item">
      <div className="grow"><div className="tt">{a.food.name}</div><div className="ss">{fmtNum(a.g)} g · {macroLine(a.food.per100, a.g)}</div></div>
      <button className="iconbtn" style={{ width: 32, height: 30, fontSize: 15, color: 'var(--red)' }} aria-label={t('Remove')} onClick={() => editItem(it => { it.alt.splice(i, 1) })}><Icon name="trash" /></button>
    </div>)}</div>}
    {(item.alt || []).length < 5 && <Button icon="plus" onClick={() => foodPickerSheet({
      title: t('Alternative to {0}', item.food.name),
      onAdd: (food, g) => editItem(it => { (it.alt = it.alt || []).push({ food: slim(food), g }) })
    })}>{t('Add alternative')}</Button>}
    <div style={{ height: 12 }} />
    <Button variant="danger" onClick={() => { close(); editDiet(x => { const m = x.meals.find(y => y.id === mealId); m.items = m.items.filter(i => i.id !== itemId) }) }}>{t('Remove from menu')}</Button>
  </>
}

/* ---------------- what the student actually ate ---------------- */
function DayDetail({ day, meals, unitTargets }) {
  const byMeal = new Map()
  day.entries.forEach(e => { if (!byMeal.has(e.meal)) byMeal.set(e.meal, []); byMeal.get(e.meal).push(e) })
  const named = id => meals.find(m => m.id === id) || DEFAULT_MEALS.find(m => m.id === id)
  return <>
    <h3>{fmtDate(day.d, true)}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{r0(day.tot.kcal)}{unitTargets ? ' / ' + r0(unitTargets.kcal) : ''} kcal · {t('P')} {r0(day.tot.p)} · {t('C')} {r0(day.tot.c)} · {t('F')} {r0(day.tot.f)}</div>
    {[...byMeal.entries()].map(([mid, list]) => <div key={mid} style={{ marginBottom: 12 }}>
      <h4 className="sec">{named(mid) ? mealName(named(mid)) : t('Other')}</h4>
      <div className="list">{list.map(e => <div key={e.id} className="item">
        <div className="grow"><div className="tt">{e.name}</div><div className="ss">{e.src === 'quick' ? t('Quick add') : fmtNum(e.g) + ' g'}{e.planned ? ' · ' + t('as planned') : ''}</div></div>
        <span className="food-k small">{r0(entryNutrients(e).kcal)} kcal</span>
      </div>)}</div>
    </div>)}
    {!day.entries.length && <div className="empty small">{t('Nothing logged on this day.')}</div>}
  </>
}

function DiaryReview({ d }) {
  const meals = d.diet?.meals || []
  const color = s => s === 'ok' ? 'var(--acc)' : s === 'off' ? 'var(--orange)' : s === 'none' ? 'var(--red)' : 'var(--blue)'
  const label = s => s === 'ok' ? t('on target') : s === 'off' ? t('off target') : s === 'none' ? t('not logged') : t('logged')
  const days = (d.diary || []).slice().reverse()
  return <>
    <h4 className="sec">{t('Food diary — last 14 days')}</h4>
    {!d.targets && <div className="small dim" style={{ margin: '-4px 2px 8px' }}>{t('No targets yet — send a diet to measure the days against.')}</div>}
    <div className="list">{days.map(x => <div key={x.d} className="item" onClick={() => ui().openSheet(() => <DayDetail day={x} meals={meals} unitTargets={d.targets} />)}>
      <span style={{ width: 8, height: 34, borderRadius: 4, background: x.d === d.today && x.status === 'none' ? 'var(--surface-3)' : color(x.status), flex: 'none' }} />
      <div className="grow"><div className="tt">{fmtDate(x.d, true)}</div>
        <div className="ss">{x.entries.length ? `${r0(x.tot.kcal)}${d.targets ? ' / ' + r0(d.targets.kcal) : ''} kcal · ${t('P')} ${r0(x.tot.p)} · ${t('C')} ${r0(x.tot.c)} · ${t('F')} ${r0(x.tot.f)}` : t('not logged')}</div></div>
      {x.entries.length > 0 && <span className="tag" style={{ color: color(x.status) }}>{label(x.status)}</span>}
    </div>)}</div>
  </>
}

/* ---------------- the tab ---------------- */
export default function TrainerDietTab({ d }) {
  const toast = useUI(s => s.toast)
  const { dietDraft: x, dietDirty, editDiet, saveDiet, removeDiet, discardDiet, copyDietFrom } = useTrainer()
  const [busy, setBusy] = useState(false)
  const [others, setOthers] = useState([])
  useEffect(() => { fetchStudents().then(r => setOthers(r.students.filter(s => s.id !== d.user.id && s.diet))).catch(() => {}) }, [d.user.id])
  if (!x) return null
  const today = todayISO()
  const calc = x.calc || {}
  const auto = computeTargets(calc, calc.kg, today)
  const targets = draftTargets(x, today)
  const setCalc = patch => editDiet(y => { y.calc = { ...(y.calc || {}), ...patch } })
  const setManual = on => editDiet(y => {
    y.calc = { ...(y.calc || {}), manual: on }
    if (on) y.targets = auto ? { kcal: auto.kcal, p: auto.p, c: auto.c, f: auto.f } : (y.targets || { kcal: 2000, p: 120, c: 220, f: 65 })
  })
  const status = !d.diet ? t('No diet sent yet.')
    : d.diet.ackedVersion >= d.dietVersion ? t('Version {0} is on {1}’s phone (opened {2}).', d.dietVersion, d.user.name, relTime(d.diet.ackedAt))
    : t('Version {0} sent {1} — {2} has not opened the app since.', d.dietVersion, relTime(d.diet.updatedAt), d.user.name)

  const send = async () => {
    setBusy(true)
    try { await saveDiet(today); toast(t('Diet sent to {0}', d.user.name)) } catch (e) { toast(e.message) }
    setBusy(false)
  }
  const addMeal = () => editDiet(y => { y.meals.push({ id: 'm' + uid(), name: t('Meal {0}', y.meals.length + 1), items: [] }) })
  // The same ids as the diary's default meals, so what the student already logged under
  // "Lunch" stays under the trainer's lunch instead of falling into "Other".
  const standardMeals = () => editDiet(y => { y.meals = DEFAULT_MEALS.map(m => ({ id: m.id, name: t(m.key), items: [] })) })
  const addItem = m => foodPickerSheet({
    title: t('Add to {0}', m.name),
    onAdd: (food, g) => editDiet(y => { y.meals.find(z => z.id === m.id).items.push({ id: 'i' + uid(), food: slim(food), g }) })
  })
  const menuTot = sumEntries(x.meals.flatMap(m => m.items.map(it => ({ g: it.g, per100: it.food.per100 }))))

  return <>
    <div className="small muted" style={{ margin: '0 2px 10px' }}>{status}</div>

    <div className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>{t('Daily targets')}</h2>
        <button className="btn plain sm" onClick={() => setManual(!calc.manual)}>{calc.manual ? t('Use calculated') : t('Adjust')}</button></div>
      <div className="small dim" style={{ margin: '4px 0 10px' }}>{d.profile ? t('From {0}’s own data — change anything here; their profile is not touched.', d.user.name) : t('{0} has not filled in their data yet — enter it here.', d.user.name)}</div>
      <Segmented value={calc.sex || 'male'} onChange={v => setCalc({ sex: v })} options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} />
      <div className="row cfgrow" style={{ margin: '10px 0' }}>
        <label className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{t('Date of birth')}</div>
          <input type="date" className="input" value={calc.birth || ''} max={today} onChange={e => setCalc({ birth: e.target.value })} /></label>
      </div>
      <div className="row cfgrow" style={{ marginBottom: 10 }}>
        <label className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{t('Height (cm)')}</div>
          <NumberField className="input" decimal={false} nullable value={calc.heightCm} onChange={v => setCalc({ heightCm: v })} /></label>
        <label className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{t('Weight ({0})', 'kg')}</div>
          <NumberField className="input" nullable value={calc.kg} onChange={v => setCalc({ kg: v })} /></label>
      </div>
      <div className="sect-b" style={{ marginBottom: 10 }}>
        <SelectRow icon="figureRun" iconTint="var(--orange)" title={t('Activity')} value={calc.activity || 'moderate'} onChange={v => setCalc({ activity: v })}
          options={Object.keys(ACTIVITY).map(k => ({ value: k, label: t(ACTIVITY_NAME[k]), subtitle: t(ACTIVITY_DESC[k]) }))} />
        <SelectRow icon="target" iconTint="var(--acc)" title={t('Goal')} value={calc.goal || 'maintain'} onChange={v => setCalc({ goal: v })}
          options={GOALS.map(g => ({ value: g, label: t(GOAL_NAME[g]) }))} />
        {calc.goal !== 'maintain' && <SelectRow icon="chartLine" iconTint="var(--blue)" title={t('Pace')} value={calc.pace || 0.5} onChange={v => setCalc({ pace: v })}
          options={PACES.map(p => ({ value: p, label: t('{0} kg per week', fmtNum(p)) }))} />}
      </div>
      {calc.manual ? <div className="row cfgrow">
        {['kcal', 'p', 'c', 'f'].map(k => <label key={k} className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{k === 'kcal' ? 'kcal' : t({ p: 'Protein (g)', c: 'Carbs (g)', f: 'Fat (g)' }[k])}</div>
          <NumberField className="input" decimal={false} value={x.targets?.[k] || 0} onChange={v => editDiet(y => { y.targets = { ...(y.targets || {}), [k]: v } })} /></label>)}
      </div> : auto ? <>
        <div className="macro-tiles">
          <div><b style={{ color: MACRO_COLOR.kcal }}>{auto.kcal}</b><span>kcal</span></div>
          <div><b style={{ color: MACRO_COLOR.p }}>{auto.p} g</b><span>{t('Protein')}</span></div>
          <div><b style={{ color: MACRO_COLOR.c }}>{auto.c} g</b><span>{t('Carbs')}</span></div>
          <div><b style={{ color: MACRO_COLOR.f }}>{auto.f} g</b><span>{t('Fat')}</span></div>
        </div>
        {auto.why.map(([k, ...a], i) => <div key={i} className="small dim" style={{ marginTop: 3 }}>{t(k, ...a.map(v => typeof v === 'number' ? fmtNum(v) : v))}</div>)}
      </> : <div className="small dim">{t('Fill in sex, date of birth, height and weight to calculate — or tap Adjust and type the targets.')}</div>}
    </div>

    <h4 className="sec">{t('Menu')}</h4>
    {x.meals.length > 0 && <DietSummary tot={menuTot} tgt={targets} menu />}
    {x.meals.map(m => {
      const tot = itemsTotal(m.items)
      return <div key={m.id} className="card">
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          <TextField value={m.name} style={{ flex: 1, fontWeight: 600 }} onChange={e => { const v = e.target.value; editDiet(y => { y.meals.find(z => z.id === m.id).name = v.slice(0, 40) }) }} />
          <input type="time" className="input" style={{ width: 100 }} value={m.time || ''} onChange={e => { const v = e.target.value; editDiet(y => { const z = y.meals.find(q => q.id === m.id); if (v) z.time = v; else delete z.time }) }} />
          <button className="iconbtn" style={{ width: 36, height: 36, fontSize: 16, color: 'var(--red)', flex: 'none' }} aria-label={t('Remove')}
            onClick={() => confirmSheet({ title: t('Remove {0}?', m.name), message: t('The meal and its foods leave the menu.'), confirmText: t('Remove'), danger: true, onConfirm: () => editDiet(y => { y.meals = y.meals.filter(z => z.id !== m.id) }) })}><Icon name="trash" /></button>
        </div>
        {m.items.length > 0 && <div className="list" style={{ marginBottom: 8 }}>{m.items.map(it => <div key={it.id} className="item" onClick={() => ui().openSheet(close => <ItemSheet close={close} mealId={m.id} itemId={it.id} />)}>
          <div className="grow"><div className="tt">{it.food.name}</div>
            <div className="ss">{fmtNum(it.g)} g{it.alt?.length ? ' · ' + t(it.alt.length === 1 ? '{0} alternative' : '{0} alternatives', it.alt.length) : ''}</div></div>
          <span className="food-k small">{r0(entryNutrients({ g: it.g, per100: it.food.per100 }).kcal)} kcal</span>
        </div>)}</div>}
        <div className="row between">
          <Button size="sm" variant="tinted" icon="plus" onClick={() => addItem(m)}>{t('Add food')}</Button>
          <span className="small muted">{r0(tot.kcal)} kcal · {t('P')} {r0(tot.p)} · {t('C')} {r0(tot.c)} · {t('F')} {r0(tot.f)}</span>
        </div>
      </div>
    })}
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <Button size="sm" icon="plus" onClick={addMeal}>{t('Add meal')}</Button>
      {!x.meals.length && <Button size="sm" icon="list" onClick={standardMeals}>{t('Start with 4 meals')}</Button>}
    </div>
    {!x.meals.length && <div className="small dim" style={{ margin: '8px 2px 0' }}>{t('A menu is optional — targets alone already work: the student logs whatever they eat.')}</div>}

    <h4 className="sec">{t('Note for {0}', d.user.name)}</h4>
    <TextArea rows={3} value={x.note} placeholder={t('Shown with the diet on their phone (optional).')} onChange={e => { const v = e.target.value; editDiet(y => { y.note = v.slice(0, 1000) }) }} />

    <div style={{ height: 14 }} />
    <Button variant="primary" icon="upload" disabled={busy || !targets || (!dietDirty && !!d.diet)} onClick={send}>
      {d.diet ? t('Send update to {0}', d.user.name) : t('Send diet to {0}', d.user.name)}</Button>
    {dietDirty && <><div style={{ height: 8 }} /><Button onClick={discardDiet}>{t('Discard changes')}</Button></>}
    {others.length > 0 && <><div style={{ height: 8 }} /><Button icon="clipboard" onClick={() => ui().openSheet(close => <>
      <h3>{t('Copy a diet from')}</h3>
      <div className="list">{others.map(o => <div key={o.id} className="item" onClick={() => { close(); copyDietFrom(o.id).then(ok => toast(ok ? t('Copied — review it, then send.') : t('That student has no diet.'))).catch(e => toast(e.message)) }}>
        <div className="grow"><div className="tt">{o.name}</div></div><Icon name="chevronRight" className="chev" /></div>)}</div>
    </>)}>{t('Copy from another student')}</Button></>}
    {d.diet && <><div style={{ height: 8 }} /><Button variant="danger" onClick={() => confirmSheet({
      title: t('Remove the diet?'), message: t('{0} goes back to their own targets and meals. Their food diary stays.', d.user.name),
      confirmText: t('Remove'), danger: true, onConfirm: () => removeDiet().then(() => toast(t('Diet removed'))).catch(e => toast(e.message))
    })}>{t('Remove diet')}</Button></>}

    <DiaryReview d={d} />
  </>
}
