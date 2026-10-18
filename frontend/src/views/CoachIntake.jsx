import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { DAYN } from '../lib/format.js'
import { EXDB } from '../lib/exercises.js'
import { emptyCoach, coachAvailable } from '../lib/coach.js'
import { requestPlan } from '../lib/coach-api.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import Icon from '../components/Icon.jsx'
import { Button, TextArea, Segmented } from '../components/ui.jsx'
import { trainerLocked } from '../lib/trainer.js'

/* The intake: one topic per screen, because a single form with eleven fields is a form people
   abandon. Only the first two questions are required — everything after them improves the
   plan without gating it, and someone who wants to just get training should be able to. */

const GOALS = [
  ['strength', 'Get stronger'],
  ['muscle', 'Build muscle'],
  ['general', 'General fitness'],
  ['fatloss', 'Lose fat'],
  ['endurance', 'Endurance']
]
const EXPERIENCE = [
  ['new', 'New to lifting'],
  ['returning', 'Coming back after a break'],
  ['regular', 'Training regularly']
]
const SESSION_MIN = [30, 45, 60, 75, 90]

// Equipment options come from the library's own taxonomy, most common first, so every choice
// on screen has exercises behind it.
const EQUIPMENT = (() => {
  const count = {}
  EXDB.forEach(e => { if (e.eq) count[e.eq] = (count[e.eq] || 0) + 1 })
  return Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 14)
})()

const STEPS = ['goal', 'days', 'length', 'equipment', 'limits', 'extras']

