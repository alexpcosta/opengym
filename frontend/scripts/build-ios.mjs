#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.some(a => a !== '--preview')) throw new Error('Usage: build-ios.mjs [--preview]')
const preview = args.includes('--preview')
const media = process.env.EXERCISE_MEDIA === 'licensed'
if (process.env.EXERCISE_MEDIA && !['off', 'licensed'].includes(process.env.EXERCISE_MEDIA)) {
  throw new Error('EXERCISE_MEDIA must be off or licensed')
}
if (media) {
  for (const key of ['VITE_IMG_BASE', 'VITE_GIF_BASE']) {
    const url = new URL(process.env[key] || '')
    if (url.protocol !== 'https:') throw new Error(`${key} must use HTTPS`)
  }
} else if (['img', 'gif'].some(dir => existsSync(resolve(root, 'public', dir)))) {
  throw new Error('Remove public/img and public/gif before packaging a media-free iOS build')
}
const env = {
  ...process.env, VITE_MOBILE: '1', VITE_DEMO: preview ? '1' : '0',
  VITE_EXERCISE_MEDIA: media ? 'on' : 'off',
  VITE_IMG_BASE: media ? process.env.VITE_IMG_BASE : '',
  VITE_GIF_BASE: media ? process.env.VITE_GIF_BASE : '',
}
function run(file, args) {
  const result = spawnSync(process.execPath, [resolve(root, file), ...args], { cwd: root, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
run('node_modules/vite/bin/vite.js', ['build'])
writeFileSync(resolve(root, 'dist/opengym-build.json'), JSON.stringify({
  native: true, preview, exerciseMedia: media ? 'licensed' : 'off',
}, null, 2) + '\n')
// Copy and resolve only iOS. Android does not need to be installed to contribute on a Mac.
run('node_modules/@capacitor/cli/bin/capacitor', ['sync', 'ios'])
console.log(preview ? 'iOS preview ready: simulated Coach, example data, Debug builds only.' :
  'Standalone iOS build ready. Live Coach requires a connected backend and native authentication.')
