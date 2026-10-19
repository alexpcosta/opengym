import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useDiet } from '../store/useDiet.js'
import { t } from '../lib/i18n.js'
import { fmtNum, todayISO, uid } from '../lib/format.js'
import { lastBW } from '../lib/history.js'
import {
  ACTIVITY, ACTIVITY_NAME, ACTIVITY_DESC, GOALS, GOAL_NAME, PACES, computeTargets, goalFromWeight, toKg,
  entryNutrients, kcalFromMacros
} from '../lib/nutrition.js'
import { searchLocal, searchOnline, lookupBarcode, fetchTrainerFoods, loadTaco, recentFoods, toEntry } from '../lib/food.js'
import { cameraSupported, scan } from '../lib/barcode.js'
import Icon from './Icon.jsx'
import { Button, NumberField, Segmented, SelectRow, SearchField, TextField } from './ui.jsx'

const ui = () => useUI.getState()
export const MACRO_COLOR = { kcal: 'var(--acc)', p: 'var(--blue)', c: 'var(--orange)', f: 'var(--pink)' }
const r0 = v => Math.round(v || 0)

/** "124 kcal · P 2.6 · C 25.8 · F 1" per 100 g (or for the given grams). */
export function macroLine(per, g = 100) {
  const n = entryNutrients({ g, per100: per })
  return `${r0(n.kcal)} kcal · ${t('P')} ${fmtNum(n.p)} · ${t('C')} ${fmtNum(n.c)} · ${t('F')} ${fmtNum(n.f)}`
}

export const Attribution = () => <div className="small dim" style={{ margin: '14px 2px 4px', lineHeight: 1.4 }}>
  {t('Foods: TACO (NEPA/UNICAMP) and Open Food Facts (ODbL).')}
</div>

