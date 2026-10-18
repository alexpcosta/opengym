import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { DAYN, uid, exCount } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dayAssignSheet, loadStarterPlan, planToolsSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'
import { coachAvailable } from '../lib/coach.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import { trainerLocked, isTrainerRoutine } from '../lib/trainer.js'
import { useUI } from '../store/useUI.js'
import { dietAvailable } from '../lib/diet.js'

export default function Plan() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const update = useStore(s => s.update)
  const locked = trainerLocked(S)
  const coachOn = coachAvailable(config, user, { demo: DEMO, mobile: MOBILE, locked })
  const toast = useUI(s => s.toast)
  // The week belongs to the trainer while their plan is active; a single day can still be
  // moved from Home (dayOverrideSheet), which is what "sick today" actually needs.
  const pickDay = d => locked ? toast(t('Your trainer sets your week — to move a single day, tap it on Home.')) : dayAssignSheet(d)

  const addRoutine = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id)
  }

  return <>
    <div className="hdr">
      <div><h1>{t('Plan')}</h1><div className="sub">{t('Your weekly routine')}</div></div>
      {coachOn && <button className="iconbtn" onClick={() => nav('/coach')} aria-label={t('Coach')} title={t('Coach')}><Icon name="sparkles" /></button>}
      {dietAvailable(user, { demo: DEMO, mobile: MOBILE }) && <button className="iconbtn" onClick={() => nav('/library')} aria-label={t('Exercises')} title={t('Exercises')}><Icon name="list" /></button>}
      <button className="iconbtn" onClick={planToolsSheet} aria-label={t('Share your plan')} title={t('Share your plan')}><Icon name="upload" /></button>
    </div>
    <div className="cols"><div>
      {locked && <div className="card row" style={{ gap: 10, borderColor: 'var(--acc)', marginTop: 8 }}>
        <span className="lrow-i" style={{ background: 'var(--acc)' }}><Icon name="clipboard" /></span>
        <div style={{ minWidth: 0 }}>
          <div className="small" style={{ fontWeight: 600 }}>{t('Plan from {0}', S.trainer.by || t('your trainer'))}</div>
          {S.trainer.note ? <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{S.trainer.note}</div>
            : <div className="small muted">{t('Your trainer manages this week and their routines.')}</div>}
        </div>
      </div>}
      <h4 className="sec">{t('Week schedule')}</h4>
      <div className="list" style={{ display: 'flex', flexDirection: 'column' }}>
        {[1, 2, 3, 4, 5, 6, 0].map(d => {
          const r = S.routines.find(x => x.id === S.week[d])
          return <div key={d} className="item" onClick={() => pickDay(d)}>
            <div className="grow"><div className="tt">{t(DAYN[d])}</div></div>
            {r ? <span className="tag acc"><Icon name={glyphOf(r.emoji)} />{r.name}</span> : <span className="tag">{t('Rest')}</span>}
            {locked ? <Icon name="lock" className="chev" /> : <Icon name="chevronRight" className="chev" />}</div>
        })}
      </div>
    </div><div>
      <div className="row between" style={{ marginTop: 22, marginBottom: 10 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Routines')}</h4>
        <Button size="sm" variant="tinted" icon="plus" onClick={addRoutine}>{t('New')}</Button>
      </div>
      {S.routines.length ? <div className="list">{S.routines.map(r => <div key={r.id} className="item" onClick={() => nav('/plan/r/' + r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {isTrainerRoutine(S, r.id) && <span className="tag acc">{t('Trainer')}</span>}
        <Icon name="chevronRight" className="chev" /></div>)}</div> : <>
        <div className="empty"><div className="ico"><Icon name="clipboard" /></div>{t('No routines yet.')}<br />{t('Create one or load the starter plan.')}</div>
        <Button icon="sparkles" onClick={loadStarterPlan}>{t('Load starter plan (Push / Pull / Legs)')}</Button>
      </>}
    </div></div>
  </>
}
