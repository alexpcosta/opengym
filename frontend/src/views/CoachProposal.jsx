import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate } from '../lib/format.js'
import { exLine } from '../lib/history.js'
import { loadOfRoutine } from '../lib/muscles.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import {
  markStale, applicable, applyChangeSet, applyCreatedPlan, recordDismissal,
  changeTitle, changeValues, exName, coachAvailable
} from '../lib/coach.js'
import { useCoachStatus, resolvePending, refinePlan } from '../lib/coach-api.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import BodyMap from '../components/BodyMap.jsx'
import { Button, Check, Switch, TextArea } from '../components/ui.jsx'
import { trainerLocked } from '../lib/trainer.js'

/* Reviewing what the Coach came back with.
 *
 * The screen's whole job is to make approving something a decision rather than a formality:
 * every change carries the evidence behind it, shows what it would replace, and starts
 * accepted only because rejecting three of four is more common than accepting none. Anything
 * that can no longer be applied is greyed out with a reason instead of silently vanishing. */

export default function CoachProposal() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const { pending, loading, refresh } = useCoachStatus(true)

  useEffect(() => { if (!coachAvailable(config, user, { demo: DEMO, mobile: MOBILE, locked: trainerLocked(S) })) nav('/home', { replace: true }) }, [config, user])
  useEffect(() => { if (!loading && !pending) nav('/coach', { replace: true }) }, [loading, pending])
  if (!pending) return null

  return pending.kind === 'create'
    ? <CreatedPlan p={pending} S={S} update={update} toast={toast} nav={nav} refresh={refresh} />
    : <ChangeSet p={pending} S={S} update={update} toast={toast} nav={nav} />
}

/* ============================ a created plan ============================ */

function CreatedPlan({ p, S, update, toast, nav, refresh }) {
  const [schedule, setSchedule] = useState(true)
  const [refine, setRefine] = useState('')
  const [busy, setBusy] = useState(false)
  const b = p.bundle

  const accept = () => {
    try {
      update(s => { applyCreatedPlan(s, p, { schedule }) })
      resolvePending({ accepted: ['plan'] }).catch(() => {})
      toast(t('Your plan is live'))
      nav('/plan')
    } catch (e) { toast(e.message || t('That proposal can’t be read.')) }
  }
  const discard = () => confirmSheet({
    title: t('Discard this plan?'), message: t('Nothing is saved, and you can ask again anytime.'),
    confirmText: t('Discard'), danger: true,
    onConfirm: () => {
      update(s => { recordDismissal(s, p) })
      resolvePending({ dismissed: true }).catch(() => {})
      nav('/coach')
    }
  })
  const askRefine = async () => {
    if (!refine.trim()) return
    setBusy(true)
    try {
      await refinePlan(refine.trim())
      setRefine('')
      toast(t('The Coach is revising it…'))
      nav('/coach')
    } catch (e) { toast(e.message || t('Could not ask the Coach')); setBusy(false) }
  }

  return <div className="narrow">
    <Header title={t('Your plan')} sub={p.iteration > 1 ? t('Revision {0}', p.iteration) : b.name} nav={nav} />

    {!!b.summary && <div className="card"><div className="muted small" style={{ lineHeight: 1.55 }}>{b.summary}</div>
      {!!b.basedOn && <div className="dim small" style={{ marginTop: 8 }}>{b.basedOn}</div>}</div>}

    {b.routines.map(r => <div key={r.id} className="card">
      <div className="row between" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{r.emoji} {r.name}</h2>
        <span className="dim small">{t('{0} exercises', r.ex.length)}</span>
      </div>
      {!!r.why && <div className="dim small" style={{ marginBottom: 10, lineHeight: 1.5 }}>{r.why}</div>}
      {r.ex.map((e, i) => <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--sep)' : 'none' }}>
        <div className="row between">
          <span className="small capitalize" style={{ fontWeight: 500 }}>{exName(e.id)}</span>
          <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{exLine(e, S.unit)}</span>
        </div>
        {!!e.why && <div className="dim" style={{ fontSize: '.72rem', marginTop: 3, lineHeight: 1.4 }}>{e.why}</div>}
      </div>)}
      <div style={{ marginTop: 10 }}><BodyMap load={loadOfRoutine(r)} body={S.body} /></div>
    </div>)}

    <div className="card">
      <div className="row between">
        <div style={{ minWidth: 0 }}>
          <div className="lrow-t">{t('Use this weekly schedule')}</div>
          <div className="lrow-s">{t('Replaces your current week. Days this plan leaves empty become rest days.')}</div>
        </div>
        <Switch checked={schedule} onChange={setSchedule} />
      </div>
    </div>

    <div className="card">
      <h2 style={{ margin: '0 0 6px' }}>{t('Want something different?')}</h2>
      <div className="muted small" style={{ marginBottom: 10 }}>{t('Say it in your own words and the Coach will revise the whole plan.')}</div>
      <TextArea rows={2} maxLength={1000} value={refine} onChange={e => setRefine(e.target.value)}
        placeholder={t('e.g. “swap the squats for split squats, and Mondays are short”')} />
      <div style={{ height: 10 }} />
      <Button icon="reset" disabled={busy || !refine.trim()} onClick={askRefine}>{t('Ask for a revision')}</Button>
    </div>

    <Button variant="primary" icon="check" onClick={accept}>{t('Accept plan')}</Button>
    <div style={{ height: 8 }} />
    <Button danger onClick={discard}>{t('Discard')}</Button>
    <div style={{ height: 24 }} />
  </div>
}