/* ============================ body data + targets ============================ */
function ProfileSheet({ close, lockedTargets }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const bw = lastBW(S)
  const [w, setW] = useState(bw ? bw.w : null)
  const kg = w ? toKg(w, S.unit) : 0
  const [p, setP] = useState(() => ({
    sex: S.body === 'female' ? 'female' : 'male', birth: '', heightCm: null, activity: 'moderate',
    goal: goalFromWeight(S.targetW ? toKg(S.targetW, S.unit) : null, kg), pace: 0.5,
    ...(S.profile || {})
  }))
  const set = patch => setP(x => ({ ...x, ...patch }))
  const auto = computeTargets(p, kg, todayISO())
  const [manual, setManual] = useState(() => S.dietTargets && !S.dietTargets.auto ? { ...S.dietTargets } : null)
  const target = manual || auto

  const save = () => {
    update(s => {
      s.profile = { sex: p.sex, birth: p.birth, heightCm: p.heightCm, activity: p.activity, goal: p.goal, pace: p.pace }
      if (w && (!bw || bw.w !== w)) {
        const iso = todayISO()
        const ex = s.bodyweight.find(b => b.d === iso)
        if (ex) { ex.w = w; ex.t = Date.now() } else s.bodyweight.push({ d: iso, w, t: Date.now() })
        s.bodyweight.sort((a, b) => (a.d < b.d ? -1 : 1))
      }
      if (target) s.dietTargets = manual
        ? { kcal: r0(manual.kcal), p: r0(manual.p), c: r0(manual.c), f: r0(manual.f), auto: false }
        : { kcal: auto.kcal, p: auto.p, c: auto.c, f: auto.f, auto: true }
    })
    close()
    ui().toast(t('Targets saved'))
  }

  return <>
    <h3>{t('Your data')}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{t('Used to calculate your calories and macros. Only you and your trainer see it.')}</div>
    <Segmented value={p.sex} onChange={v => set({ sex: v })} options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} />
    <div className="row cfgrow" style={{ margin: '12px 0' }}>
      <label className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{t('Date of birth')}</div>
        <input type="date" className="input" value={p.birth || ''} max={todayISO()} onChange={e => set({ birth: e.target.value })} /></label>
    </div>
    <div className="row cfgrow" style={{ marginBottom: 12 }}>
      <label className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{t('Height (cm)')}</div>
        <NumberField className="input" decimal={false} nullable value={p.heightCm} onChange={v => set({ heightCm: v })} /></label>
      <label className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{t('Weight ({0})', S.unit)}</div>
        <NumberField className="input" nullable value={w} onChange={setW} /></label>
    </div>
    <div className="sect-b" style={{ marginBottom: 12 }}>
      <SelectRow icon="figureRun" iconTint="var(--orange)" title={t('Activity')} value={p.activity} onChange={v => set({ activity: v })}
        options={Object.keys(ACTIVITY).map(k => ({ value: k, label: t(ACTIVITY_NAME[k]), subtitle: t(ACTIVITY_DESC[k]) }))} />
      <SelectRow icon="target" iconTint="var(--acc)" title={t('Goal')} value={p.goal} onChange={v => set({ goal: v })}
        options={GOALS.map(g => ({ value: g, label: t(GOAL_NAME[g]) }))} />
      {p.goal !== 'maintain' && <SelectRow icon="chartLine" iconTint="var(--blue)" title={t('Pace')} value={p.pace} onChange={v => set({ pace: v })}
        options={PACES.map(x => ({ value: x, label: t('{0} kg per week', fmtNum(x)) }))} />}
    </div>

    {lockedTargets ? <div className="card small" style={{ borderColor: 'var(--acc)' }}>{useStore.getState().user?.admin
      ? t('Your targets come from the diet you wrote for yourself under Students → You.')
      : t('Your trainer sets your targets. Your data still helps them adjust it.')}</div>
      : auto ? <div className="card">
        <div className="row between"><h2 style={{ margin: 0 }}>{t('Daily targets')}</h2>
          <button className="btn plain sm" onClick={() => setManual(manual ? null : { kcal: auto.kcal, p: auto.p, c: auto.c, f: auto.f })}>{manual ? t('Use calculated') : t('Adjust')}</button></div>
        {manual ? <div className="row cfgrow" style={{ marginTop: 10 }}>
          {['kcal', 'p', 'c', 'f'].map(k => <label key={k} className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{k === 'kcal' ? 'kcal' : t({ p: 'Protein (g)', c: 'Carbs (g)', f: 'Fat (g)' }[k])}</div>
            <NumberField className="input" decimal={false} value={manual[k]} onChange={v => setManual(m => ({ ...m, [k]: v }))} /></label>)}
        </div> : <>
          <div className="macro-tiles">
            <div><b style={{ color: MACRO_COLOR.kcal }}>{auto.kcal}</b><span>kcal</span></div>
            <div><b style={{ color: MACRO_COLOR.p }}>{auto.p} g</b><span>{t('Protein')}</span></div>
            <div><b style={{ color: MACRO_COLOR.c }}>{auto.c} g</b><span>{t('Carbs')}</span></div>
            <div><b style={{ color: MACRO_COLOR.f }}>{auto.f} g</b><span>{t('Fat')}</span></div>
          </div>
          {auto.why.map(([k, ...a], i) => <div key={i} className="small dim" style={{ marginTop: 3 }}>{t(k, ...a.map(x => typeof x === 'number' ? fmtNum(x) : x))}</div>)}
        </>}
      </div>
      : <div className="small dim" style={{ margin: '4px 2px 12px' }}>{t('Fill in your sex, date of birth, height and weight to see your targets.')}</div>}

    <Button variant="primary" disabled={!lockedTargets && !target} onClick={save}>{t('Save')}</Button>
  </>
}
export const profileSheet = opts => ui().openSheet(close => <ProfileSheet close={close} {...(opts || {})} />)

/* ============================ amount of one food ============================ */
function PortionSheet({ close, food, g, unit, onSave, onDelete, saveText }) {
  const hasUnit = !!food.unit?.g
  const [mode, setMode] = useState(unit?.g && hasUnit ? 'u' : 'g')
  const [qty, setQty] = useState(() => (unit?.g && hasUnit ? unit.q || Math.round((g / food.unit.g) * 100) / 100 : g || (hasUnit ? food.unit.g : 100)))
  const grams = mode === 'u' ? (qty || 0) * food.unit.g : qty || 0
  const n = entryNutrients({ g: grams, per100: food.per100 })
  const switchMode = m => { if (m === mode) return; setQty(m === 'u' ? Math.round((grams / food.unit.g) * 100) / 100 || 1 : Math.round(grams)); setMode(m) }
  const presets = mode === 'u' ? [0.5, 1, 1.5, 2] : [50, 100, 150, 200]
  return <>
    <h3>{food.name}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{food.brand ? food.brand + ' · ' : ''}{t('per 100 g')}: {macroLine(food.per100)}</div>
    {hasUnit && <Segmented value={mode} onChange={switchMode}
      options={[{ value: 'g', label: t('Grams') }, { value: 'u', label: food.unit.n || t('Servings ({0} g)', fmtNum(food.unit.g)) }]} />}
    <div className="row" style={{ gap: 8, margin: '12px 0 8px', alignItems: 'center' }}>
      <NumberField className="input" style={{ fontSize: 22, fontWeight: 600, maxWidth: 140 }} value={qty} onChange={setQty} autoFocus />
      <span className="muted">{mode === 'u' ? t('× {0} g', fmtNum(food.unit.g)) : 'g'}</span>
    </div>
    <div className="chips" style={{ marginBottom: 4 }}>{presets.map(v => <button key={v} className={'chip raw' + (qty === v ? ' on' : '')} onClick={() => setQty(v)}>{fmtNum(v)}{mode === 'g' ? ' g' : ''}</button>)}</div>
    <div className="macro-tiles">
      <div><b style={{ color: MACRO_COLOR.kcal }}>{r0(n.kcal)}</b><span>kcal</span></div>
      <div><b style={{ color: MACRO_COLOR.p }}>{fmtNum(n.p)}</b><span>{t('Protein')}</span></div>
      <div><b style={{ color: MACRO_COLOR.c }}>{fmtNum(n.c)}</b><span>{t('Carbs')}</span></div>
      <div><b style={{ color: MACRO_COLOR.f }}>{fmtNum(n.f)}</b><span>{t('Fat')}</span></div>
    </div>
    <Button variant="primary" disabled={!grams} onClick={() => { close(); onSave(grams, mode === 'u' ? { n: food.unit.n || null, g: food.unit.g, q: qty } : undefined) }}>{saveText || t('Add')}</Button>
    {onDelete && <><div style={{ height: 8 }} /><Button variant="danger" onClick={() => { close(); onDelete() }}>{t('Remove')}</Button></>}
  </>
}
export const portionSheet = opts => ui().openSheet(close => <PortionSheet close={close} {...opts} />)

