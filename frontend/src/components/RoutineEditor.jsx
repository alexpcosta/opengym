import { uid } from '../lib/format.js'
import { exOr } from '../lib/exercises.js'
import { t } from '../lib/i18n.js'
import { supersetUnits, cleanupSg, exLine } from '../lib/history.js'
import { Thumb } from './Media.jsx'
import { glyphPicker, exercisePicker, exConfigSheet, exerciseDetailSheet, confirmSheet } from '../sheets.jsx'
import Icon from './Icon.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { Button, Row, SelectRow } from './ui.jsx'
import { POLICIES_FOR, POLICY_NAME, POLICY_DESC } from '../lib/progression.js'
import BodyMap from './BodyMap.jsx'
import { loadOfRoutine, rankOf, MUSCLE_NAME } from '../lib/muscles.js'

/**
 * One routine's editor, independent of where the routine lives. Your own plan edits `S`;
 * a trainer edits a student's draft (store/useTrainer.js) — the same screen either way.
 *
 *   edit(fn)      mutate the routine's exercise list in place (fn receives the `ex` array)
 *   set(k, v)     set a top-level field: name, emoji, prog
 *   remove()      delete the routine (the caller navigates away)
 *   readOnly      a trainer's routine as the student sees it: everything visible, nothing editable
 */
export default function RoutineEditor({ routine: r, unit, body, back, backLabel, edit, set, remove, readOnly, banner }) {
  const move = (i, dir) => edit(ex => { const j = i + dir; if (j < 0 || j >= ex.length) return;[ex[i], ex[j]] = [ex[j], ex[i]]; cleanupSg(ex) })
  const toggleLink = i => edit(ex => {
    if (i < 1) return
    const cur = ex[i], prev = ex[i - 1]
    if (cur.sg && prev.sg && cur.sg === prev.sg) delete cur.sg
    else { const gid = prev.sg || ('sg' + uid()); prev.sg = gid; cur.sg = gid }
    cleanupSg(ex)
  })

  const units = supersetUnits(r.ex)
  const unitFirst = new Set(units.filter(u => u.length > 1).map(u => u[0]))
  const inSS = new Set(units.filter(u => u.length > 1).flat())

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={back} aria-label={backLabel || t('Plan')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, margin: '0 12px' }}>
        {readOnly
          ? <h1 style={{ margin: 0, fontSize: 20 }}>{r.name}</h1>
          : <input className="input" defaultValue={r.name} style={{ fontWeight: 600, fontSize: 20, letterSpacing: '-.021em' }}
            onChange={e => set('name', e.target.value.trim() || t('Routine'))} />}
      </div>
      {readOnly
        ? <span className="iconbtn" style={{ pointerEvents: 'none' }}><Icon name={glyphOf(r.emoji)} /></span>
        : <button className="iconbtn" aria-label={t('Pick an icon')} onClick={() => glyphPicker(r.emoji, g => set('emoji', g))}><Icon name={glyphOf(r.emoji)} /></button>}
    </div>

    {banner && <div className="card row" style={{ gap: 10, borderColor: 'var(--acc)' }}>
      <span className="lrow-i" style={{ background: 'var(--acc)' }}><Icon name="clipboard" /></span>
      <div className="small">{banner}</div>
    </div>}

    <div className="sect-b" style={{ marginBottom: 16 }}>
      {readOnly
        ? <Row icon="chartLine" title={t('Progression')} value={t(POLICY_NAME[r.prog || 'linear'])} />
        : <SelectRow icon="chartLine" title={t('Progression')} sheetTitle={t('Progression')}
          value={r.prog || 'linear'} onChange={v => set('prog', v)}
          options={POLICIES_FOR.reps.map(p => ({ value: p, label: t(POLICY_NAME[p]), subtitle: t(POLICY_DESC[p]) }))} />}
    </div>
    <div className="small dim" style={{ margin: '-10px 2px 16px' }}>
      {t('Applies to every exercise in this routine that does not set its own rule.')}
    </div>

    {r.ex.length ? <div className="list">{r.ex.map((e, i) => {
      // An unresolvable id is shown rather than skipped — hiding it left an entry you
      // could neither see nor delete, but that still turned up in the workout.
      const ex = exOr(e.id)
      const linkedPrev = i > 0 && e.sg && r.ex[i - 1].sg === e.sg
      return <div key={i}>
        {unitFirst.has(i) && <div className="ss-label"><Icon name="link" />{t('Superset')}</div>}
        <div className={'item' + (inSS.has(i) ? ' in-ss' : '')} onClick={() => {
          if (readOnly) { if (!ex.missing) exerciseDetailSheet(ex); return }
          exConfigSheet(ex, e, cfg => edit(x => { x[i] = { id: x[i].id, sg: x[i].sg, ...cfg } }), () => edit(x => { x.splice(i, 1); cleanupSg(x) }), r)
        }}>
          <Thumb ex={ex} />
          <div className="grow"><div className="tt capitalize">{ex.n}</div><div className="ss">{exLine(e, unit)}</div></div>
          {!readOnly && <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 'none', alignItems: 'center' }}>
            {i > 0 && <button className={'iconbtn' + (linkedPrev ? ' on-ss' : '')} title={t('Superset with exercise above')} style={{ width: 32, height: 28, borderRadius: 8, fontSize: 15 }} onClick={ev => { ev.stopPropagation(); toggleLink(i) }}><Icon name="link" /></button>}
            <div style={{ display: 'flex', gap: 2 }}>
              <button className="iconbtn" aria-label="Move up" style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }} onClick={ev => { ev.stopPropagation(); move(i, -1) }}><Icon name="chevronUp" /></button>
              <button className="iconbtn" aria-label="Move down" style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }} onClick={ev => { ev.stopPropagation(); move(i, 1) }}><Icon name="chevronDown" /></button>
            </div>
          </div>}
        </div>
      </div>
    })}</div> : <div className="empty"><div className="ico"><Icon name="dumbbell" /></div>{t('No exercises yet — add your first one.')}</div>}

    {/* Coverage of the routine as planned, so a gap shows up while you're building it
        rather than after a month of training around it. */}
    {r.ex.length > 0 && (() => {
      const load = loadOfRoutine(r)
      const { worked } = rankOf(load)
      return <div className="card" style={{ marginTop: 12 }}>
        <h2>{t('What this session hits')}</h2>
        <BodyMap load={load} body={body} />
        <div className="mchips">
          {worked.slice(0, 6).map(m => <span key={m} className="mchip">{t(MUSCLE_NAME[m])}</span>)}
        </div>
      </div>
    })()}

    {!readOnly && <>
      <div className="small dim row" style={{ margin: '10px 2px', gap: 5 }}><Icon name="link" style={{ fontSize: 13 }} />{t('Tap the link button on an exercise to superset it with the one above — you’ll do them back-to-back.')}</div>
      <Button variant="primary" onClick={() => exercisePicker(ex => exConfigSheet(ex, null, cfg => edit(x => { x.push({ id: ex.id, ...cfg }) }), null, r))} icon="plus">{t('Add exercise')}</Button>
      <div style={{ height: 10 }} />
      <Button variant="danger" onClick={() => confirmSheet({
        title: t('Delete routine?'), message: t('“{0}” and its exercises will be removed.', r.name), confirmText: t('Delete'), danger: true,
        onConfirm: remove
      })}>{t('Delete routine')}</Button>
    </>}
  </div>
}
