import { expect, test } from 'bun:test'

import { fakeKit } from '../testing/fake-kit'
import { tempDirPerTest, writeTree } from '../testing/temp'
import { loadKit, PLUGIN_TEMPLATE } from './kit'

const tempDir = tempDirPerTest('mini-app-kit-')
const TOOLS = `export const tools = { version: 2, manifest: { file: '.localix-mini-app/mini-app.json' } }`

test('a kit that carries no template loads, and scaffolds fork the plugin’s own', async () => {
  const dir = tempDir()
  writeTree(dir, {
    'kit.json': JSON.stringify(fakeKit().manifest),
    'tools/authoring.js': TOOLS,
  })

  const kit = await loadKit(dir)

  expect(kit.templateDir).toBe(PLUGIN_TEMPLATE)
})

test('a kit of the first authoring version is refused: update Localix or the plugin', async () => {
  const dir = tempDir()
  const manifest = fakeKit().manifest
  writeTree(dir, {
    'kit.json': JSON.stringify({ ...manifest, authoring: { ...manifest.authoring, version: 1 } }),
    'tools/authoring.js': TOOLS,
  })
  await expect(loadKit(dir)).rejects.toThrow(/authoring version 1; this toolchain reads 2/)
})

test('a kit that keeps the manifest elsewhere is refused, naming both places', async () => {
  const dir = tempDir()
  writeTree(dir, {
    'kit.json': JSON.stringify(fakeKit().manifest),
    'tools/authoring.js': `export const tools = { version: 2, manifest: { file: 'mini-app.json' } }`,
  })
  await expect(loadKit(dir)).rejects.toThrow(
    'keeps the manifest at mini-app.json; this toolchain reads .localix-mini-app/mini-app.json',
  )
})
