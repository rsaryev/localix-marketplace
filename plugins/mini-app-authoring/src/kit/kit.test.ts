import { expect, test } from 'bun:test'

import { fakeKit } from '../testing/fake-kit'
import { tempDirPerTest, writeTree } from '../testing/temp'
import { loadKit, PLUGIN_TEMPLATE } from './kit'

const tempDir = tempDirPerTest('mini-app-kit-')

test('a kit that carries no template loads, and scaffolds fork the plugin’s own', async () => {
  const dir = tempDir()
  writeTree(dir, {
    'kit.json': JSON.stringify(fakeKit().manifest),
    'tools/authoring.js': 'export const tools = { version: 1 }',
  })

  const kit = await loadKit(dir)

  expect(kit.templateDir).toBe(PLUGIN_TEMPLATE)
})