export default function CoachIntake() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editing = params.get('edit') === '1'
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [p, setP] = useState(() => ({
    goal: null, experience: null, daysPerWeek: 3, preferredDays: [1, 3, 5],
    sessionMin: 45, equipment: [], limitations: '', likes: '', dislikes: '', notes: '',
    ...(S.coach?.profile || {})
  }))
  const set = patch => setP(v => ({ ...v, ...patch }))

  if (!coachAvailable(config, user, { demo: DEMO, mobile: MOBILE, locked: trainerLocked(S) })) { nav('/home', { replace: true }); return null }

  const key = STEPS[step]
  const canNext = key !== 'goal' || (p.goal && p.experience)
  const last = step === STEPS.length - 1

  const save = () => { update(s => { const c = (s.coach = s.coach || emptyCoach()); c.profile = p }) }

  const finish = async () => {
    save()
    if (editing) { toast(t('Saved')); nav('/coach'); return }
    setBusy(true)
    try {
      await requestPlan(p)
      toast(t('The Coach is building your plan…'))
      nav('/coach')
    } catch (e) { toast(e.message || t('Could not ask the Coach')); setBusy(false) }
  }

  const toggleDay = d => set({
    preferredDays: p.preferredDays.includes(d) ? p.preferredDays.filter(x => x !== d) : [...p.preferredDays, d].sort()
  })
  const toggleEq = e => set({
    equipment: p.equipment.includes(e) ? p.equipment.filter(x => x !== e) : [...p.equipment, e]
  })

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => step ? setStep(step - 1) : nav('/coach')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}>
        <h1>{editing ? t('Coach profile') : t('Your plan')}</h1>
        <div className="sub">{t('Step {0} of {1}', step + 1, STEPS.length)}</div>
      </div>
    </div>

    {/* progress rail — the wizard's only chrome; six dots read faster than "1 of 6" alone */}
    <div className="row" style={{ gap: 5, marginBottom: 14 }}>
      {STEPS.map((s, i) => <div key={s} style={{
        height: 3, flex: 1, borderRadius: 2,
        background: i <= step ? 'var(--acc)' : 'var(--surface-3)'
      }} />)}
    </div>

    <div className="card">
      {key === 'goal' && <>
        <h2 style={{ marginTop: 0 }}>{t('What are you training for?')}</h2>
        <div className="sect-b">
          {GOALS.map(([v, label]) => <button key={v} className="lrow tap" onClick={() => set({ goal: v })}>
            <span className="lrow-m"><span className="lrow-t">{t(label)}</span></span>
            {p.goal === v && <Icon name="check" className="lrow-k" />}
          </button>)}
        </div>
        <h2>{t('Where are you starting from?')}</h2>
        <div className="sect-b">
          {EXPERIENCE.map(([v, label]) => <button key={v} className="lrow tap" onClick={() => set({ experience: v })}>
            <span className="lrow-m"><span className="lrow-t">{t(label)}</span></span>
            {p.experience === v && <Icon name="check" className="lrow-k" />}
          </button>)}
        </div>
      </>}

      {key === 'days' && <>
        <h2 style={{ marginTop: 0 }}>{t('How many days a week?')}</h2>
        <Segmented options={[2, 3, 4, 5, 6].map(n => ({ value: n, label: String(n) }))}
          value={p.daysPerWeek} onChange={v => set({ daysPerWeek: v })} />
        <div className="muted small" style={{ margin: '14px 0 8px' }}>{t('Which days suit you? (optional)')}</div>
        <div className="week">
          {[1, 2, 3, 4, 5, 6, 0].map(d => <div key={d} className={'wday' + (p.preferredDays.includes(d) ? ' today' : '')}
            onClick={() => toggleDay(d)} style={{ cursor: 'pointer' }}>
            <div className="lbl">{t(DAYN[d]).slice(0, 2)}</div>
            <div className={'dot' + (p.preferredDays.includes(d) ? ' plan' : '')} />
          </div>)}
        </div>
      </>}

      {key === 'length' && <>
        <h2 style={{ marginTop: 0 }}>{t('How long is a session?')}</h2>
        <Segmented options={SESSION_MIN.map(n => ({ value: n, label: n + ' ' + t('min') }))}
          value={p.sessionMin} onChange={v => set({ sessionMin: v })} />
        <div className="muted small" style={{ marginTop: 12 }}>{t('The Coach fits the volume to the time you actually have, including rest between sets.')}</div>
      </>}

      {key === 'equipment' && <>
        <h2 style={{ marginTop: 0 }}>{t('What can you train with?')}</h2>
        <div className="muted small" style={{ marginBottom: 10 }}>{t('Pick everything you have access to. Leave it empty and the Coach will use the whole library.')}</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 7 }}>
          {EQUIPMENT.map(e => <button key={e} className={'chip' + (p.equipment.includes(e) ? ' on' : '')}
            onClick={() => toggleEq(e)} style={{ textTransform: 'capitalize' }}>{e}</button>)}
        </div>
      </>}

      {key === 'limits' && <>
        <h2 style={{ marginTop: 0 }}>{t('Anything to work around?')}</h2>
        <div className="muted small" style={{ marginBottom: 10 }}>
          {t('Injuries, joints that complain, movements you cannot do, or practical limits like training at 6am in a flat.')}
        </div>
        <TextArea rows={4} maxLength={600} value={p.limitations} onChange={e => set({ limitations: e.target.value })}
          placeholder={t('e.g. “dodgy left shoulder — no barbell overhead press”')} />
        <div className="dim small" style={{ marginTop: 8, lineHeight: 1.5, color: 'var(--yellow)' }}>
          {t('If something actually hurts, see a professional — the Coach will program conservatively but it cannot diagnose anything.')}
        </div>
      </>}

      {key === 'extras' && <>
        <h2 style={{ marginTop: 0 }}>{t('Anything else?')}</h2>
        <div className="muted small" style={{ marginBottom: 6 }}>{t('Exercises you love')}</div>
        <TextArea rows={2} maxLength={300} value={p.likes} onChange={e => set({ likes: e.target.value })} placeholder={t('e.g. “deadlifts, anything with a kettlebell”')} />
        <div className="muted small" style={{ margin: '12px 0 6px' }}>{t('Exercises you would rather not')}</div>
        <TextArea rows={2} maxLength={300} value={p.dislikes} onChange={e => set({ dislikes: e.target.value })} placeholder={t('e.g. “I hate lunges”')} />
        <div className="muted small" style={{ margin: '12px 0 6px' }}>{t('Anything you want the Coach to know')}</div>
        <TextArea rows={3} maxLength={600} value={p.notes} onChange={e => set({ notes: e.target.value })} placeholder={t('e.g. “I want visible arms progress by spring”')} />
      </>}
    </div>

    <div className="row" style={{ gap: 10 }}>
      {step > 0 && <Button onClick={() => setStep(step - 1)} style={{ flex: 1 }}>{t("Back")}</Button>}
      {!last
        ? <Button variant="primary" style={{ flex: 1 }} disabled={!canNext} onClick={() => setStep(step + 1)}>{t('Next')}</Button>
        : <Button variant="primary" style={{ flex: 1 }} icon="sparkles" disabled={busy} onClick={finish}>
          {editing ? t('Save') : t('Build my plan')}
        </Button>}
    </div>
    {!canNext && <div className="dim small" style={{ textAlign: 'center', marginTop: 10 }}>{t('Pick a goal and where you are starting from to continue.')}</div>}
    <div style={{ height: 20 }} />
  </div>
}
