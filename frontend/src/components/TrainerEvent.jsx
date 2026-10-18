import { t } from '../lib/i18n.js'
import { fmtDate, fmtDur, fmtNum, relTime } from '../lib/format.js'
import Icon from './Icon.jsx'

// One line of the trainer's feed (api/trainer/store.js events). Rendered on the client, in
// the trainer's language — the server stores facts, not sentences.
const LOOK = {
  done: { icon: 'checkCircle', tint: 'var(--green)' },
  pr: { icon: 'trophy', tint: 'var(--yellow)' },
  missed: { icon: 'xmark', tint: 'var(--red)' },
  'diet-missing': { icon: 'clipboard', tint: 'var(--orange)' },
  'diet-off': { icon: 'target', tint: 'var(--orange)' },
  'diet-ok': { icon: 'target', tint: 'var(--green)' },
  summary: { icon: 'list', tint: 'var(--indigo)' }
}

export function eventText(e) {
  const who = e.sname || t('A student')
  const d = e.data || {}
  switch (e.kind) {
    case 'done': return {
      title: t('{0} finished {1}', who, d.routine || t('Freestyle')),
      sub: [fmtDur(d.dur || 0), t('{0} sets', d.sets || 0), fmtNum(d.vol || 0) + ' ' + (d.unit || 'kg'), ...(d.prs?.length ? [t('{0} PR', d.prs.length)] : [])].join(' · ')
    }
    case 'pr': return { title: t('{0} set a new record', who), sub: (d.prs || []).join(', ') }
    case 'missed': return { title: t('{0} skipped {1}', who, d.routine || t('a planned workout')), sub: t('Planned for {0}, nothing logged.', fmtDate(e.date, true)) }
    case 'diet-missing': return { title: t('{0} logged no food', who), sub: fmtDate(e.date, true) }
    case 'diet-off': return { title: t('{0} was off the diet target', who), sub: t('{0} of {1} kcal · protein {2} of {3} g', Math.round(d.kcal || 0), Math.round(d.target || 0), Math.round(d.p || 0), Math.round(d.pt || 0)) }
    case 'summary': return { title: t('Diet summary'), sub: t('{0} on target · {1} off · {2} not logged', d.ok || 0, d.off || 0, d.none || 0) }
    default: return { title: e.kind, sub: '' }
  }
}

export default function TrainerEvent({ e, unread, onClick }) {
  const look = LOOK[e.kind] || { icon: 'info', tint: 'var(--grey)' }
  const { title, sub } = eventText(e)
  return <div className="item" onClick={onClick} style={unread ? { boxShadow: 'inset 3px 0 0 var(--acc)' } : null}>
    <span className="lrow-i" style={{ background: look.tint }}><Icon name={look.icon} /></span>
    <div className="grow"><div className="tt" style={{ fontWeight: unread ? 600 : 400 }}>{title}</div>
      {sub && <div className="ss">{sub}</div>}</div>
    <span className="small dim" style={{ flex: 'none' }}>{relTime(e.at)}</span>
  </div>
}
