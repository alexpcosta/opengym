import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate } from '../lib/format.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import {
  coachAvailable, hasConsent, CONSENT_VERSION, emptyCoach,
  canRevert, revertLast, changeTitle, recordDismissal
} from '../lib/coach.js'
import {
  useCoachStatus, requestReview, resolvePending, forgetCoach, disclosure, JOB_ERRORS
} from '../lib/coach-api.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Section, Row, Button, TextArea, Switch, SelectRow } from '../components/ui.jsx'

/* The Coach's home: what it's doing, what it's proposing, what it has done before, and every
   switch that turns it off. Deliberately one screen — a feature that edits your training plan
   should not scatter its controls, least of all the ones that stop it. */

const GOALS = ['strength', 'muscle', 'general fitness', 'fat loss', 'endurance']

// Rendered from the same list the server builds payloads from (GET /api/coach/disclosure),
// so the promise on screen cannot drift from what actually leaves the box.
const CATEGORY_TEXT = {
  plan: ['Your plan', 'Routines, exercises, sets and reps, your weekly schedule and progression settings.'],
  training: ['Your logged training', 'Sets you logged in the review window — weights, reps, times, effort ratings and how long sessions took.'],
  bodyweight: ['Body weight', 'Weigh-ins from the same window, and your goal weight if you set one.'],
  profile: ['What you tell the Coach', 'Your intake answers, including any limitations or injuries you describe.'],
  prefs: ['A few preferences', 'Your unit, your language and which effort scale you log.']
}

export default function Coach() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const { job, pending, cap, refresh } = useCoachStatus(true)

  // Gating lives in one predicate; if the instance isn't offering the Coach this route simply
  // isn't a place you can be.
  useEffect(() => { if (!coachAvailable(config, user, { demo: DEMO, mobile: MOBILE })) nav('/home', { replace: true }) }, [config, user])
  if (!coachAvailable(config, user, { demo: DEMO, mobile: MOBILE })) return null

  const consented = hasConsent(S)
  const coach = S.coach || emptyCoach()

  const askReview = async () => {
    setBusy(true)
    try {
      await requestReview(note)
      setNote('')
      toast(t('The Coach is reading your training…'))
      refresh()
    } catch (e) { toast(e.message || t('Could not ask the Coach')) }
    setBusy(false)
  }

  const turnOff = () => confirmSheet({
    title: t('Turn the Coach off?'),
    message: t('Any pending suggestion is discarded and scheduled reviews stop. Your Coach history stays, and you can turn it back on anytime.'),
    confirmText: t('Turn off'), danger: true,
    onConfirm: async () => {
      try { await forgetCoach() } catch (e) { /* server-side copy goes on the next call */ }
      update(s => { s.coach = { ...(s.coach || emptyCoach()), consent: null, cadence: 'off' } })
      toast(t('The Coach is off'))
      nav('/home')
    }
  })

  const doRevert = () => confirmSheet({
    title: t('Undo the last Coach changes?'),
    message: t('Your plan goes back to how it was before you accepted them. Workouts you have logged since are untouched.'),
    confirmText: t('Undo'),
    onConfirm: () => {
      let ok = false
      update(s => { ok = revertLast(s) })
      toast(ok ? t('Plan restored') : t('Nothing to undo'))
    }
  })

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/plan')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}>
        <h1>{t('Coach')}</h1>
        <div className="sub">{t('Plan design and reviews, from your own training')}</div>
      </div>
    </div>

    {!consented
      ? <ConsentCard onDone={() => refresh()} />
      : <>
        <StatusCard job={job} pending={pending} nav={nav} />

        {!job && !pending && <div className="card">
          <h2 style={{ margin: '0 0 6px' }}>{t('Ask for a review')}</h2>
          <div className="muted small" style={{ marginBottom: 10 }}>
            {t('The Coach reads what you have actually logged since its last look and suggests changes to your plan — each one with its reason.')}
          </div>
          <TextArea rows={2} value={note} maxLength={1000} onChange={e => setNote(e.target.value)}
            placeholder={t('Anything it should know? (optional) — e.g. “right shoulder pinches on overhead work”')} />
          <div style={{ height: 10 }} />
          <Button variant="primary" icon="sparkles" disabled={busy} onClick={askReview}>{t('Ask for a review')}</Button>
          {cap?.limit > 0 && <div className="dim small" style={{ marginTop: 8, textAlign: 'center' }}>
            {t('{0} of {1} Coach runs used today', cap.used, cap.limit)}
          </div>}
        </div>}

        {!S.routines.length && <div className="card">
          <div className="muted small" style={{ marginBottom: 10 }}>{t('No plan yet — the Coach can build you one from a few questions.')}</div>
          <Button variant="primary" icon="sparkles" onClick={() => nav('/coach/intake')}>{t('Let the Coach build my plan')}</Button>
        </div>}

        <CadenceCard coach={coach} update={update} />

        <Section title={t('Coach profile')} footer={t('Used by every proposal — keep limitations here up to date.')}>
          <Row icon="clipboard" iconTint="var(--indigo)" title={t('Your answers')}
            subtitle={coach.profile ? summarise(coach.profile) : t('Not set yet')}
            accessory="chevron" onClick={() => nav('/coach/intake?edit=1')} />
        </Section>

        <LogCard coach={coach} />

        <Section title={t('Controls')}>
          {canRevert(S) && <Row icon="reset" iconTint="var(--blue)" title={t('Undo the last Coach changes')} accessory="chevron" onClick={doRevert} />}
          <Row icon="signOut" iconTint="var(--red)" title={t('Turn the Coach off')} danger onClick={turnOff} />
        </Section>
      </>}
  </div>
}