/* ============================ quick add (calories only) ============================ */
function QuickAdd({ close, onSave }) {
  const [v, setV] = useState({ name: '', kcal: null, p: null, c: null, f: null })
  const set = patch => setV(x => ({ ...x, ...patch }))
  const kcal = v.kcal ?? kcalFromMacros({ p: v.p || 0, c: v.c || 0, f: v.f || 0 })
  return <>
    <h3>{t('Quick add')}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{t('For a meal you can’t look up — just the numbers.')}</div>
    <TextField placeholder={t('What was it? (optional)')} value={v.name} onChange={e => set({ name: e.target.value })} />
    <div className="row cfgrow" style={{ marginTop: 10 }}>
      <label className="grow"><div className="small dim" style={{ marginBottom: 4 }}>kcal</div><NumberField className="input" decimal={false} nullable value={v.kcal} placeholder={String(kcal || '')} onChange={x => set({ kcal: x })} /></label>
      <label className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{t('Protein (g)')}</div><NumberField className="input" nullable value={v.p} onChange={x => set({ p: x })} /></label>
      <label className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{t('Carbs (g)')}</div><NumberField className="input" nullable value={v.c} onChange={x => set({ c: x })} /></label>
      <label className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{t('Fat (g)')}</div><NumberField className="input" nullable value={v.f} onChange={x => set({ f: x })} /></label>
    </div>
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={!kcal} onClick={() => { close(); onSave({ src: 'quick', fid: '', name: v.name.trim() || t('Quick add'), per100: { kcal, p: v.p || 0, c: v.c || 0, f: v.f || 0, fib: 0 } }) }}>{t('Add')}</Button>
  </>
}

/* ============================ a food of your own ============================ */
function CustomFood({ close, prefill, onDone }) {
  const update = useStore(s => s.update)
  const [v, setV] = useState({ name: prefill?.name || '', kcal: null, p: null, c: null, f: null, fib: null, unitName: '', unitG: null })
  const set = patch => setV(x => ({ ...x, ...patch }))
  const kcal = v.kcal ?? kcalFromMacros({ p: v.p || 0, c: v.c || 0, f: v.f || 0 })
  const save = () => {
    const food = {
      id: 'cf' + uid(), name: v.name.trim(), per100: { kcal, p: v.p || 0, c: v.c || 0, f: v.f || 0, fib: v.fib || 0 },
      ...(v.unitG ? { unit: { n: v.unitName.trim() || null, g: v.unitG } } : {}),
      ...(prefill?.barcode ? { barcode: prefill.barcode } : {})
    }
    update(s => { (s.customFoods = s.customFoods || []).push(food) })
    close()
    onDone?.({ src: 'custom', fid: food.id, name: food.name, per100: food.per100, ...(food.unit ? { unit: food.unit } : {}) })
  }
  const field = (k, label, decimal = true) => <label className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{label}</div>
    <NumberField className="input" decimal={decimal} nullable value={v[k]} onChange={x => set({ [k]: x })} placeholder={k === 'kcal' && kcal ? String(kcal) : ''} /></label>
  return <>
    <h3>{t('New food')}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{t('Copy the values per 100 g from the label.')}{prefill?.barcode ? ' · ' + t('Barcode {0}', prefill.barcode) : ''}</div>
    <TextField placeholder={t('Name')} value={v.name} onChange={e => set({ name: e.target.value })} />
    <div className="row cfgrow" style={{ marginTop: 10 }}>{field('kcal', 'kcal', false)}{field('p', t('Protein (g)'))}{field('c', t('Carbs (g)'))}{field('f', t('Fat (g)'))}</div>
    <div className="row cfgrow" style={{ marginTop: 10 }}>
      <label className="grow" style={{ flex: 2 }}><div className="small dim" style={{ marginBottom: 4 }}>{t('Serving (optional)')}</div>
        <TextField placeholder={t('e.g. 1 slice')} value={v.unitName} onChange={e => set({ unitName: e.target.value })} /></label>
      {field('unitG', t('grams'))}
    </div>
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={!v.name.trim() || !kcal} onClick={save}>{t('Save food')}</Button>
  </>
}
export const customFoodSheet = opts => ui().openSheet(close => <CustomFood close={close} {...(opts || {})} />)

