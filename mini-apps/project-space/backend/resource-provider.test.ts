import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { MiniAppContext, ResourceRefProvider } from '@localixai/mini-app-sdk/backend'
import { spaceUri } from '../shared/resource'
import { register } from './index'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

type Result = { content: string; isError?: boolean }

/** The board attached to a chat message, resolved by the provider the app registers. */
function app() {
  const root = mkdtempSync(join(tmpdir(), 'project-space-resource-'))
  roots.push(root)
  const ctx = {
    userId: 'u1',
    cwd: root,
    z,
    defineTool: (definition: unknown) => definition,
    ui: { offer: (destination: object) => ({ type: 'ui.navigate', ...destination }) },
  } as unknown as MiniAppContext
  const registration = register(ctx)
  const provider = [registration.backend ?? []]
    .flat()
    .find((part) => part.resourceProvider)?.resourceProvider as ResourceRefProvider
  const apply = (input: object) =>
    registration.tools!.find((tool) => tool.name === 'space_apply')!.execute(
      'call-1',
      input as never,
      undefined,
      undefined,
      { session: { id: 's1' } } as never,
    ) as Promise<Result>
  return { provider, apply }
}

describe('the board attached to a message', () => {
  test('resolves to what the board holds', async () => {
    const { provider, apply } = app()
    await apply({ ops: [{ op: 'create', type: 'note', id: 'a', text: 'Ship the beta' }] })

    const expansion = await provider.expand('u1', spaceUri('s1'))

    expect(expansion.ok).toBe(true)
    expect(expansion.content).toContain('Ship the beta')
  })

  test('is offered in the picker for the chat it belongs to', async () => {
    const { provider } = app()

    const roots = await provider.listChildren('u1', null, undefined, { sessionId: 's1' })

    expect(roots.map((node) => node.uri)).toEqual([spaceUri('s1')])
  })

  test('another provider’s address is not a board', async () => {
    const { provider } = app()

    const expansion = await provider.expand('u1', 'localix://resource/db/c1')

    expect(expansion.ok).toBe(false)
  })
})
