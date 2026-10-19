import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useSupp, isoAdd } from '../store/useSupp.js'
import { t } from '../lib/i18n.js'
import { DAYS, fmtDate, todayISO } from '../lib/format.js'
import { suppsOf, suppLocked, dueItems, slotsOf, ticksOf, dayStatus, weekdayOf, slotTime } from '../lib/supp.js'
import { markSuppsSeen } from '../lib/trainer.js'
import Icon from '../components/Icon.jsx'
import { Button, Check } from '../components/ui.jsx'

// The student's supplement list: what the trainer prescribed, and one tick per dose.
//
// A dose is a slot index, not a clock time, so ticking "the second one" means the same thing
// after the trainer moves 20:00 to 21:00 — and nothing is ever marked late. What is ticked
// lives per day on the server (store/useSupp.js), which is where the trainer's daily check
// reads it from.

const STATUS_COLOR = { ok: 'var(--acc)', partial: 'var(--orange)', none: 'var(--red)', rest: 'var(--surface-3)' }

/** The weekdays an item falls on, written out: "Mo Tu We Th Fr" or "every day". */
function daysLabel(item) {
  if (!item.days?.length) return t('every day')
  return [1, 2, 3, 4, 5, 6, 0].filter(d => item.days.includes(d)).map(d => t(DAYS[d])).join(' ')
}

export default function Supps() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const update = useStore(s => s.update)
  const days = useSupp(s => s.days)
  const pull = useSupp(s => s.pull)
  const toggle = useSupp(s => s.toggle)
  const takeAll = useSupp(s => s.takeAll)
  const today = todayISO()
  const [date, setDate] = useState(today)
  useEffect(() => { pull(isoAdd(date, -14), date) }, [date])
  // Opening the screen is looking at it: the Home card goes away.
  useEffect(() => { if (suppLocked(S)) update(s => { markSuppsSeen(s) }) }, [S.supps?.version])

  const items = suppsOf(S)
  const day = days[date] || { taken: {} }
  const weekday = weekdayOf(date)
  const due = dueItems(items, weekday)
  const { due: total, taken, status } = dayStatus(items, day, weekday)
  const label = date === today ? t('Today') : date === isoAdd(today, -1) ? t('Yesterday') : fmtDate(date, true)

  // The last fortnight at a glance, oldest first — the same squares the trainer sees.
  const strip = []
  for (let i = 13; i >= 0; i--) {
    const d = isoAdd(today, -i)
    const st = dayStatus(items, days[d], weekdayOf(d))
    strip.push({ d, status: d === today && st.status === 'none' ? 'rest' : st.status })
  }

  if (!items) return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 8 }}><h1 style={{ margin: 0 }}>{t('Supplements')}</h1></div>
    </div>
    <div className="card">
      <div className="row" style={{ gap: 10, marginBottom: 6 }}>
        <span className="lrow-i"><Icon name="capsule" /></span>
        <div style={{ fontSize: 19, fontWeight: 600 }}>{t('Nothing prescribed')}</div>
      </div>
      <div className="muted small">{user?.admin
        ? t('Write a list for yourself under Students → You → Supplements.')
        : t('When your trainer gives you supplements, they show up here with the days and the amount.')}</div>
    </div>
  </div>

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 8, minWidth: 0 }}><h1 style={{ margin: 0 }}>{t('Supplements')}</h1><div className="sub">{label}</div></div>
      <button className="iconbtn" onClick={() => setDate(isoAdd(date, -1))} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
      <button className="iconbtn" onClick={() => setDate(isoAdd(date, 1))} disabled={date >= today} aria-label={t('Next day')} style={date >= today ? { opacity: .35 } : null}><Icon name="chevronRight" /></button>
    </div>

    <div className="card">
      <div className="row between">
        <div style={{ minWidth: 0 }}>
          <div className="lbl2">{user?.admin ? t('Your supplements') : S.supps.by || t('Your trainer')}</div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.021em' }}>
            {status === 'rest' ? t('Nothing due today') : t('{0} of {1} doses', taken, total)}
          </div>
        </div>
        <span className="lrow-i" style={{ background: STATUS_COLOR[status], flex: 'none' }}><Icon name="capsule" /></span>
      </div>
      {S.supps.note && <div className="small muted" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{S.supps.note}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 4, marginTop: 10 }}>
        {strip.map(x => <div key={x.d} title={fmtDate(x.d, true)} style={{ aspectRatio: '1', borderRadius: 4, background: STATUS_COLOR[x.status] }} />)}
      </div>
      <div className="small dim" style={{ marginTop: 6 }}>{t('The last two weeks. Your trainer sees the same squares.')}</div>
    </div>

    {!due.length ? <div className="empty small">{t('Nothing to take on this day.')}</div> : <>
      {due.map(it => {
        const n = slotsOf(it)
        const ticks = ticksOf(day, it)
        return <div key={it.id} className="card">
          <div className="row between" style={{ gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{it.name}</div>
              <div className="small muted">{[it.dose, daysLabel(it), n > 1 ? t('{0}× a day', n) : null].filter(Boolean).join(' · ')}</div>
            </div>
            {ticks.size >= n && <span className="tag acc">{t('done')}</span>}
          </div>
          {it.note && <div className="small dim" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{it.note}</div>}
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {Array.from({ length: n }, (_, slot) => <div key={slot} className="row" style={{ gap: 6 }}>
              <Check checked={ticks.has(slot)} onChange={() => toggle(date, it.id, slot)} />
              <span className="small muted">{slotTime(it, slot) || (n > 1 ? t('dose {0}', slot + 1) : t('taken'))}</span>
            </div>)}
          </div>
        </div>
      })}
      {taken < total && <Button variant="primary" icon="check" onClick={() => takeAll(date, due.map(it => ({ id: it.id, slots: slotsOf(it) })))}>
        {t('Tick everything for this day')}</Button>}
    </>}
    {date !== today && <><div style={{ height: 8 }} /><Button size="sm" onClick={() => setDate(today)}>{t('Back to today')}</Button></>}
    <div className="small dim" style={{ margin: '14px 2px 0' }}>{t('Supplements are food, not medicine. Anything a doctor prescribed belongs with your doctor, not here.')}</div>
    <div style={{ height: 30 }} />
  </div>
}
