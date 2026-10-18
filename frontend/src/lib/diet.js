// What the diet screens share: which meals a day has, which targets apply, and whether the
// diary exists on this build at all.
import { t } from './i18n.js'
import { computeTargets } from './nutrition.js'

// The diary lives on the server (api/diet/*): no server, no diary. Guests, the standalone
// mobile app and the static demo keep the tab bar they always had.
export const dietAvailable = (user, { demo, mobile } = {}) => !!user && !demo && !mobile

export const DEFAULT_MEALS = [
  { id: 'm1', key: 'Breakfast' }, { id: 'm2', key: 'Lunch' }, { id: 'm3', key: 'Snack' }, { id: 'm4', key: 'Dinner' }
]
/** The trainer's meals when they sent a diet, else the student's own, else the defaults. */
export const mealsOf = S => (S.diet?.meals?.length ? S.diet.meals : S.dietMeals?.length ? S.dietMeals : DEFAULT_MEALS)
export const mealName = m => m.name || t(m.key || 'Meal')

/**
 * The targets in force: the trainer's when a diet was sent; otherwise the student's own —
 * recalculated from the profile and today's weight when they chose the calculated ones,
 * so losing four kilos moves the numbers without anyone revisiting the form.
 */
export function targetsOf(S, kg, today) {
  if (S.diet?.targets?.kcal) return { ...S.diet.targets, by: 'trainer' }
  if (!S.dietTargets) return null
  if (S.dietTargets.auto) {
    const c = computeTargets(S.profile, kg, today)
    if (c) return { kcal: c.kcal, p: c.p, c: c.c, f: c.f, auto: true }
  }
  return { ...S.dietTargets }
}
