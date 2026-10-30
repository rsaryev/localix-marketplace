import { join } from 'node:path'

import { kitDir, ROOT } from './kit'

/**
 * Pack the catalog a release publishes, `dist/catalog`: `.mini-app/marketplace.json` — Localix's
 * own mini apps, in the shape of `.claude-plugin/marketplace.json` — built by
 * `mini-app marketplace build`, so each app is checked and built exactly as any published mini app
 * is, and Localix's picks (`metadata.localix`) travel with it. Then the catalog is signed.
 */
const TOOL = join(ROOT, 'plugins', 'mini-app-authoring', 'bin', 'mini-app')
const OUT = join(ROOT, 'dist', 'catalog')

const env = { ...process.env, MINI_APP_KIT: await kitDir() }
const build = Bun.spawnSync([TOOL, 'marketplace', 'build', '--out', OUT], {
  cwd: ROOT,
  env,
  stdout: 'inherit',
  stderr: 'inherit',
})
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1)

// Localix keeps this catalog's public key in its code: its apps update on their own only while
// every release is signed with the matching private key, the MINI_APP_SIGNING_KEY secret.
if (process.env.MINI_APP_SIGNING_KEY?.trim()) {
  const sign = Bun.spawnSync([TOOL, 'sign', OUT], { env, stdout: 'inherit', stderr: 'inherit' })
  if (sign.exitCode !== 0) process.exit(sign.exitCode)
} else if (process.env.CI) {
  console.error('MINI_APP_SIGNING_KEY is not set: a release of the Localix catalog is signed.')
  process.exit(1)
}
