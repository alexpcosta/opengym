import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { useTrainer } from '../store/useTrainer.js'
import { t } from '../lib/i18n.js'
import { DAYS, fmtDate, relTime } from '../lib/format.js'
import { dueItems, slotsOf, weekdayOf, MAX_PER_DAY } from '../lib/supp.js'
import { fetchStudents } from '../lib/trainer-api.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Segmented, TextArea, TextField } from '../components/ui.jsx'

// Trainer side: the supplement list for one student — what, how much, which days, how many
// times a day — and how the last fortnight of ticks went.
//
// Deliberately a short form. A supplement here is a name, an amount in the trainer's own words
// ("5 g", "2 cápsulas") and a schedule. There is no route, no mg/ml and no cycle: this is the
// adherence list the two of them tick off together, and anything a doctor or pharmacist should
// be reading does not belong in a gym app.

const ui = () => useUI.getState()
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const STATUS_COLOR = { ok: 'var(--acc)', partial: 'var(--orange)', none: 'var(--red)', rest: 'var(--surface-3)' }

/* ---------------- one supplement ---------------- */
function SuppSheet({ close, itemId }) {
  const { suppDraft, editSupps } = useTrainer()
  const item = suppDraft?.items.find(i => i.id === itemId)
  if (!item) return null
  const set = fn => editSupps(x => { fn(x.items.find(i => i.id === itemId)) })
  const everyDay = !item.days?.length
  const toggleDay = d => set(it => {
    // "every day" is stored as an empty list; opening it up starts from all seven.
    const cur = new Set(it.days?.length ? it.days : [0, 1, 2, 3, 4, 5, 6])
    if (cur.has(d)) { if (cur.size === 1) return; cur.delete(d) } else cur.add(d)
    it.days = cur.size === 7 ? [] : [...cur].sort()
  })
  // `times` is positional: times[i] labels dose i, '' means "no particular time". Never sorted
  // — the slot index is what a student's tick is stored under, so reordering would relabel a
  // dose that has already been marked.
  const times = item.times || []
  const perDay = item.perDay || times.filter(Boolean).length || 1
  const setPerDay = n => set(it => { it.perDay = n; if (it.times) it.times = it.times.slice(0, n) })
  const setTime = (i, v) => set(it => {
    const list = Array.from({ length: perDay }, (_, k) => (k === i ? v : (it.times?.[k] || '')))
    if (list.some(Boolean)) it.times = list; else delete it.times
  })

  return <>
    <h3>{item.name || t('Supplement')}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{t('Nothing is sent until you tap Send.')}</div>
    <TextField placeholder={t('Name (e.g. Creatine)')} value={item.name} onChange={e => { const v = e.target.value; set(it => { it.name = v.slice(0, 60) }) }} />
    <div style={{ height: 8 }} />
    <TextField placeholder={t('Amount (e.g. 5 g, 2 capsules)')} value={item.dose || ''} onChange={e => { const v = e.target.value; set(it => { it.dose = v.slice(0, 40) }) }} />

    <h4 className="sec">{t('Days')}</h4>
    <Segmented value={everyDay ? 'all' : 'some'} onChange={v => set(it => { it.days = v === 'all' ? [] : [1, 2, 3, 4, 5] })}
      options={[{ value: 'all', label: t('Every day') }, { value: 'some', label: t('Chosen days') }]} />
    {!everyDay && <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
      {WEEK_ORDER.map(d => <button key={d} className={'btn sm' + (item.days.includes(d) ? ' primary' : '')} style={{ minWidth: 44 }} onClick={() => toggleDay(d)}>{t(DAYS[d])}</button>)}
    </div>}

    <h4 className="sec">{t('Times a day')}</h4>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      {Array.from({ length: MAX_PER_DAY }, (_, i) => i + 1).map(n =>
        <button key={n} className={'btn sm' + (perDay === n ? ' primary' : '')} style={{ minWidth: 40 }} onClick={() => setPerDay(n)}>{n}</button>)}
    </div>
    <div className="small dim" style={{ margin: '8px 2px 0' }}>{t('Add a time for each dose if it matters when it is taken.')}</div>
    <div className="row cfgrow" style={{ marginTop: 10, flexWrap: 'wrap' }}>
      {Array.from({ length: perDay }, (_, i) => <label key={i} className="grow">
        <div className="small dim" style={{ marginBottom: 4 }}>{t('dose {0}', i + 1)}</div>
        <input type="time" className="input" value={times[i] || ''} onChange={e => setTime(i, e.target.value)} />
      </label>)}
    </div>

    <h4 className="sec">{t('Note')}</h4>
    <TextArea rows={2} value={item.note || ''} placeholder={t('e.g. with water, after training (optional).')}
      onChange={e => { const v = e.target.value; set(it => { if (v) it.note = v.slice(0, 200); else delete it.note }) }} />

    <div style={{ height: 14 }} />
    <Button variant="danger" onClick={() => { close(); editSupps(x => { x.items = x.items.filter(i => i.id !== itemId) }) }}>{t('Remove from the list')}</Button>
  </>
}

