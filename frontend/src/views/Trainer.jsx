import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate, relTime } from '../lib/format.js'
import { fetchStudents, fetchEvents, markEventsRead, fetchPrefs, savePrefs, fetchTrainerFoodsAdmin, saveTrainerFood, deleteTrainerFood } from '../lib/trainer-api.js'
import { kcalFromMacros } from '../lib/nutrition.js'
import { macroLine } from '../components/DietSheets.jsx'
import Icon from '../components/Icon.jsx'
import TrainerEvent from '../components/TrainerEvent.jsx'
import { Section, Row, Switch, Button, NumberField, TextField } from '../components/ui.jsx'

// Trainer mode home: what the students did lately, and who they are. Admin-only (the route is
// guarded in App.jsx and every endpoint again on the server).

function PrefsSheet({ close }) {
  const toast = useUI(s => s.toast)
  const [d, setD] = useState(null)
  useEffect(() => { fetchPrefs().then(setD).catch(e => toast(e.message)) }, [])
  if (!d) return <div className="muted small">{t('Loading…')}</div>
  const setPref = (k, v) => setD(x => ({ ...x, prefs: { ...x.prefs, [k]: v } }))
  const setTime = (k, v) => setD(x => ({ ...x, times: { ...x.times, [k]: v } }))
  const save = () => savePrefs(d.prefs, d.times).then(() => { toast(t('Saved')); close() }).catch(e => toast(e.message))
  const time = k => <input type="time" className="input" style={{ width: 110 }} value={d.times[k]} onChange={e => setTime(k, e.target.value)} />
  return <>
    <h3>{t('Notifications')}</h3>
    <Section title={t('Workouts')}>
      <Row icon="checkCircle" iconTint="var(--green)" title={t('Workout finished')}><Switch checked={d.prefs.done} onChange={v => setPref('done', v)} /></Row>
      <Row icon="trophy" iconTint="var(--yellow)" title={t('New record (PR)')}><Switch checked={d.prefs.pr} onChange={v => setPref('pr', v)} /></Row>
      <Row icon="xmark" iconTint="var(--red)" title={t('Planned workout skipped')}><Switch checked={d.prefs.missed} onChange={v => setPref('missed', v)} /></Row>
      <Row icon="clock" iconTint="var(--grey)" title={t('Check skipped workouts at')} subtitle={t('In each student’s own time zone.')}>{time('missedAt')}</Row>
    </Section>
    <Section title={t('Diet')}>
      <Row icon="clipboard" iconTint="var(--orange)" title={t('No food logged')}><Switch checked={d.prefs.dietMissing} onChange={v => setPref('dietMissing', v)} /></Row>
      <Row icon="target" iconTint="var(--orange)" title={t('Day off target')} subtitle={t('Calories 15% off, or protein under 90%.')}><Switch checked={d.prefs.dietOff} onChange={v => setPref('dietOff', v)} /></Row>
      <Row icon="clock" iconTint="var(--grey)" title={t('Check the diary at')} subtitle={t('In each student’s own time zone.')}>{time('dietAt')}</Row>
      <Row icon="list" iconTint="var(--indigo)" title={t('Daily summary')}><Switch checked={d.prefs.dietSummary} onChange={v => setPref('dietSummary', v)} /></Row>
      <Row icon="clock" iconTint="var(--grey)" title={t('Send the summary at')} subtitle={t('In your time zone.')}>{time('summaryAt')}</Row>
    </Section>
    <div className="small dim" style={{ margin: '-12px 2px 16px' }}>{t('Push notifications need to be switched on in Settings on this device. Everything also shows up in the feed here.')}</div>
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}