const summarise = p => [
  p.goal && t(p.goal),
  p.daysPerWeek && t('{0} days a week', p.daysPerWeek),
  p.sessionMin && t('{0} min', p.sessionMin)
].filter(Boolean).join(' · ')

/* ---------------------------------- consent ---------------------------------- */

function ConsentCard({ onDone }) {
  const update = useStore(s => s.update)
  const config = useStore(s => s.config)
  const toast = useUI(s => s.toast)
  const openSheet = useUI(s => s.openSheet)
  const [info, setInfo] = useState(null)
  useEffect(() => { disclosure().then(setInfo).catch(() => {}) }, [])

  const agree = () => {
    update(s => { s.coach = { ...(s.coach || emptyCoach()), consent: { agreedAt: new Date().toISOString(), version: CONSENT_VERSION } } })
    toast(t('The Coach is on'))
    onDone()
  }

  const open = () => openSheet(close => <>
    <h3>{t('Before the Coach starts')}</h3>
    <div className="muted small" style={{ lineHeight: 1.5, marginBottom: 12 }}>
      {DEMO ? t('This preview uses simulated responses on this device. No training data is sent to an AI provider.') :
        t('When you ask for a plan or a review, this instance sends the following to {0}, running on this server under the instance owner’s account.',
          info?.providerLabel || config?.coach?.providerLabel || t('the configured AI provider'))}
    </div>
    <div className="sect-b">
      {(info?.categories || Object.keys(CATEGORY_TEXT)).map(k => {
        const [title, sub] = CATEGORY_TEXT[k] || [k, '']
        return <div key={k} className="lrow">
          <span className="lrow-i" style={{ '--tint': 'var(--acc)' }}><Icon name="check" /></span>
          <span className="lrow-m"><span className="lrow-t">{t(title)}</span><span className="lrow-s">{t(sub)}</span></span>
        </div>
      })}
    </div>
    <div className="dim small" style={{ lineHeight: 1.5, display: 'grid', gap: 8, marginTop: 12 }}>
      <div>{t('Your name, your sign-in details and everything else about your account stay here. Other people’s data is never included.')}</div>
      <div>{t('Nothing the Coach suggests is applied on its own — you review every change and can undo it afterwards.')}</div>
      <div>{t('You can turn this off at any time, which also discards anything the Coach is holding for you.')}</div>
      <div style={{ color: 'var(--yellow)' }}>{t('The Coach is not a doctor or a physiotherapist. If something hurts, ask a professional.')}</div>
    </div>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => { close(); agree() }}>{t('I understand — turn the Coach on')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={close}>{t('Not now')}</Button>
  </>)

  return <div className="card">
    <div className="row" style={{ gap: 10, marginBottom: 6 }}>
      <span className="lrow-i" style={{ '--tint': 'var(--acc)' }}><Icon name="sparkles" /></span>
      <div className="big" style={{ fontSize: 20 }}>{t('Meet the Coach')}</div>
    </div>
    <div className="muted small" style={{ marginBottom: 12, lineHeight: 1.5 }}>
      {DEMO ? t('Try the Coach with example responses. Review, apply and undo a proposal before connecting a real AI provider.') :
        t('An AI coach that can design your plan and adjust it from what you actually log. It runs on this server, it never changes anything without your say-so, and it is off until you turn it on.')}
    </div>
    <Button variant="primary" icon="sparkles" onClick={open}>{t('See what it would use')}</Button>
  </div>
}

