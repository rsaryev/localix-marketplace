import { join } from 'node:path'

import { kitDir, ROOT } from './kit'

/**
 * Build the mini app marketplace a release publishes, `dist/marketplace`: this repository's
 * `.localix-mini-app/marketplace.json` — Localix's own mini apps and the curation Localix takes from
 * this marketplace alone — built by `mini-app marketplace build`, so each app is checked and built
 * exactly as any published mini app is. Then the release is signed: `mini-app sign` names its key
 * as the next release's (`signingKeys`) and signs the exact bytes Localix reads.
 */
const TOOL = join(ROOT, 'plugins', 'mini-app-authoring', 'bin', 'mini-app')
const OUT = join(ROOT, 'dist', 'marketplace')

const env = { ...process.env, MINI_APP_KIT: await kitDir() }
const build = Bun.spawnSync([TOOL, 'marketplace', 'build', '--curation', '--out', OUT], {
  cwd: ROOT,
  env,
  stdout: 'inherit',
  stderr: 'inherit',
})
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1)

// Localix ships this marketplace's public keys in its code: its apps update on their own only while
// every release is signed with a key Localix keeps, the MINI_APP_SIGNING_KEY secret's.
if (process.env.MINI_APP_SIGNING_KEY?.trim()) {
  const sign = Bun.spawnSync([TOOL, 'sign', OUT], { env, stdout: 'inherit', stderr: 'inherit' })
  if (sign.exitCode !== 0) process.exit(sign.exitCode)
} else if (process.env.CI) {
  console.error('MINI_APP_SIGNING_KEY is not set: a release of the Localix marketplace is signed.')
  process.exit(1)
}