/* ============================ barcode ============================ */
function BarcodeSheet({ close, onFood }) {
  const S = useStore(s => s.S)
  const video = useRef(null)
  const stopRef = useRef(null)
  const [state, setState] = useState('idle')   // idle | camera | looking | missing | error
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => () => stopRef.current?.(), [])

  const look = async c => {
    const clean = String(c).replace(/\D/g, '')
    if (clean.length < 6) return
    setCode(clean); setState('looking')
    const own = (S.customFoods || []).find(f => f.barcode === clean)
    if (own) { close(); onFood({ src: 'custom', fid: own.id, name: own.name, per100: own.per100, ...(own.unit ? { unit: own.unit } : {}) }); return }
    try {
      const r = await lookupBarcode(clean)
      if (r.item) { close(); onFood(r.item); return }
      setMsg(r.limited ? t('The food database is busy — try again in a minute.') : t('This product isn’t in the database yet.'))
      setState('missing')
    } catch (e) { setMsg(e.message); setState('error') }
  }
  const start = async () => {
    try {
      setState('camera')
      stopRef.current = await scan(video.current, c => { stopRef.current = null; look(c) })
    } catch (e) { setMsg(t('The camera could not be opened — type the numbers under the barcode instead.')); setState('error') }
  }

  return <>
    <h3>{t('Scan a barcode')}</h3>
    <div className="scanbox" style={{ display: state === 'camera' ? 'block' : 'none' }}><video ref={video} muted playsInline /></div>
    {state !== 'camera' && cameraSupported() && <Button variant="primary" icon="target" onClick={start}>{t('Open camera')}</Button>}
    {state === 'looking' && <div className="small muted" style={{ margin: '10px 2px' }}>{t('Looking up {0}…', code)}</div>}
    {(state === 'missing' || state === 'error') && <div className="small" style={{ margin: '10px 2px', color: state === 'error' ? 'var(--red)' : 'var(--label-2)' }}>{msg}</div>}
    {state === 'missing' && <Button icon="plus" onClick={() => { close(); customFoodSheet({ prefill: { barcode: code }, onDone: onFood }) }}>{t('Create it from the label')}</Button>}
    <div className="row" style={{ gap: 8, marginTop: 12 }}>
      <input className="input" inputMode="numeric" placeholder={t('Barcode number')} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
        onKeyDown={e => { if (e.key === 'Enter') look(code) }} />
      <Button size="sm" style={{ whiteSpace: 'nowrap', flex: 'none' }} onClick={() => look(code)} disabled={code.length < 6}>{t('Look up')}</Button>
    </div>
    <Attribution />
  </>
}
export const barcodeSheet = onFood => ui().openSheet(close => <BarcodeSheet close={close} onFood={onFood} />)

/* ============================ find a food ============================ */
function FoodRow({ food, sub, onClick }) {
  return <div className="item" onClick={onClick}>
    <div className="grow"><div className="tt">{food.name}</div>
      <div className="ss">{sub || ((food.brand ? food.brand + ' · ' : '') + macroLine(food.per100))}</div></div>
    <Icon name="plus" className="chev" />
  </div>
}

