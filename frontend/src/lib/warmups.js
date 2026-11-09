// Keyed to the exercise so saved, imported and freestyle routines can use the same ramp.
const RAMPS = new Map([
  ['0043', [[0, 8], [.55, 5], [.8, 2]]], // squat
  ['0032', [[.5, 5], [.7, 3], [.85, 1]]], // deadlift
  ['0025', [[0, 8], [.75, 3]]], // bench
  ['1457', [[0, 8], [.75, 3]]] // military press
])

// null means this exercise has no ramp. An empty list means the working load is
// too light for a ramp with the default bar and plates.
export function warmupSets(id, workingWeight, unit) {
  const ramp = RAMPS.get(id)
  if (!ramp) return null
  if (!Number.isFinite(workingWeight) || workingWeight <= 0) {
    return ramp.map(([, r]) => ({ w: null, r, done: false }))
  }

  const [bar, step] = unit === 'lb' ? [45, 5] : [20, 2.5]
  // Deadlifts begin with plates on the bar. Start from blocks if the plates
  // available for a light set would put the bar below its usual height.
  const minimum = id === '0032' ? bar + step : bar
  const sets = []
  for (const [fraction, r] of ramp) {
    const w = Math.max(minimum, Math.round(workingWeight * fraction / step) * step)
    if (w < workingWeight && w !== sets.at(-1)?.w) sets.push({ w, r, done: false })
  }
  return sets
}
