import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { withCatalogPicks } from './catalog-picks'
import { kitDir, ROOT } from './kit'

/**
 * Pack every mini app into one catalog, `dist/catalog`: `mini-app-catalog.json` beside each app's
 * archive and store media — what a release uploads, and the address Localix's store reads. Each app
 * goes through `mini-app pack`, so it is checked and built exactly as any published mini app is;
 * then the catalog takes Localix's picks (`catalog-picks.ts`).
 */
const MINI_APPS = join(ROOT, 'mini-apps')
const TOOL = join(ROOT, 'plugins', 'mini-app-authoring', 'bin', 'mini-app')
const OUT = join(ROOT, 'dist', 'catalog')
const PUBLISHER = 'Localix'

rmSync(OUT, { recursive: true, force: true })
const env = { ...process.env, MINI_APP_KIT: await kitDir() }
const apps = readdirSync(MINI_APPS).filter((name) =>
  existsSync(join(MINI_APPS, name, 'mini-app.json')),
)
const failed: string[] = []
for (const name of apps) {
  const run = Bun.spawnSync(
    [TOOL, 'pack', join(MINI_APPS, name), '--out', OUT, '--publisher', PUBLISHER],
    { env, stdout: 'pipe', stderr: 'pipe' },
  )
  if (run.exitCode !== 0) {
    console.error(`${run.stdout.toString()}${run.stderr.toString()}`.trim())
    failed.push(name)
  } else console.log(`packed ${name}`)
}
if (failed.length) {
  console.error(`\n${failed.length} of ${apps.length} could not be packed: ${failed.join(', ')}`)
  process.exit(1)
}
const catalogFile = join(OUT, 'mini-app-catalog.json')
const picks = JSON.parse(readFileSync(join(MINI_APPS, 'catalog-picks.json'), 'utf8'))
const catalog = withCatalogPicks(JSON.parse(readFileSync(catalogFile, 'utf8')), picks)
writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`\nPacked ${apps.length} mini apps into ${OUT.replace(`${ROOT}/`, '')}.`)