/* ---------------------------------- status ---------------------------------- */

function StatusCard({ job, pending, nav }) {
  if (job) return <div className="card">
    <div className="row" style={{ gap: 10 }}>
      <span className="lrow-i" style={{ background: 'var(--orange)' }}><Icon name="sparkles" /></span>
      <div>
        <div style={{ fontWeight: 600 }}>{t('The Coach is thinking…')}</div>
        <div className="muted small">{t('This takes a minute or two. You can leave this screen — it keeps going.')}</div>
      </div>
    </div>
  </div>

  if (pending) return <div className="card" style={{ borderColor: 'var(--acc)' }}>
    <div className="today-row" onClick={() => nav('/coach/proposal')}>
      <div className="row" style={{ gap: 9, minWidth: 0 }}>
        <span className="lrow-i" style={{ background: 'var(--acc)' }}><Icon name="clipboard" /></span>
        <div style={{ minWidth: 0 }}>
          <div className="lbl2">{pending.kind === 'create' ? t('Your plan is ready') : t('Suggestions ready')}</div>
          <div className="ttl">{pending.kind === 'create'
            ? t('{0} routines to look over', pending.bundle?.routines?.length || 0)
            : t(pending.changes?.length === 1 ? '{0} suggestion' : '{0} suggestions', pending.changes?.length || 0)}</div>
        </div>
      </div>
      <span className="tag acc">{t('Review')}</span>
    </div>
  </div>

  return null
}

/* ---------------------------------- cadence ---------------------------------- */

