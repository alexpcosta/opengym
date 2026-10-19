import { describe, it, expect } from 'vitest'
import { applyTrainerPlan, trainerLocked, isTrainerRoutine, trainerPlanUnseen, markPlanSeen, applyTrainerDiet, dietLocked, dietUnseen, markDietSeen } from './trainer.js'
import { mealsOf, targetsOf } from './diet.js'

const base = () => ({
  routines: [{ id: 'own1', name: 'My cardio', emoji: 'bike', ex: [{ id: '0001', sets: 2, reps: 10 }] }],
  week: { 2: 'own1', 5: 'own1' },
  dayPlan: { '2026-10-21': 'own1' },
  customEx: [{ id: 'mine', n: 'Sled push', bp: 'upper legs' }],
  workouts: [{ id: 'w1', d: '2026-10-12', routineId: 'tA', name: 'Upper' }],
  trainer: null
})
const plan = (over = {}) => ({
  version: 1, by: 'Coach', note: 'Week one', updatedAt: 1,
  routines: [
    { id: 'tA', name: 'Upper', emoji: 'figureStrength', prog: 'double', ex: [{ id: '0001', sets: 3, reps: 10, mode: 'reps' }, { id: 'cx1', sets: 3, reps: 12, mode: 'reps' }] },
    { id: 'tB', name: 'Lower', emoji: 'legs', ex: [{ id: '0007', sets: 3, sec: 45, mode: 'time' }] }
  ],
  week: { 1: 'tA', 4: 'tB' },
  customEx: [{ id: 'cx1', n: 'Sled push', bp: 'upper legs' }],
  ...over
})

describe('applyTrainerPlan', () => {
  it('puts the trainer routines first, replaces the week and locks the plan', () => {
    const s = base()
    applyTrainerPlan(s, plan())
    expect(s.routines.map(r => r.id)).toEqual(['tA', 'tB', 'own1'])
    expect(s.week).toEqual({ 1: 'tA', 4: 'tB' })
    expect(s.dayPlan['2026-10-21']).toBe('own1')          // a one-off reschedule survives
    expect(trainerLocked(s)).toBe(true)
    expect(isTrainerRoutine(s, 'tA')).toBe(true)
    expect(isTrainerRoutine(s, 'own1')).toBe(false)
    expect(s.trainer.by).toBe('Coach')
  })

  it('maps a custom exercise onto the one the student already has', () => {
    const s = base()
    applyTrainerPlan(s, plan())
    expect(s.customEx).toHaveLength(1)
    expect(s.routines[0].ex[1].id).toBe('mine')
  })

  it('an update keeps routine ids (history stays attached) and drops removed routines', () => {
    const s = base()
    applyTrainerPlan(s, plan())
    s.dayPlan['2026-10-23'] = 'tB'
    applyTrainerPlan(s, plan({
      version: 2,
      routines: [{ id: 'tA', name: 'Upper v2', emoji: 'figureStrength', ex: [{ id: '0001', sets: 5, reps: 5, mode: 'reps' }] }],
      week: { 1: 'tA', 3: 'tA' }
    }))
    expect(s.routines.map(r => r.id)).toEqual(['tA', 'own1'])
    expect(s.routines[0].ex[0].sets).toBe(5)
    expect(s.week).toEqual({ 1: 'tA', 3: 'tA' })
    expect(s.dayPlan['2026-10-23']).toBeUndefined()
    expect(s.workouts[0].routineId).toBe('tA')
    expect(s.customEx).toHaveLength(1)                      // re-sent custom exercise, still one entry
  })

  it('a removed plan unlocks and takes only the trainer routines away', () => {
    const s = base()
    applyTrainerPlan(s, plan())
    applyTrainerPlan(s, { version: 2, removed: true, routines: [], week: {} })
    expect(s.routines.map(r => r.id)).toEqual(['own1'])
    expect(trainerLocked(s)).toBe(false)
    expect(s.trainer).toEqual({ version: 2, removed: true, rids: [] })
    expect(Object.values(s.week)).not.toContain('tA')
  })

  it('the banner shows for an unseen version until marked seen', () => {
    const s = base()
    applyTrainerPlan(s, plan())
    expect(trainerPlanUnseen(s)).toBe(true)
    markPlanSeen(s)
    expect(trainerPlanUnseen(s)).toBe(false)
    applyTrainerPlan(s, plan({ version: 3 }))
    expect(trainerPlanUnseen(s)).toBe(true)
  })
})

describe('applyTrainerDiet', () => {
  const diet = (over = {}) => ({
    version: 1, by: 'Coach', note: 'Água!',
    targets: { kcal: 1900, p: 140, c: 190, f: 60 },
    meals: [{ id: 'm1', name: 'Almoço', items: [{ id: 'i1', food: { src: 'taco', fid: 't1', name: 'Arroz', per100: { kcal: 124, p: 2.6, c: 25.8, f: 1 } }, g: 150 }] }],
    ...over
  })
  it('the trainer targets and meals take over, the student keeps theirs underneath', () => {
    const s = { dietTargets: { kcal: 2500, p: 100, c: 300, f: 80, auto: false }, dietMeals: null, diet: null }
    applyTrainerDiet(s, diet())
    expect(dietLocked(s)).toBe(true)
    expect(targetsOf(s, 70, '2026-10-18')).toMatchObject({ kcal: 1900, by: 'trainer' })
    expect(mealsOf(s)[0].name).toBe('Almoço')
    expect(s.dietTargets.kcal).toBe(2500)
  })
  it('removing it gives the student their own targets back', () => {
    const s = { dietTargets: { kcal: 2500, p: 100, c: 300, f: 80, auto: false }, diet: null }
    applyTrainerDiet(s, diet())
    applyTrainerDiet(s, { version: 2, removed: true })
    expect(dietLocked(s)).toBe(false)
    expect(targetsOf(s, 70, '2026-10-18').kcal).toBe(2500)
    expect(mealsOf(s).map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
  })
  it('an update shows the banner again until it is seen', () => {
    const s = { diet: null }
    applyTrainerDiet(s, diet())
    expect(dietUnseen(s)).toBe(true)
    markDietSeen(s)
    expect(dietUnseen(s)).toBe(false)
    applyTrainerDiet(s, diet({ version: 2 }))
    expect(dietUnseen(s)).toBe(true)
  })
})
