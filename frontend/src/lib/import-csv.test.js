import { describe, it, expect } from 'vitest'
import { parseCSV } from './import-csv.js'

describe('parseCSV', () => {
  it('keeps quoted fields with embedded commas', () => {
    const csv = 'Date,Exercise,Notes\n2026-01-12,"Bench Press, Close Grip",felt good'
    expect(parseCSV(csv)).toEqual([
      ['Date', 'Exercise', 'Notes'],
      ['2026-01-12', 'Bench Press, Close Grip', 'felt good'],
    ])
  })

  it('does not treat a bare quote mid-field as opening a quoted field', () => {
    // an inch mark ("Box Jump 24\"") or a quoted word in a note is not RFC4180 quoting —
    // it used to flip the parser into quoted mode and swallow every row after it.
    const csv = [
      'Date,Exercise,Weight,Reps,Notes',
      '2026-01-12,Box Jump 24",60,10,felt good',
      '2026-01-13,Squat,100,5,fine',
    ].join('\n')
    expect(parseCSV(csv)).toEqual([
      ['Date', 'Exercise', 'Weight', 'Reps', 'Notes'],
      ['2026-01-12', 'Box Jump 24"', '60', '10', 'felt good'],
      ['2026-01-13', 'Squat', '100', '5', 'fine'],
    ])
  })
})