function CadenceCard({ coach, update }) {
  const cadence = coach.cadence && coach.cadence !== 'off' ? coach.cadence : null
  const mode = !cadence ? 'off' : cadence.weekly ? 'weekly' : 'every'
  const setMode = m => update(s => {
    const c = (s.coach = s.coach || emptyCoach())
    c.cadence = m === 'off' ? 'off' : m === 'weekly' ? { weekly: { day: 0, time: '18:00' } } : { everyWorkouts: 4 }
  })
  const patch = fn => update(s => { const c = (s.coach = s.coach || emptyCoach()); fn(c) })

  return <Section title={t('Automatic reviews')}
    footer={mode === 'off'
      ? t('Off — the Coach only looks when you ask it to.')
      : t('You are only notified when the Coach actually has something to suggest.')}>
    <SelectRow icon="clock" iconTint="var(--purple)" title={t('When')}
      value={mode} onChange={setMode}
      options={[
        { value: 'off', label: t('Off') },
        { value: 'weekly', label: t('Weekly'), subtitle: t('On a day and time you choose') },
        { value: 'every', label: t('After every few workouts'), subtitle: t('As soon as you have logged enough') }
      ]} />
    {mode === 'weekly' && <>
      <SelectRow icon="calendar" iconTint="var(--orange)" title={t('Day')}
        value={cadence.weekly.day}
        onChange={v => patch(c => { c.cadence = { weekly: { ...c.cadence.weekly, day: v } } })}
        options={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => ({ value: i, label: t(d) }))} />
      <Row icon="clock" iconTint="var(--purple)" title={t('Time')}>
        <input type="time" className="timef" value={cadence.weekly.time || '18:00'}
          onChange={e => patch(c => { c.cadence = { weekly: { ...c.cadence.weekly, time: e.target.value } } })} />
      </Row>
    </>}
    {mode === 'every' && <SelectRow icon="dumbbell" iconTint="var(--teal)" title={t('After how many workouts')}
      value={cadence.everyWorkouts || 4}
      onChange={v => patch(c => { c.cadence = { everyWorkouts: v } })}
      options={[3, 4, 5, 6, 8, 10].map(n => ({ value: n, label: t('{0} workouts', n) }))} />}
  </Section>
}

/* ---------------------------------- log ---------------------------------- */

function LogCard({ coach }) {
  const openSheet = useUI(s => s.openSheet)
  const log = [...(coach.log || [])].reverse()
  if (!log.length) return null

  const detail = e => openSheet(close => <>
    <h3>{e.kind === 'create' ? t('Plan from the Coach') : e.kind === 'revert' ? t('Undo') : t('Coach review')}</h3>
    <div className="dim small" style={{ marginBottom: 10 }}>{fmtDate(new Date(e.at).toISOString().slice(0, 10), true)}</div>
    {e.summary && <div className="muted small" style={{ lineHeight: 1.5, marginBottom: 12 }}>{e.summary}</div>}
    {!!e.evidence?.sessions && <div className="dim small" style={{ marginBottom: 10 }}>
      {t('Based on {0} sessions', e.evidence.sessions)}{e.evidence.from ? ' · ' + fmtDate(e.evidence.from) + ' – ' + fmtDate(e.evidence.to) : ''}
    </div>}
    {(e.decisions || []).map(d => <div key={d.id} className="row between" style={{ padding: '8px 2px', borderBottom: '1px solid var(--sep)', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div className="small" style={{ fontWeight: 600 }}>{changeTitle(d)}</div>
        {d.why && <div className="dim" style={{ fontSize: '.72rem', lineHeight: 1.4 }}>{d.why}</div>}
      </div>
      <span className="tag" style={d.status === 'accepted' ? { color: 'var(--acc)' } : { color: 'var(--label-3)' }}>
        {d.status === 'accepted' ? t('applied') : t('declined')}
      </span>
    </div>)}
    {(e.notes || []).map((n, i) => <div key={i} className="muted small" style={{ marginTop: 10, lineHeight: 1.5 }}>💬 {n}</div>)}
    <div style={{ height: 10 }} />
  </>)

  return <>
    <h4 className="sec">{t('Coach history')}</h4>
    <div className="list">
      {log.slice(0, 20).map(e => {
        const applied = (e.decisions || []).filter(d => d.status === 'accepted').length
        return <div key={e.id} className="item" onClick={() => detail(e)}>
          <div className="grow">
            <div className="tt">{e.kind === 'create' ? t('Built a plan') : e.kind === 'revert' ? t('Undid the last changes') : t('Reviewed your training')}</div>
            <div className="ss">{fmtDate(new Date(e.at).toISOString().slice(0, 10))}
              {e.kind === 'review' ? ' · ' + t('{0} applied', applied) : ''}</div>
          </div>
          <Icon name="chevronRight" className="chev" />
        </div>
      })}
    </div>
  </>
}
