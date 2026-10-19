import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useTrainer } from '../store/useTrainer.js'
import { t } from '../lib/i18n.js'
import { DAYN, DAYS, fmtDate, fmtNum, exCount, relTime } from '../lib/format.js'
import { fetchEvents } from '../lib/trainer-api.js'
import { routineDaySheet, workoutDetailSheet, WorkoutRow, confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import LineChart from '../components/LineChart.jsx'
import TrainerEvent from '../components/TrainerEvent.jsx'
import { Button, Segmented, TextArea } from '../components/ui.jsx'
import { glyphOf } from '../lib/glyphs.js'
import TrainerDietTab from './TrainerDiet.jsx'
import TrainerSuppsTab from './TrainerSupps.jsx'

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

// 28 small squares: planned and trained, planned and missed, trained off-plan, nothing.
function AdherenceStrip({ days }) {
  const color = x => x.done ? (x.planned ? 'var(--acc)' : 'var(--blue)') : x.planned ? 'var(--red)' : 'var(--surface-3)'
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 4, marginTop: 8 }}>
    {days.map(x => <div key={x.d} title={fmtDate(x.d, true)} style={{ aspectRatio: '1', borderRadius: 4, background: color(x) }} />)}
  </div>
}

function PlanTab({ d, nav }) {
  const mine = useStore(s => s.S)
  const toast = useUI(s => s.toast)
  const { draft, dirty, edit, addRoutine, save, remove, copyFrom, discard } = useTrainer()
  const [busy, setBusy] = useState(false)
  if (!draft) return null
  const status = !d.plan ? t('No plan sent yet.')
    : d.plan.ackedVersion >= d.planVersion ? t('Version {0} is on {1}’s phone (opened {2}).', d.planVersion, d.user.name, relTime(d.plan.ackedAt))
    : t('Version {0} sent {1} — {2} has not opened the app since.', d.planVersion, relTime(d.plan.updatedAt), d.user.name)

  const send = async () => {
    setBusy(true)
    try { await save(mine); toast(t('Plan sent to {0}', d.user.name)) }
    catch (e) { toast(e.message) }
    setBusy(false)
  }
  const newRoutine = () => nav('/trainer/s/' + d.user.id + '/r/' + addRoutine(t('New routine')))

  return <>
    <div className="small muted" style={{ margin: '0 2px 10px' }}>{status}</div>

    <h4 className="sec">{t('Week schedule')}</h4>
    <div className="list">
      {WEEK_ORDER.map(day => {
        const r = draft.routines.find(x => x.id === draft.week[day])
        return <div key={day} className="item" onClick={() => routineDaySheet({
          day, routines: draft.routines, current: draft.week[day],
          onPick: v => edit(x => { if (v) x.week[day] = v; else delete x.week[day] })
        })}>
          <div className="grow"><div className="tt">{t(DAYN[day])}</div></div>
          {r ? <span className="tag acc"><Icon name={glyphOf(r.emoji)} />{r.name}</span> : <span className="tag">{t('Rest')}</span>}
          <Icon name="chevronRight" className="chev" />
        </div>
      })}
    </div>

    <div className="row between" style={{ marginTop: 22, marginBottom: 10 }}>
      <h4 className="sec" style={{ margin: 0 }}>{t('Routines')}</h4>
      <Button size="sm" variant="tinted" icon="plus" onClick={newRoutine}>{t('New')}</Button>
    </div>
    {draft.routines.length ? <div className="list">{draft.routines.map(r => <div key={r.id} className="item" onClick={() => nav('/trainer/s/' + d.user.id + '/r/' + r.id)}>
      <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
      <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
      <Icon name="chevronRight" className="chev" /></div>)}</div>
      : <div className="empty small">{t('No routines yet — create one, or start from your own plan.')}</div>}
    {mine.routines.length > 0 && <><div style={{ height: 8 }} />
      <Button icon="clipboard" onClick={() => confirmSheet({
        title: t('Copy your plan?'), message: t('Adds your {0} routines and your week to this draft. Nothing is sent until you tap Send.', mine.routines.length),
        confirmText: t('Copy'), onConfirm: () => copyFrom(mine)
      })}>{t('Copy from my plan')}</Button></>}

    <h4 className="sec">{t('Note for {0}', d.user.name)}</h4>
    <TextArea rows={3} value={draft.note} placeholder={t('Shown with the plan on their phone (optional).')} onChange={e => { const v = e.target.value; edit(x => { x.note = v.slice(0, 1000) }) }} />

    <div style={{ height: 14 }} />
    <Button variant="primary" icon="upload" disabled={busy || !draft.routines.length || (!dirty && !!d.plan)} onClick={send}>
      {d.plan ? t('Send update to {0}', d.user.name) : t('Send plan to {0}', d.user.name)}</Button>
    {dirty && <><div style={{ height: 8 }} /><Button onClick={discard}>{t('Discard changes')}</Button></>}
    {d.plan && <><div style={{ height: 8 }} /><Button variant="danger" onClick={() => confirmSheet({
      title: t('Remove the plan?'), message: t('{0}’s app drops your routines and unlocks their plan. Their workout history stays.', d.user.name),
      confirmText: t('Remove'), danger: true, onConfirm: () => remove().then(() => toast(t('Plan removed'))).catch(e => toast(e.message))
    })}>{t('Remove plan')}</Button></>}

    {d.ownRoutines.length > 0 && <>
      <h4 className="sec">{t('Their own routines')}</h4>
      <div className="list">{d.ownRoutines.map(r => <div key={r.id} className="item" style={{ opacity: .75 }}>
        <span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount((r.ex || []).length)}</div></div>
      </div>)}</div>
    </>}
  </>
}

