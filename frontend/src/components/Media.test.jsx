import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../store/useStore.js', () => ({ useStore: fn => fn({ S: { gifSize: 'full' }, update: vi.fn() }) }))
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
const ex = { n: 'Squat', img: 'squat.jpg', gif: 'squat.gif' }

it('renders no third-party media in an unlicensed build, including thumbnails', async () => {
  vi.stubEnv('VITE_EXERCISE_MEDIA', 'off')
  const { default: Media, Thumb } = await import('./Media.jsx')
  expect(renderToStaticMarkup(createElement(Media, { ex }))).toBe('')
  expect(renderToStaticMarkup(createElement(Thumb, { ex }))).not.toContain('<img')
})

it('retains media support when explicitly enabled', async () => {
  vi.stubEnv('VITE_EXERCISE_MEDIA', 'on')
  const { default: Media, Thumb } = await import('./Media.jsx')
  expect(renderToStaticMarkup(createElement(Media, { ex }))).toContain('squat.gif')
  expect(renderToStaticMarkup(createElement(Thumb, { ex }))).toContain('squat.jpg')
})
