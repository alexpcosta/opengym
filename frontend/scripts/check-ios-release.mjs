#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export function validateRelease(build, config) {
  if (build?.native !== true || typeof build.preview !== 'boolean') throw new Error('Run npm run build:ios before archiving')
  if (build.preview) throw new Error('The simulated Coach preview cannot be archived. Run npm run build:ios first')
  if (config?.server?.url || config?.server?.cleartext) throw new Error('Live reload/cleartext configuration cannot be archived')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const dir = resolve(root, 'ios/App/App')
    if (!existsSync(resolve(dir, 'public/index.html'))) throw new Error('Missing bundled iOS web assets')
    validateRelease(JSON.parse(readFileSync(resolve(dir, 'public/opengym-build.json'))),
      JSON.parse(readFileSync(resolve(dir, 'capacitor.config.json'))))
    console.log('iOS archive inputs: bundled standalone build, no preview or live reload.')
  } catch (e) {
    console.error(`error: ${e.message}`)
    process.exitCode = 1
  }
}