// Foods the trainer offers every student — a local dish, a supplement, the gym's own shake.
function FoodForm({ close, food, onSaved }) {
  const toast = useUI(s => s.toast)
  const [v, setV] = useState(() => ({ name: food?.name || '', brand: food?.brand || '', ...(food?.per100 || { kcal: null, p: null, c: null, f: null, fib: null }), unitName: food?.unit?.n || '', unitG: food?.unit?.g || null }))
  const set = patch => setV(x => ({ ...x, ...patch }))
  const kcal = v.kcal ?? kcalFromMacros({ p: v.p || 0, c: v.c || 0, f: v.f || 0 })
  const save = () => saveTrainerFood({
    ...(food?.id ? { id: food.id } : {}), name: v.name.trim(), brand: v.brand.trim(),
    per100: { kcal, p: v.p || 0, c: v.c || 0, f: v.f || 0, fib: v.fib || 0 },
    ...(v.unitG ? { unit: { n: v.unitName.trim() || null, g: v.unitG } } : {})
  }).then(r => { onSaved(r.foods); close() }).catch(e => toast(e.message))
  const field = (k, label, decimal = true) => <label className="grow"><div className="small dim" style={{ marginBottom: 4 }}>{label}</div>
    <NumberField className="input" decimal={decimal} nullable value={v[k]} onChange={x => set({ [k]: x })} placeholder={k === 'kcal' && kcal ? String(kcal) : ''} /></label>
  return <>
    <h3>{food ? t('Edit food') : t('New food')}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{t('Values per 100 g. Every student can find it when logging.')}</div>
    <TextField placeholder={t('Name')} value={v.name} onChange={e => set({ name: e.target.value })} />
    <div style={{ height: 8 }} />
    <TextField placeholder={t('Brand or note (optional)')} value={v.brand} onChange={e => set({ brand: e.target.value })} />
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

function FoodsSheet() {
  const toast = useUI(s => s.toast)
  const openSheet = useUI(s => s.openSheet)
  const [foods, setFoods] = useState(null)
  useEffect(() => { fetchTrainerFoodsAdmin().then(setFoods).catch(e => toast(e.message)) }, [])
  const edit = food => openSheet(close => <FoodForm close={close} food={food} onSaved={setFoods} />)
  return <>
    <h3>{t('Trainer foods')}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{t('Foods you add here show up for every student under “From your trainer”.')}</div>
    <Button variant="primary" size="sm" icon="plus" onClick={() => edit(null)}>{t('New food')}</Button>
    <div style={{ height: 10 }} />
    {foods?.length ? <div className="list">{foods.map(f => <div key={f.id} className="item" onClick={() => edit(f)}>
      <div className="grow"><div className="tt">{f.name}</div><div className="ss">{(f.brand ? f.brand + ' · ' : '') + macroLine(f.per100)}</div></div>
      <button className="iconbtn" style={{ width: 32, height: 30, fontSize: 15, color: 'var(--red)' }} aria-label={t('Remove')}
        onClick={ev => { ev.stopPropagation(); deleteTrainerFood(f.id).then(r => setFoods(r.foods)).catch(e => toast(e.message)) }}><Icon name="trash" /></button>
    </div>)}</div> : <div className="empty small">{foods ? t('No foods yet.') : t('Loading…')}</div>}
  </>
}

export default function Trainer() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const toast = useUI(s => s.toast)
  const openSheet = useUI(s => s.openSheet)
  const [students, setStudents] = useState(null)
  const [events, setEvents] = useState(null)
  const [seenAt, setSeenAt] = useState(0)

  const load = () => {
    fetchStudents().then(d => setStudents(d.students)).catch(e => toast(e.message))
    // What was unread when the screen opened stays highlighted while it is open; the server
    // marker moves on at once, so the Home card and the next visit start from zero.
    fetchEvents(null, 60).then(d => { setEvents(d.events); setSeenAt(d.seenAt); if (d.events.some(e => e.at > d.seenAt)) markEventsRead().catch(() => {}) }).catch(() => {})
  }
  useEffect(() => { if (user?.admin) load() }, [])
  if (!user?.admin) return null

  const planTag = s => !s.plan ? <span className="tag">{t('No plan')}</span>
    : s.plan.acked ? <span className="tag acc">{t('Plan received')}</span>
    : <span className="tag" style={{ color: 'var(--orange)' }}>{t('Plan sent')}</span>

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 8 }}><h1 style={{ margin: 0 }}>{t('Students')}</h1>
        <div className="sub">{students ? (n => t(n === 1 ? '{0} student' : '{0} students', n))(students.filter(s => !s.self).length) : t('Loading…')}</div></div>
      <button className="iconbtn" onClick={() => openSheet(() => <FoodsSheet />)} aria-label={t('Trainer foods')}><Icon name="flame" /></button>
      <button className="iconbtn" onClick={() => openSheet(close => <PrefsSheet close={close} />)} aria-label={t('Notifications')}><Icon name="bell" /></button>
      <button className="iconbtn" onClick={load} aria-label={t('Refresh')}><Icon name="reset" /></button>
    </div>

    <h4 className="sec">{t('Latest')}</h4>
    {events?.length ? <div className="list">
      {events.slice(0, 25).map(e => <TrainerEvent key={e.id} e={e} unread={e.at > seenAt} onClick={() => e.sid && nav('/trainer/s/' + e.sid)} />)}
    </div> : <div className="empty small">{events ? t('Nothing yet — finished workouts, records and skipped days show up here.') : t('Loading…')}</div>}

    <h4 className="sec">{t('Students')}</h4>
    <div className="list">
      {(students || []).map(s => <div key={s.id} className="item" onClick={() => nav('/trainer/s/' + s.id)}>
        <span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="personCircle" /></span>
        <div className="grow">
          <div className="tt">{s.self ? t('You') : s.name}{s.unread > 0 && <span className="tag acc" style={{ marginLeft: 6 }}>{s.unread}</span>}</div>
          <div className="ss">{[
            s.adherence7.planned ? t('{0} of {1} this week', s.adherence7.done, s.adherence7.planned) : t('{0} workouts', s.workouts),
            s.lastWorkout ? t('last {0}', fmtDate(s.lastWorkout)) : t('no workouts yet'),
            ...(s.diet7 ? [t('diet {0}/7 on target', s.diet7.ok)] : []),
            t('synced {0}', relTime(s.lastSync))
          ].join(' · ')}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flex: 'none' }}>
          {planTag(s)}
          {s.diet && <span className={'tag' + (s.diet.acked ? ' acc' : '')} style={s.diet.acked ? null : { color: 'var(--orange)' }}>{t('Diet')}</span>}
        </div>
        <Icon name="chevronRight" className="chev" />
      </div>)}
      {students && !students.some(s => !s.self) && <div className="empty">{t('No students yet. Everyone who signs up on this instance and is not an admin is a student.')}</div>}
    </div>
  </div>
}
