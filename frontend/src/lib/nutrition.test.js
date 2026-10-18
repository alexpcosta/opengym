import { describe, it, expect } from 'vitest'
import { bmr, computeTargets, ageOn, profileComplete, goalFromWeight, sumEntries, entryNutrients, kcalFromMacros, toKg } from './nutrition.js'

const TODAY = '2026-10-18'
const MAN = { sex: 'male', birth: '1996-01-10', heightCm: 180, activity: 'moderate', goal: 'maintain' }

describe('basal metabolism', () => {
  it('matches Mifflin–St Jeor on known values', () => {
    expect(bmr({ sex: 'male', kg: 80, cm: 180, age: 30 })).toBe(1780)
    expect(bmr({ sex: 'female', kg: 60, cm: 165, age: 30 })).toBe(1320.25)
  })
  it('counts age in whole years, birthday or not', () => {
    expect(ageOn('1996-10-18', TODAY)).toBe(30)
    expect(ageOn('1996-10-19', TODAY)).toBe(29)
    expect(ageOn('bogus', TODAY)).toBe(null)
  })
})

describe('computeTargets', () => {
  it('maintenance is BMR × activity, with protein, fat and carbs adding up', () => {
    const t = computeTargets(MAN, 80, TODAY)
    expect(t.bmr).toBe(1780)
    expect(t.tdee).toBe(2759)
    expect(t.kcal).toBe(2760)
    expect(t.p).toBe(128)                                  // 1.6 g/kg
    expect(t.f).toBe(77)                                   // 25 % of kcal / 9
    expect(Math.abs(t.p * 4 + t.c * 4 + t.f * 9 - t.kcal)).toBeLessThan(10)
  })
  it('a weekly pace becomes a daily deficit, capped at a quarter of maintenance', () => {
    const half = computeTargets({ ...MAN, goal: 'lose', pace: 0.5 }, 80, TODAY)
    expect(half.kcal).toBe(2210)                           // 2759 − 550
    expect(half.p).toBe(160)                               // 2.0 g/kg when cutting
    const fast = computeTargets({ ...MAN, goal: 'lose', pace: 1 }, 80, TODAY)
    expect(fast.kcal).toBe(2070)                           // −25 % cap, not −1100
  })
  it('a surplus is capped at 15 %, and calories never drop below the basal rate', () => {
    const gain = computeTargets({ ...MAN, goal: 'gain', pace: 1 }, 80, TODAY)
    expect(gain.kcal).toBe(3170)
    const small = computeTargets({ sex: 'female', birth: '1950-01-01', heightCm: 150, activity: 'sedentary', goal: 'lose', pace: 1 }, 45, TODAY)
    expect(small.kcal).toBeGreaterThanOrEqual(1200)
    expect(small.kcal).toBeGreaterThanOrEqual(small.bmr - 5)
    expect(small.why.some(w => w[0].startsWith('Raised to'))).toBe(true)
  })
  it('an incomplete profile gives no targets rather than a guess', () => {
    expect(computeTargets({ ...MAN, heightCm: 0 }, 80, TODAY)).toBe(null)
    expect(profileComplete(MAN, 0, TODAY)).toBe(false)
    expect(computeTargets({ ...MAN, birth: '2020-01-01' }, 30, TODAY)).toBe(null)
  })
  it('pounds are converted and a goal weight suggests the goal', () => {
    expect(Math.round(toKg(176.37, 'lb'))).toBe(80)
    expect(goalFromWeight(70, 80)).toBe('lose')
    expect(goalFromWeight(85, 80)).toBe('gain')
    expect(goalFromWeight(80.2, 80)).toBe('maintain')
  })
})

describe('diary arithmetic', () => {
  const rice = { g: 150, per100: { kcal: 124, p: 2.6, c: 25.8, f: 1, fib: 2.7 } }
  it('scales nutrients by grams and sums a day', () => {
    expect(entryNutrients(rice)).toEqual({ kcal: 186, p: 3.9, c: 38.7, f: 1.5, fib: 4.1 })
    expect(sumEntries([rice, { ...rice, g: 50 }])).toEqual({ kcal: 248, p: 5.2, c: 51.6, f: 2, fib: 5.4 })
    expect(sumEntries([])).toEqual({ kcal: 0, p: 0, c: 0, f: 0, fib: 0 })
  })
  it('estimates energy from macros', () => {
    expect(kcalFromMacros({ p: 10, c: 20, f: 5 })).toBe(165)
  })
})
