// Trainer mode, admin side: the draft of the plan being written for one student.
//
// Kept outside the main store on purpose — it is not this profile's data, it never syncs to
// this profile's state, and losing it on reload is the right failure (the server still has
// the last version that was sent). It survives moving between the student screen and the
// routine editor, which is all a draft has to do.
import { create } from 'zustand'
import { uid } from '../lib/format.js'
import { cleanEx } from '../lib/plan-share.js'
import { registerForeign } from '../lib/exercises.js'
import { DEFAULT_GLYPH } from '../lib/glyphs.js'
import { fetchStudent, sendPlan, removePlan, sendDiet, removeDiet, fetchStudentDiet } from '../lib/trainer-api.js'
import { computeTargets, toKg } from '../lib/nutrition.js'

const clone = o => JSON.parse(JSON.stringify(o))
const EMPTY = { routines: [], week: {}, customEx: [], note: '' }
const draftFrom = plan => plan ? clone({ routines: plan.routines || [], week: plan.week || {}, customEx: plan.customEx || [], note: plan.note || '' }) : clone(EMPTY)
export const newTrainerId = () => 't' + uid()

/** Calculator inputs for a student: their own profile and latest weight, as far as they go. */
export function calcFromStudent(d) {
  const p = d?.profile || {}
  const bw = d?.bodyweight?.[d.bodyweight.length - 1]
  return {
    sex: p.sex || (d?.body === 'female' ? 'female' : 'male'), birth: p.birth || '', heightCm: p.heightCm || null,
    kg: bw ? Math.round(toKg(bw.w, d.unit) * 10) / 10 : null,
    activity: p.activity || 'moderate', goal: p.goal || 'maintain', pace: p.pace || 0.5, manual: false
  }
}
/** The targets a diet draft stands for: the calculator's, unless the trainer typed their own. */
export function draftTargets(draft, today) {
  if (!draft) return null
  if (draft.calc?.manual) return draft.targets?.kcal ? draft.targets : null
  const c = draft.calc ? computeTargets(draft.calc, draft.calc.kg, today) : null
  return c ? { kcal: c.kcal, p: c.p, c: c.c, f: c.f } : null
}
const dietDraftFrom = (diet, d) => diet
  ? clone({ targets: diet.targets, calc: diet.calc || { ...calcFromStudent(d), manual: true }, meals: diet.meals || [], note: diet.note || '' })
  : { targets: null, calc: calcFromStudent(d), meals: [], note: '' }

