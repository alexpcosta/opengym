import { describe, expect, it } from 'vitest'
import { warmupSets } from './warmups.js'

describe('barbell warm-up ramps', () => {
  it('ramps below the first work-set weight and keeps the second lifts shorter', () => {
    expect(warmupSets('0043', 80, 'kg')).toEqual([
      { w: 20, r: 8, done: false }, { w: 45, r: 5, done: false }, { w: 65, r: 2, done: false }
    ])
    expect(warmupSets('0025', 60, 'kg').map(s => s.w)).toEqual([20, 45])
    expect(warmupSets('1457', 40, 'kg').map(s => s.w)).toEqual([20, 30])
  })

  it('starts deadlifts with plates and uses plate increments for the selected unit', () => {
    expect(warmupSets('0032', 100, 'kg').map(s => s.w)).toEqual([50, 70, 85])
    expect(warmupSets('0032', 60, 'lb').map(s => s.w)).toEqual([50])
    expect(warmupSets('0025', 135, 'lb').map(s => s.w)).toEqual([45, 100])
  })

  it('omits duplicate and work-weight loads when the lift is light', () => {
    expect(warmupSets('0043', 22.5, 'kg')).toEqual([{ w: 20, r: 8, done: false }])
    expect(warmupSets('1457', 20, 'kg')).toEqual([])
  })

  it('leaves weights blank until there is a working load and skips other exercises', () => {
    expect(warmupSets('0032', 0, 'kg')).toEqual([
      { w: null, r: 5, done: false }, { w: null, r: 3, done: false }, { w: null, r: 1, done: false }
    ])
    expect(warmupSets('0739', 100, 'kg')).toBeNull()
  })
})