/* ---------------- one day of ticks ---------------- */
function DayDetail({ d, items }) {
  const weekday = weekdayOf(d.d)
  const due = dueItems(items, weekday)
  return <>
    <h3>{fmtDate(d.d, true)}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{d.status === 'rest' ? t('Nothing was due.') : t('{0} of {1} doses', d.taken, d.due)}</div>
    {due.length ? <div className="list">{due.map(it => {
      const n = slotsOf(it)
      const got = (d.ticks?.[it.id] || []).filter(s => s >= 0 && s < n).length
      return <div key={it.id} className="item">
        <span className="lrow-i" style={{ background: got >= n ? 'var(--acc)' : got ? 'var(--orange)' : 'var(--red)' }}><Icon name={got >= n ? 'check' : 'xmark'} /></span>
        <div className="grow"><div className="tt">{it.name}</div><div className="ss">{[it.dose, n > 1 ? got + ' / ' + n : null].filter(Boolean).join(' · ')}</div></div>
      </div>
    })}</div> : <div className="empty small">{t('Nothing was due on this day.')}</div>}
  </>
}

function LogReview({ d }) {
  const items = d.supps?.items || []
  const label = s => s === 'ok' ? t('all ticked') : s === 'partial' ? t('partly ticked') : s === 'none' ? t('not ticked') : t('nothing due')
  const days = (d.suppLog || []).slice().reverse()
  return <>
    <h4 className="sec">{t('Last 14 days')}</h4>
    {!items.length && <div className="small dim" style={{ margin: '-4px 2px 8px' }}>{t('No list yet — send one to start tracking the doses.')}</div>}
    <div className="list">{days.map(x => <div key={x.d} className="item" onClick={() => ui().openSheet(() => <DayDetail d={x} items={items} />)}>
      <span style={{ width: 8, height: 34, borderRadius: 4, background: x.d === d.today && x.status === 'none' ? 'var(--surface-3)' : STATUS_COLOR[x.status], flex: 'none' }} />
      <div className="grow"><div className="tt">{fmtDate(x.d, true)}</div>
        <div className="ss">{x.status === 'rest' ? t('nothing due') : t('{0} of {1} doses', x.taken, x.due)}</div></div>
      <span className="tag" style={{ color: STATUS_COLOR[x.status] }}>{label(x.status)}</span>
    </div>)}</div>
  </>
}