export const useTrainer = create((set, get) => ({
  sid: null,
  student: null,      // GET /api/trainer/student
  draft: null,        // { routines, week, customEx, note }
  baseVersion: 0,
  dirty: false,
  loading: false,
  error: null,

  /** Load a student; keeps an unsaved draft for the same student unless `fresh`. */
  async load(sid, { fresh = false } = {}) {
    set({ loading: true, error: null })
    try {
      const d = await fetchStudent(sid)
      registerForeign([...(d.customEx || []), ...(d.plan?.customEx || [])])
      // `fresh`: true, 'plan' or 'diet' — which unsaved draft to drop (the one just sent).
      const same = get().sid === sid
      const keepPlan = same && get().dirty && fresh !== true && fresh !== 'plan'
      const keepDiet = same && get().dietDirty && fresh !== true && fresh !== 'diet'
      set({
        sid, student: d, loading: false,
        ...(keepPlan ? {} : { draft: draftFrom(d.plan), baseVersion: d.planVersion || 0, dirty: false }),
        ...(keepDiet ? {} : { dietDraft: dietDraftFrom(d.diet, d), dietBase: d.dietVersion || 0, dietDirty: false })
      })
    } catch (e) { set({ loading: false, error: e.message }) }
  },

  edit(fn) {
    const draft = clone(get().draft || EMPTY)
    fn(draft)
    set({ draft, dirty: true })
  },

  addRoutine(name) {
    const r = { id: newTrainerId(), name, emoji: DEFAULT_GLYPH, ex: [] }
    get().edit(d => { d.routines.push(r) })
    return r.id
  },

  removeRoutine(rid) {
    get().edit(d => {
      d.routines = d.routines.filter(r => r.id !== rid)
      Object.keys(d.week).forEach(k => { if (d.week[k] === rid) delete d.week[k] })
    })
  },

  /** Copy routines (and optionally the week) from a plan the trainer already has — their own. */
  copyFrom(S, { week = true } = {}) {
    const map = {}
    get().edit(d => {
      ;(S.routines || []).forEach(r => {
        const id = newTrainerId()
        map[r.id] = id
        d.routines.push({ id, name: r.name, emoji: r.emoji, ...(r.prog ? { prog: r.prog } : {}), ex: (r.ex || []).map(cleanEx) })
      })
      if (week) {
        for (let i = 0; i < 7; i++) delete d.week[i]
        Object.entries(S.week || {}).forEach(([k, rid]) => { if (map[rid]) d.week[k] = map[rid] })
      }
      const used = new Set(d.routines.flatMap(r => r.ex.map(e => e.id)))
      const have = new Set(d.customEx.map(c => c.id))
      ;(S.customEx || []).forEach(c => { if (used.has(c.id) && !have.has(c.id)) d.customEx.push({ id: c.id, n: c.n, bp: c.bp, ...(c.desc ? { desc: c.desc } : {}) }) })
    })
  },

  discard() {
    set({ draft: draftFrom(get().student?.plan), dirty: false })
  },

  /** Send the draft. `mine` is the trainer's own state: custom exercises they picked travel along. */
  async save(mine) {
    const { sid, draft, baseVersion } = get()
    const used = new Set(draft.routines.flatMap(r => r.ex.map(e => e.id)))
    const pool = new Map()
    ;[...(mine?.customEx || []), ...(get().student?.customEx || []), ...draft.customEx].forEach(c => { if (used.has(c.id)) pool.set(c.id, { id: c.id, n: c.n, bp: c.bp, ...(c.desc ? { desc: c.desc } : {}) }) })
    const plan = {
      routines: draft.routines.map(r => ({ id: r.id, name: r.name, emoji: r.emoji, ...(r.prog ? { prog: r.prog } : {}), ex: r.ex.map(cleanEx) })),
      week: draft.week,
      customEx: [...pool.values()],
      note: draft.note
    }
    const res = await sendPlan(sid, baseVersion, plan)
    set({ dirty: false, baseVersion: res.version })
    await get().load(sid, { fresh: 'plan' })
    return res
  },

  async remove() {
    const res = await removePlan(get().sid)
    await get().load(get().sid, { fresh: 'plan' })
    return res
  },

  /* ------------------------------ diet ------------------------------ */
  dietDraft: null,    // { targets, calc, meals, note }
  dietBase: 0,
  dietDirty: false,

  editDiet(fn) {
    const dietDraft = clone(get().dietDraft || dietDraftFrom(null, get().student))
    fn(dietDraft)
    set({ dietDraft, dietDirty: true })
  },
  discardDiet() {
    set({ dietDraft: dietDraftFrom(get().student?.diet, get().student), dietDirty: false })
  },
  /** Start from another student's diet; the calculator keeps this student's own numbers. */
  async copyDietFrom(otherId) {
    const { diet } = await fetchStudentDiet(otherId)
    if (!diet) return false
    get().editDiet(x => {
      x.meals = clone(diet.meals || [])
      x.note = diet.note || ''
      if (diet.targets?.kcal) { x.targets = clone(diet.targets); x.calc = { ...(x.calc || calcFromStudent(get().student)), manual: true } }
    })
    return true
  },
  async saveDiet(today) {
    const { sid, dietDraft, dietBase } = get()
    const targets = draftTargets(dietDraft, today)
    const res = await sendDiet(sid, dietBase, { ...dietDraft, targets })
    set({ dietDirty: false })
    await get().load(sid, { fresh: 'diet' })
    return res
  },
  async removeDiet() {
    const res = await removeDiet(get().sid)
    await get().load(get().sid, { fresh: 'diet' })
    return res
  }
}))