function FoodSearch({ close, title, onPick }) {
  const S = useStore(s => s.S)
  const days = useDiet(s => s.days)
  const [q, setQ] = useState('')
  const [local, setLocal] = useState([])
  const [online, setOnline] = useState(null)      // null | { busy } | { items, limited, error }
  const [trainerFoods, setTrainerFoods] = useState([])
  useEffect(() => { loadTaco(); fetchTrainerFoods().then(setTrainerFoods).catch(() => {}) }, [])

  const asFoodOwn = f => ({ src: 'custom', fid: f.id, name: f.name, per100: f.per100, ...(f.unit ? { unit: f.unit } : {}) })
  const asFoodTrainer = f => ({ src: 'trainer', fid: f.id, name: f.name, ...(f.brand ? { brand: f.brand } : {}), per100: f.per100, ...(f.unit ? { unit: f.unit } : {}) })
  const extra = useMemo(() => [...(S.customFoods || []).map(asFoodOwn), ...trainerFoods.map(asFoodTrainer)], [S.customFoods, trainerFoods])
  useEffect(() => {
    let alive = true
    setOnline(null)
    searchLocal(q, { extra }).then(r => { if (alive) setLocal(r) })
    return () => { alive = false }
  }, [q, extra])
  const recent = useMemo(() => recentFoods(days, 20), [days])

  const goOnline = async () => {
    if (q.trim().length < 2) return
    setOnline({ busy: true })
    try { setOnline(await searchOnline(q.trim())) }
    catch (e) { setOnline({ items: [], error: e.message }) }
  }
  const pick = (food, g) => onPick(food, g)

  return <>
    <h3>{title}</h3>
    <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder={t('Search foods')}
      onKeyDown={e => { if (e.key === 'Enter') goOnline() }} autoFocus />
    <div className="chips" style={{ margin: '10px 0' }}>
      <button className="chip raw" onClick={() => barcodeSheet(food => pick(food))}><Icon name="target" /> {t('Barcode')}</button>
      <button className="chip raw" onClick={() => ui().openSheet(c => <QuickAdd close={c} onSave={food => onPick(food, 100, true)} />)}><Icon name="bolt" /> {t('Quick add')}</button>
      <button className="chip raw" onClick={() => customFoodSheet({ prefill: { name: q }, onDone: food => pick(food) })}><Icon name="pencil" /> {t('New food')}</button>
    </div>

    {!q.trim() ? <>
      {recent.length > 0 && <><h4 className="sec">{t('Recent')}</h4>
        <div className="list">{recent.map(r => <FoodRow key={r.food.src + r.food.fid + r.food.name} food={r.food} sub={fmtNum(r.g) + ' g · ' + macroLine(r.food.per100, r.g)} onClick={() => pick(r.food, r.g)} />)}</div></>}
      {trainerFoods.length > 0 && <><h4 className="sec">{t('From your trainer')}</h4>
        <div className="list">{trainerFoods.map(f => <FoodRow key={f.id} food={asFoodTrainer(f)} onClick={() => pick(asFoodTrainer(f))} />)}</div></>}
      {!recent.length && !trainerFoods.length && <div className="empty small">{t('Type a food — rice, banana, chicken breast… or scan a packet.')}</div>}
    </> : <>
      {local.length > 0 ? <div className="list">{local.map(f => <FoodRow key={f.src + f.fid} food={f} onClick={() => pick(f)} />)}</div>
        : <div className="small dim" style={{ margin: '4px 2px 10px' }}>{t('Nothing in the basic table.')}</div>}
      <div style={{ height: 10 }} />
      {online?.items ? <>
        <h4 className="sec">Open Food Facts</h4>
        {online.limited && <div className="small" style={{ color: 'var(--orange)', marginBottom: 8 }}>{t('The food database is busy — try again in a minute.')}</div>}
        {online.error && <div className="small" style={{ color: 'var(--red)', marginBottom: 8 }}>{online.error}</div>}
        {online.items.length ? <div className="list">{online.items.map(f => <FoodRow key={f.fid} food={f} onClick={() => pick(f)} />)}</div>
          : !online.limited && !online.error && <div className="small dim">{t('No products found.')}</div>}
      </> : <Button icon="globe" disabled={online?.busy} onClick={goOnline}>{online?.busy ? t('Searching…') : t('Search packaged foods for “{0}”', q.trim())}</Button>}
    </>}
    <Attribution />
  </>
}

/**
 * Pick a food and an amount, then onAdd(entryFields) with { food, g, unit }.
 * Quick-add foods skip the amount: their numbers are already the whole portion.
 */
export function foodPickerSheet({ title, onAdd }) {
  const h = ui().openSheet(close => <FoodSearch close={close} title={title} onPick={(food, g, whole) => {
    if (whole) { onAdd(food, 100); return }
    portionSheet({ food, g: g || food.unit?.g || 100, onSave: (grams, unit) => onAdd(food, grams, unit) })
  }} />)
  return h
}

export { toEntry }
