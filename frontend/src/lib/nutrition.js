// Daily calorie and macro targets from a profile and a goal, and the arithmetic of a food diary.
//
// The targets are a starting point a trainer or the student can override, not a prescription:
//   1. Basal metabolic rate by Mifflin–St Jeor (the equation most validated for adults today).
//   2. × an activity factor → maintenance calories (TDEE).
//   3. ± a deficit/surplus from the weekly pace (≈7700 kcal per kg of body weight), kept inside
//      −25 % / +15 % of maintenance and never below the basal rate or 1200 kcal.
//   4. Protein by body weight for the goal, fat at 25 % of calories (at least 0.6 g/kg), and the
//      rest as carbohydrate.
// Every step is reported back in `why`, so the number on screen can always say where it came from.

export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9 }
export const ACTIVITY_NAME = { sedentary: 'Sedentary', light: 'Light', moderate: 'Moderate', active: 'Active', very: 'Very active' }
export const ACTIVITY_DESC = {
  sedentary: 'Desk job, little exercise',
  light: 'Exercise 1–3 days a week',
  moderate: 'Exercise 3–5 days a week',
  active: 'Hard exercise 6–7 days a week',
  very: 'Physical job plus training'
}
export const GOALS = ['lose', 'maintain', 'gain']
export const GOAL_NAME = { lose: 'Lose weight', maintain: 'Maintain', gain: 'Gain muscle' }
export const PACES = [0.25, 0.5, 0.75, 1]
const PROTEIN_PER_KG = { lose: 2.0, maintain: 1.6, gain: 1.8 }
const KCAL_PER_KG_WEEK = 7700 / 7
const LB = 0.45359237

export const toKg = (w, unit) => (unit === 'lb' ? w * LB : w)

export function ageOn(birth, today) {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null
  const [by, bm, bd] = birth.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

/** Mifflin–St Jeor: 10·kg + 6.25·cm − 5·age + 5 (men) / − 161 (women). */
export const bmr = ({ sex, kg, cm, age }) => 10 * kg + 6.25 * cm - 5 * age + (sex === 'female' ? -161 : 5)

/** True when the profile has everything the calculation needs. */
export function profileComplete(p, kg, today) {
  const age = ageOn(p?.birth, today)
  return !!(p && (p.sex === 'male' || p.sex === 'female') && p.heightCm > 0 && kg > 0 && age >= 14 && age <= 100 && ACTIVITY[p.activity] && GOALS.includes(p.goal))
}

/**
 * Targets for one day: { kcal, p, c, f, fib, bmr, tdee, why } — or null if the profile is
 * incomplete. `kg` is the current body weight in kilograms; `today` an ISO date.
 */
export function computeTargets(p, kg, today) {
  if (!profileComplete(p, kg, today)) return null
  const age = ageOn(p.birth, today)
  const base = bmr({ sex: p.sex, kg, cm: p.heightCm, age })
  const factor = ACTIVITY[p.activity]
  const tdee = base * factor
  const pace = p.goal === 'maintain' ? 0 : (PACES.includes(p.pace) ? p.pace : 0.5)
  let delta = (p.goal === 'lose' ? -1 : p.goal === 'gain' ? 1 : 0) * pace * KCAL_PER_KG_WEEK
  delta = Math.max(-0.25 * tdee, Math.min(0.15 * tdee, delta))
  const floor = Math.max(1200, base)
  const raw = tdee + delta
  const kcal = Math.round(Math.max(floor, raw) / 10) * 10
  const protein = Math.round(kg * PROTEIN_PER_KG[p.goal])
  const fat = Math.round(Math.max((kcal * 0.25) / 9, kg * 0.6))
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  const why = [
    ['Basal metabolism (Mifflin–St Jeor): {0} kcal', Math.round(base)],
    ['× {0} for your activity = {1} kcal to maintain', factor, Math.round(tdee)]
  ]
  if (p.goal !== 'maintain') why.push([p.goal === 'lose' ? '− {0} kcal a day to lose about {1} kg a week' : '+ {0} kcal a day to gain about {1} kg a week', Math.round(Math.abs(delta)), pace])
  if (raw < floor) why.push(['Raised to {0} kcal — never below your basal rate or 1200 kcal', kcal])
  why.push(['Protein: {0} g per kg of body weight', PROTEIN_PER_KG[p.goal]])
  why.push(['Fat: 25% of calories, at least 0.6 g per kg'])
  why.push(['Carbohydrates: the calories that are left'])
  return { kcal, p: protein, c: carbs, f: fat, fib: Math.round((kcal / 1000) * 14), bmr: Math.round(base), tdee: Math.round(tdee), why }
}

/** The goal implied by a goal weight, for a first guess on the profile form. */
export function goalFromWeight(targetW, w) {
  if (!targetW || !w) return 'maintain'
  if (targetW < w - 0.5) return 'lose'
  if (targetW > w + 0.5) return 'gain'
  return 'maintain'
}

/* ------------------------------ diary arithmetic ------------------------------ */

const ZERO = () => ({ kcal: 0, p: 0, c: 0, f: 0, fib: 0 })
const r1 = v => Math.round(v * 10) / 10

/** Nutrients of one entry (per100 × grams / 100). */
export function entryNutrients(e) {
  const k = (e.g || 0) / 100
  const out = ZERO()
  for (const key of Object.keys(out)) out[key] = r1((e.per100?.[key] || 0) * k)
  return out
}

/** Totals of a list of entries — the same sum the server's daily checks make. */
export function sumEntries(entries) {
  const t = ZERO()
  for (const e of entries || []) {
    const k = (e.g || 0) / 100
    for (const key of Object.keys(t)) t[key] += (e.per100?.[key] || 0) * k
  }
  for (const key of Object.keys(t)) t[key] = r1(t[key])
  return t
}

/** Energy from macros, for a food entered by hand: 4 kcal/g protein and carbs, 9 for fat. */
export const kcalFromMacros = ({ p = 0, c = 0, f = 0 }) => Math.round(p * 4 + c * 4 + f * 9)