function HistoryTab({ d }) {
  const [events, setEvents] = useState(null)
  useEffect(() => { fetchEvents(d.user.id, 30).then(x => setEvents(x.events)).catch(() => setEvents([])) }, [d.user.id])
  const owner = { unit: d.unit, customEx: d.customEx }
  const routines = [...(d.plan?.routines || []), ...d.ownRoutines]
  return <>
    {events?.length > 0 && <><h4 className="sec">{t('Latest')}</h4>
      <div className="list">{events.slice(0, 8).map(e => <TrainerEvent key={e.id} e={e} />)}</div></>}
    <h4 className="sec">{t('Workout history')}</h4>
    {d.workouts.length ? <div className="list">{d.workouts.slice(0, 80).map(w =>
      <WorkoutRow key={w.id} w={w} unit={d.unit} routines={routines} onClick={() => workoutDetailSheet(w, owner)} />)}</div>
      : <div className="empty small">{t('No workouts logged yet.')}</div>}
  </>
}

export default function TrainerStudent() {
  const nav = useNavigate()
  const { sid } = useParams()
  const user = useStore(s => s.user)
  const { student: d, dirty: planDirty, dietDirty, suppDirty, load, loading, error } = useTrainer()
  const dirty = planDirty || dietDirty || suppDirty
  const [tab, setTab] = useState('plan')
  useEffect(() => { if (user?.admin) load(sid) }, [sid])
  if (!user?.admin) return null

  const back = () => dirty
    ? confirmSheet({ title: t('Leave without sending?'), message: t('Your changes stay in this draft until you reload the app.'), confirmText: t('Leave'), onConfirm: () => nav('/trainer') })
    : nav('/trainer')

  if (!d || d.user.id !== sid) return <div className="narrow">
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/trainer')} aria-label={t('Students')}><Icon name="chevronLeft" /></button></div>
    <div className="muted small">{error || (loading ? t('Loading…') : '')}</div>
  </div>

  const done28 = d.adherence.filter(x => x.planned && x.done).length
  const planned28 = d.adherence.filter(x => x.planned).length
  const bw = d.bodyweight[d.bodyweight.length - 1]
  const bwPoints = d.bodyweight.slice(-30).map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={back} aria-label={t('Students')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 8, minWidth: 0 }}><h1 style={{ margin: 0 }} className="capitalize">{d.user.name}</h1>
        <div className="sub">{t('synced {0}', relTime(d.lastSync))}</div></div>
    </div>

    <div className="tiles" style={{ textAlign: 'left', marginBottom: 12 }}>
      <div className="tile"><div className="l">{t('4 weeks')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{planned28 ? done28 + '/' + planned28 : '—'}</div></div>
      <div className="tile"><div className="l">{t('Workouts')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{d.workouts.length}</div></div>
      <div className="tile"><div className="l">{t('Last workout')}</div><div className="v" style={{ fontSize: '.95rem' }}>{d.workouts[0] ? fmtDate(d.workouts[0].d) : '—'}</div></div>
      <div className="tile"><div className="l">{t('Body weight')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{bw ? fmtNum(bw.w) + ' ' + d.unit : '—'}</div></div>
    </div>

    <div className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>{t('Last 4 weeks')}</h2>
        <span className="small dim">{t(DAYS[new Date(d.adherence[0].d + 'T12:00:00').getDay()])} → {t(DAYS[new Date(d.today + 'T12:00:00').getDay()])}</span></div>
      <AdherenceStrip days={d.adherence} />
      <div className="small dim row" style={{ gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <span><span style={{ color: 'var(--acc)' }}>■</span> {t('trained')}</span>
        <span><span style={{ color: 'var(--red)' }}>■</span> {t('skipped')}</span>
        <span><span style={{ color: 'var(--blue)' }}>■</span> {t('extra')}</span>
      </div>
      {bwPoints.length > 1 && <div className="chart" style={{ marginTop: 12 }}><LineChart points={bwPoints} h={110} unit={d.unit} goal={d.targetW} /></div>}
    </div>

    <Segmented className="seg-inline" value={tab} onChange={setTab}
      options={[{ value: 'plan', label: t('Training') }, { value: 'diet', label: t('Diet') }, { value: 'supps', label: t('Supps') }, { value: 'history', label: t('History') }]} />
    <div style={{ height: 12 }} />
    {tab === 'plan' ? <PlanTab d={d} nav={nav} /> : tab === 'diet' ? <TrainerDietTab d={d} />
      : tab === 'supps' ? <TrainerSuppsTab d={d} /> : <HistoryTab d={d} />}
  </div>
}