/* ---------------- the tab ---------------- */
export default function TrainerSuppsTab({ d }) {
  const toast = useUI(s => s.toast)
  const { suppDraft: x, suppDirty, editSupps, addSupp, saveSupps, removeSupps, discardSupps, copySuppsFrom } = useTrainer()
  const [busy, setBusy] = useState(false)
  const [others, setOthers] = useState([])
  useEffect(() => { fetchStudents().then(r => setOthers(r.students.filter(s => s.id !== d.user.id && s.supps))).catch(() => {}) }, [d.user.id])
  if (!x) return null

  const status = !d.supps ? t('No supplements sent yet.')
    : d.supps.ackedVersion >= d.suppVersion ? t('Version {0} is on {1}’s phone (opened {2}).', d.suppVersion, d.user.name, relTime(d.supps.ackedAt))
    : t('Version {0} sent {1} — {2} has not opened the app since.', d.suppVersion, relTime(d.supps.updatedAt), d.user.name)
  const incomplete = x.items.filter(i => !i.name.trim()).length

  const send = async () => {
    setBusy(true)
    try { await saveSupps(); toast(t('Supplements sent to {0}', d.user.name)) } catch (e) { toast(e.message) }
    setBusy(false)
  }
  const openItem = id => ui().openSheet(close => <SuppSheet close={close} itemId={id} />)
  const summary = it => {
    const n = slotsOf(it)
    const days = !it.days?.length ? t('every day') : WEEK_ORDER.filter(dd => it.days.includes(dd)).map(dd => t(DAYS[dd])).join(' ')
    const labelled = (it.times || []).filter(Boolean)
    return [it.dose, days, labelled.length === n ? labelled.join(', ') : n > 1 ? t('{0}× a day', n) : null].filter(Boolean).join(' · ')
  }

  return <>
    <div className="small muted" style={{ margin: '0 2px 10px' }}>{status}</div>

    <h4 className="sec">{t('The list')}</h4>
    {x.items.length ? <div className="list">{x.items.map(it => <div key={it.id} className="item" onClick={() => openItem(it.id)}>
      <span className="lrow-i" style={{ background: 'var(--teal)' }}><Icon name="capsule" /></span>
      <div className="grow"><div className="tt">{it.name || t('(no name)')}</div><div className="ss">{summary(it)}</div></div>
      <Icon name="chevronRight" className="chev" />
    </div>)}</div> : <div className="empty small">{t('Nothing on the list yet.')}</div>}

    <div style={{ height: 8 }} />
    <Button size="sm" icon="plus" onClick={() => openItem(addSupp(''))}>{t('Add a supplement')}</Button>

    <h4 className="sec">{t('Note for {0}', d.user.name)}</h4>
    <TextArea rows={3} value={x.note} placeholder={t('Shown with the list on their phone (optional).')}
      onChange={e => { const v = e.target.value; editSupps(y => { y.note = v.slice(0, 1000) }) }} />

    <div style={{ height: 14 }} />
    <Button variant="primary" icon="upload" disabled={busy || !x.items.length || !!incomplete || (!suppDirty && !!d.supps)} onClick={send}>
      {d.supps ? t('Send update to {0}', d.user.name) : t('Send supplements to {0}', d.user.name)}</Button>
    {!!incomplete && <div className="small" style={{ color: 'var(--orange)', margin: '8px 2px 0' }}>{t('Give every supplement a name first.')}</div>}
    {suppDirty && <><div style={{ height: 8 }} /><Button onClick={discardSupps}>{t('Discard changes')}</Button></>}
    {others.length > 0 && <><div style={{ height: 8 }} /><Button icon="clipboard" onClick={() => ui().openSheet(close => <>
      <h3>{t('Copy a list from')}</h3>
      <div className="list">{others.map(o => <div key={o.id} className="item" onClick={() => { close(); copySuppsFrom(o.id).then(ok => toast(ok ? t('Copied — review it, then send.') : t('That student has no list.'))).catch(e => toast(e.message)) }}>
        <div className="grow"><div className="tt">{o.self ? t('You') : o.name}</div></div><Icon name="chevronRight" className="chev" /></div>)}</div>
    </>)}>{t('Copy from another student')}</Button></>}
    {d.supps && <><div style={{ height: 8 }} /><Button variant="danger" onClick={() => confirmSheet({
      title: t('Remove the supplements?'), message: t('{0}’s app drops the list. What they already ticked stays.', d.user.name),
      confirmText: t('Remove'), danger: true, onConfirm: () => removeSupps().then(() => toast(t('Supplements removed'))).catch(e => toast(e.message))
    })}>{t('Remove the list')}</Button></>}

    <LogReview d={d} />
  </>
}
