// Trainer mode, student side: applying the plan a trainer (an admin of this instance) wrote.
//
// The plan lives on the server, versioned (api/trainer/store.js), and every device of the
// student pulls it and applies it here — inside store.update, so it syncs like any other edit.
// Routines keep the trainer's ids (`t…`) across updates, which is what keeps a student's
// history and progression attached to "Upper A" after the trainer changes its sets.
//
// While a plan is active its routines and the week are the trainer's: the UI shows them
// read-only. The student can still train anything, reschedule a single day, and keep
// routines of their own next to the trainer's.

import { mergeCustomEx } from './plan-share.js'

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

/** Ids of the routines the current trainer plan put in this profile. */
export const trainerRoutineIds = S => (S?.trainer && !S.trainer.removed ? S.trainer.rids || [] : [])
export const isTrainerRoutine = (S, id) => trainerRoutineIds(S).includes(id)
/** True while a trainer plan is active — the week and the trainer's routines are locked. */
export const trainerLocked = S => trainerRoutineIds(S).length > 0
/** The "your trainer updated your plan" banner: a version the student has not looked at yet. */
export const trainerPlanUnseen = S => trainerLocked(S) && (S.trainer.seenVersion || 0) < S.trainer.version

function dropRefs(s, ids) {
  if (!ids.size) return
  WEEKDAYS.forEach(d => { if (ids.has(s.week?.[d])) delete s.week[d] })
  Object.keys(s.dayPlan || {}).forEach(k => { if (ids.has(s.dayPlan[k])) delete s.dayPlan[k] })
}

/**
 * Apply a plan from GET /api/trainer/my-plan to draft state `s` (call inside store.update).
 * A null, removed or empty plan takes the trainer's routines away and unlocks the plan.
 */
export function applyTrainerPlan(s, plan) {
  s.routines = s.routines || []
  s.week = s.week || {}
  s.dayPlan = s.dayPlan || {}
  const prevIds = new Set(s.trainer?.rids || [])

  if (!plan || plan.removed || !(plan.routines || []).length) {
    s.routines = s.routines.filter(r => !prevIds.has(r.id))
    dropRefs(s, prevIds)
    // Keep the version: a removal the device has applied must not be re-applied every boot.
    s.trainer = plan ? { version: plan.version, removed: true, rids: [] } : null
    return
  }

  const exIdMap = mergeCustomEx(s, plan.customEx)
  const nextIds = new Set(plan.routines.map(r => r.id))
  const gone = new Set([...prevIds].filter(id => !nextIds.has(id)))

  const own = s.routines.filter(r => !prevIds.has(r.id) && !nextIds.has(r.id))
  const theirs = plan.routines.map(r => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    ...(r.prog ? { prog: r.prog } : {}),
    ex: (r.ex || []).map(e => ({ ...e, id: exIdMap[e.id] || e.id }))
  }))
  // The trainer's routines first, in the order they were written; the student's own after.
  s.routines = [...theirs, ...own]

  // The trainer's week replaces the weekly schedule outright. A half-merged week would mix
  // two plans; single-day reschedules (dayPlan) survive unless they point at a gone routine.
  WEEKDAYS.forEach(d => { delete s.week[d] })
  Object.entries(plan.week || {}).forEach(([d, rid]) => { if (nextIds.has(rid)) s.week[d] = rid })
  dropRefs(s, gone)

  s.trainer = {
    version: plan.version,
    rids: [...nextIds],
    by: plan.by || '',
    note: plan.note || '',
    updatedAt: plan.updatedAt || null,
    seenVersion: s.trainer?.seenVersion || 0
  }
}

/** Mark the current plan version as seen (dismisses the Home banner). */
export function markPlanSeen(s) {
  if (s.trainer) s.trainer.seenVersion = s.trainer.version
}

/* ------------------------------ diet ------------------------------ */
// A trainer's diet arrives the same way as the plan (GET /api/trainer/my-diet, versioned) and
// is kept whole in S.diet — a few kilobytes of targets and menu. While it is there its targets
// replace the student's own and its meals are the diary's meals; the diary itself is untouched.

export const dietLocked = S => !!(S?.diet && !S.diet.removed && S.diet.targets?.kcal)
export const dietUnseen = S => dietLocked(S) && (S.diet.seenVersion || 0) < S.diet.version

/** Apply a diet from GET /api/trainer/my-diet to draft state `s` (inside store.update). */
export function applyTrainerDiet(s, diet) {
  if (!diet || diet.removed || !diet.targets?.kcal) {
    s.diet = diet ? { version: diet.version, removed: true } : null
    return
  }
  s.diet = {
    version: diet.version,
    targets: { kcal: diet.targets.kcal, p: diet.targets.p || 0, c: diet.targets.c || 0, f: diet.targets.f || 0 },
    meals: (diet.meals || []).map(m => ({ id: m.id, name: m.name, ...(m.time ? { time: m.time } : {}), items: m.items || [] })),
    by: diet.by || '',
    note: diet.note || '',
    updatedAt: diet.updatedAt || null,
    seenVersion: s.diet?.seenVersion || 0
  }
}
export function markDietSeen(s) {
  if (s.diet) s.diet.seenVersion = s.diet.version
}

/* ------------------------------ supplements ------------------------------ */
// The supplement list arrives the same way as the plan and the diet (GET
// /api/trainer/my-supps, versioned) and is kept whole in S.supps — names, amounts, the days
// and times. What the student ticked is NOT here: it is a day at a time on the server
// (store/useSupp.js), because the trainer's daily check has to read it.

/** Apply a list from GET /api/trainer/my-supps to draft state `s` (inside store.update). */
export function applyTrainerSupps(s, supps) {
  if (!supps || supps.removed || !(supps.items || []).length) {
    s.supps = supps ? { version: supps.version, removed: true } : null
    return
  }
  s.supps = {
    version: supps.version,
    items: (supps.items || []).map(i => ({
      id: i.id, name: i.name, dose: i.dose || '', days: i.days || [], perDay: i.perDay || 1,
      ...(i.times?.length ? { times: i.times } : {}), ...(i.note ? { note: i.note } : {})
    })),
    by: supps.by || '',
    note: supps.note || '',
    updatedAt: supps.updatedAt || null,
    seenVersion: s.supps?.seenVersion || 0
  }
}
export function markSuppsSeen(s) {
  if (s.supps) s.supps.seenVersion = s.supps.version
}
