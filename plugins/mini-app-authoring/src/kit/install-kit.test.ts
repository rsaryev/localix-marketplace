import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { tempDirPerTest, writeTree } from '../testing/temp'
import { installKit, INSTALLED_KIT, kitInApp } from './install-kit'
import { resolveKit } from './resolve'

const tempDir = tempDirPerTest('mini-app-kit-install-')

function kitAt(version: string) {
  const dir = tempDir()
  writeTree(dir, {
    'kit.json': JSON.stringify({ localixVersion: version }),
    'types/kit/button.d.ts': `export declare const version: '${version}'`,
  })
  return dir
}

describe('installKit', () => {
  // The agent building a mini app reads the SDK's declarations from the app's own folder.
  test('puts the kit in the mini app’s node_modules, where the commands find it next', async () => {
    const app = tempDir()
    writeTree(app, { '.localix-mini-app/mini-app.json': '{}' })
    const installed = await installKit(kitAt('0.4.0'), app)

    expect(installed).toBe(join(app, INSTALLED_KIT))
    expect(readFileSync(join(installed, 'types/kit/button.d.ts'), 'utf8')).toContain('0.4.0')
    const source = await resolveKit({ env: {}, near: [app], runtime: null })
    expect(source).toEqual({ dir: installed, from: 'installed' })
  })

  test('replaces an older kit whole, leaving nothing of it or of the copy beside it', async () => {
    const app = tempDir()
    writeTree(join(app, INSTALLED_KIT), {
      'kit.json': '{"localixVersion":"0.3.0"}',
      'types/kit/removed.d.ts': 'export {}',
    })
    const installed = await installKit(kitAt('0.4.0'), app)

    expect(JSON.parse(readFileSync(join(installed, 'kit.json'), 'utf8')).localixVersion).toBe(
      '0.4.0',
    )
    expect(existsSync(join(installed, 'types/kit/removed.d.ts'))).toBe(false)
    expect(readdirSync(join(app, 'node_modules/@localixai'))).toEqual(['mini-app-kit'])
  })

  test('a folder that is not a kit is refused and the installed one is kept', async () => {
    const app = tempDir()
    writeTree(join(app, INSTALLED_KIT), { 'kit.json': '{"localixVersion":"0.3.0"}' })
    await expect(installKit(tempDir(), app)).rejects.toThrow('kit.json')
    expect(readFileSync(join(app, INSTALLED_KIT, 'kit.json'), 'utf8')).toContain('0.3.0')
  })
})

describe('kitInApp', () => {
  test('a downloaded kit is installed into the mini app a command works on', async () => {
    const app = tempDir()
    writeTree(app, { '.localix-mini-app/mini-app.json': '{}' })
    const source = await kitInApp({ dir: kitAt('0.4.0'), from: 'release' }, app)
    expect(source).toEqual({ dir: join(app, INSTALLED_KIT), from: 'installed' })
  })

  test('a named or already installed kit, or a folder that is no mini app, is left alone', async () => {
    const app = tempDir()
    writeTree(app, { '.localix-mini-app/mini-app.json': '{}' })
    const named = { dir: kitAt('0.4.0'), from: 'named' } as const
    expect(await kitInApp(named, app)).toEqual(named)
    const elsewhere = tempDir()
    const release = { dir: kitAt('0.4.0'), from: 'release' } as const
    expect(await kitInApp(release, elsewhere)).toEqual(release)
    expect(existsSync(join(elsewhere, 'node_modules'))).toBe(false)
  })
})