/* ============================ a change-set ============================ */

function ChangeSet({ p, S, update, toast, nav }) {
  // Staleness is decided against the *live* plan every render: someone may have edited it on
  // another device while this screen was open.
  const marked = useMemo(() => markStale(p, S), [p, S])
  const usable = applicable(marked)
  const [accepted, setAccepted] = useState(() => new Set(usable.map(c => c.id)))
  const toggle = id => setAccepted(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const apply = () => {
    const ids = [...accepted].filter(id => usable.some(c => c.id === id))
    if (!ids.length) { discard(); return }
    try {
      update(s => { applyChangeSet(s, marked, ids) })
      resolvePending({ accepted: ids, rejected: marked.changes.filter(c => !ids.includes(c.id)).map(c => c.id) }).catch(() => {})
      toast(t(ids.length === 1 ? '{0} change applied' : '{0} changes applied', ids.length))
      nav('/plan')
    } catch (e) { toast(e.message || t('Could not apply those changes')) }
  }
  const discard = () => confirmSheet({
    title: t('Dismiss these suggestions?'), message: t('Nothing changes, and the Coach will remember you turned these down.'),
    confirmText: t('Dismiss'), danger: true,
    onConfirm: () => {
      update(s => { recordDismissal(s, marked) })
      resolvePending({ dismissed: true }).catch(() => {})
      nav('/coach')
    }
  })

  return <div className="narrow">
    <Header title={t('Coach suggestions')} nav={nav}
      sub={marked.evidence?.sessions
        ? t('Based on your last {0} sessions', marked.evidence.sessions) +
          (marked.evidence.from ? ` · ${fmtDate(marked.evidence.from)} – ${fmtDate(marked.evidence.to)}` : '')
        : null} />

    {!!marked.summary && <div className="card"><div className="muted small" style={{ lineHeight: 1.55 }}>{marked.summary}</div></div>}

    {marked.planMoved && <div className="card" style={{ borderColor: 'var(--yellow)' }}>
      <div className="row" style={{ gap: 9 }}>
        <span className="lrow-i" style={{ '--tint': 'var(--yellow)' }}><Icon name="info" /></span>
        <div className="small" style={{ lineHeight: 1.45 }}>
          {t('Your plan changed since the Coach looked at it. Suggestions that no longer match are greyed out — ask for a fresh review to see them again.')}
        </div>
      </div>
    </div>}

    {marked.changes.map(c => {
      const stale = c.status === 'stale'
      const vals = changeValues(c)
      return <div key={c.id} className="card" style={stale ? { opacity: .55 } : null}>
        <div className="row between" style={{ gap: 10, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="row" style={{ gap: 8, marginBottom: 3 }}>
              <span className="small capitalize" style={{ fontWeight: 600 }}>{changeTitle(c)}</span>
            </div>
            {vals && <div className="row" style={{ gap: 7, marginBottom: 5 }}>
              <span className="tag">{vals.before}</span>
              <Icon name="chevronRight" style={{ fontSize: 12, color: 'var(--label-3)' }} />
              <span className="tag acc">{vals.after}</span>
            </div>}
            <div className="dim small" style={{ lineHeight: 1.45 }}>{c.why}</div>
            {stale && <div className="small" style={{ color: 'var(--yellow)', marginTop: 6 }}>
              {t('Doesn’t match your plan any more — can’t be applied.')}
            </div>}
          </div>
          {!stale && <Check checked={accepted.has(c.id)} onChange={() => toggle(c.id)} />}
        </div>
      </div>
    })}

    {!!marked.notes?.length && <div className="card">
      <h2 style={{ margin: '0 0 8px' }}>{t('Notes from the Coach')}</h2>
      {marked.notes.map((n, i) => <div key={i} className="muted small" style={{ lineHeight: 1.5, padding: '6px 0', borderTop: i ? '1px solid var(--sep)' : 'none' }}>{n}</div>)}
      <div className="dim small" style={{ marginTop: 8 }}>{t('These change nothing on their own.')}</div>
    </div>}

    <Button variant="primary" icon="check" onClick={apply}>
      {accepted.size ? t(accepted.size === 1 ? 'Apply {0} change' : 'Apply {0} changes', accepted.size) : t('Apply nothing')}
    </Button>
    <div style={{ height: 8 }} />
    <Button danger onClick={discard}>{t('Dismiss all')}</Button>
    <div style={{ height: 24 }} />
  </div>
}

function Header({ title, sub, nav }) {
  return <div className="hdr">
    <button className="iconbtn" onClick={() => nav('/coach')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
    <div style={{ flex: 1, marginLeft: 10 }}>
      <h1>{title}</h1>
      {sub && <div className="sub">{sub}</div>}
    </div>
  </div>
}
