import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { fakeKit } from '../testing/fake-kit'
import { tempDirPerTest, writeTree } from '../testing/temp'
import type { CliContext } from './commands'
import { runCli } from './main'

const tempDir = tempDirPerTest('mini-app-signing-cli-')

function cli(env: Record<string, string | undefined> = {}) {
  const lines: string[] = []
  const home = tempDir()
  const context: CliContext = {
    cwd: tempDir(),
    out: (text) => lines.push(text),
    kit: async () => ({ kit: fakeKit(), source: { dir: '/kit', from: 'named' } }),
    env,
    home,
  }
  return { context, home, output: () => lines.join('\n') }
}

describe('mini-app keygen and sign', () => {
  test('keygen makes the publisher’s key once and says what to do with it', async () => {
    const { context, home, output } = cli()
    expect(await runCli(['keygen'], context)).toBe(0)
    const file = join(home, '.config', 'localix', 'mini-app-signing-key.pem')
    expect(existsSync(file)).toBe(true)
    expect(output()).toContain(file)
    expect(output()).toContain('MINI_APP_SIGNING_KEY')

    expect(await runCli(['keygen'], context)).toBe(0)
    expect(output()).toContain('already')
  })

  test('sign writes the signature beside the catalog with the key keygen made', async () => {
    const { context, output } = cli()
    await runCli(['keygen'], context)
    const catalog = join(context.cwd, 'catalog')
    writeTree(catalog, { 'mini-app-catalog.json': '{"schema":1,"apps":[]}\n' })
    expect(await runCli(['sign', 'catalog'], context)).toBe(0)
    expect(existsSync(join(catalog, 'mini-app-catalog.json.sig'))).toBe(true)
    expect(output()).toContain('Signed')
  })

  test('sign without any key says how to get one', async () => {
    const { context, output } = cli()
    writeTree(context.cwd, { 'mini-app-catalog.json': '{"schema":1,"apps":[]}\n' })
    expect(await runCli(['sign'], context)).toBe(1)
    expect(output()).toContain('mini-app keygen')
  })
})
