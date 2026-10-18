import { useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { isTrainerRoutine } from '../lib/trainer.js'
import RoutineEditor from '../components/RoutineEditor.jsx'

export default function RoutineEdit() {
  const nav = useNavigate()
  const { id } = useParams()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const r = S.routines.find(x => x.id === id)
  useEffect(() => { if (!r) nav('/plan') }, [!!r])
  if (!r) return null

  // A routine from a trainer's plan is theirs to change, not ours — shown, never edited.
  const locked = isTrainerRoutine(S, id)
  return <RoutineEditor
    routine={r} unit={S.unit} body={S.body} back={() => nav('/plan')}
    readOnly={locked}
    banner={locked ? t('{0} set this routine for you. You can train it any time — ask them if something needs changing.', S.trainer?.by || t('Your trainer')) : null}
    edit={fn => update(s => { fn(s.routines.find(x => x.id === id).ex) })}
    set={(k, v) => update(s => { s.routines.find(x => x.id === id)[k] = v })}
    remove={() => {
      update(s => {
        s.routines = s.routines.filter(x => x.id !== id)
        Object.keys(s.week).forEach(k => { if (s.week[k] === id) delete s.week[k] })
        Object.keys(s.dayPlan).forEach(k => { if (s.dayPlan[k] === id) delete s.dayPlan[k] })
      })
      nav('/plan')
    }} />
}
