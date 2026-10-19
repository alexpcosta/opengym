import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useTrainer } from '../store/useTrainer.js'
import { t } from '../lib/i18n.js'
import RoutineEditor from '../components/RoutineEditor.jsx'

// A routine in the plan a trainer is drafting for a student. Same editor as your own plan;
// the edits go to the draft, and reach the student only when the trainer sends it.
export default function TrainerRoutineEdit() {
  const nav = useNavigate()
  const { sid, rid } = useParams()
  const user = useStore(s => s.user)
  const { draft, student, edit, removeRoutine, load } = useTrainer()
  // Opened directly (a reload, a bookmark): there is no draft yet — load the student first.
  useEffect(() => { if (user?.admin && (!student || student.user.id !== sid)) load(sid) }, [sid])
  const r = draft?.routines.find(x => x.id === rid)
  const back = () => nav('/trainer/s/' + sid)
  useEffect(() => { if (draft && student?.user.id === sid && !r) back() }, [!!draft, !!r])
  if (!user?.admin || !r) return null

  return <RoutineEditor
    routine={r} unit={student?.unit || 'kg'} body={student?.body || 'male'}
    back={back} backLabel={student?.user.name || t('Students')}
    banner={t('Part of {0}’s plan — changes are sent when you tap Send on their page.', student?.user.name || '')}
    edit={fn => edit(d => { fn(d.routines.find(x => x.id === rid).ex) })}
    set={(k, v) => edit(d => { d.routines.find(x => x.id === rid)[k] = v })}
    remove={() => { removeRoutine(rid); back() }} />
}
