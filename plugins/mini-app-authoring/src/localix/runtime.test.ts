import { describe, expect, test } from 'bun:test'

import { findLocalix, localixRequest } from './runtime'

/** A Localix that accepted the connection and never answers; it settles only when aborted. */
const wedged = ((_url: URL, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
  })) as unknown as typeof fetch

describe('localixRequest', () => {
  test('a Localix that never answers fails the request instead of stalling the caller', async () => {
    await expect(
      localixRequest(
        { baseUrl: 'http://127.0.0.1:5051' },
        '/rpc/mini-apps/install-local',
        { timeoutMs: 1 },
        wedged,
      ),
    ).rejects.toThrow('did not answer')
  })
})

describe('findLocalix', () => {
  const answering = (body: unknown) => (async () => Response.json(body)) as unknown as typeof fetch
  const env = { LOCALIX_API_URL: 'http://127.0.0.1:5051', LOCALIX_DB_FILE: '/nowhere/localix.db' }

  // The kit a mini app builds against is the one of the release it will run in.
  test('says which Localix release is running', async () => {
    const runtime = await findLocalix({
      env,
      fetch: answering({ productId: 'localix-api', version: '0.4.0' }),
    })
    expect(runtime).toEqual({ baseUrl: 'http://127.0.0.1:5051', version: '0.4.0' })
  })

  // The digest of the mini app contract it implements: a kit with the same one matches it 1:1.
  test('says which mini app contract it implements, release or not', async () => {
    const runtime = await findLocalix({
      env,
      fetch: answering({ productId: 'localix-api', miniAppContract: 'c'.repeat(64), version: 7 }),
    })
    expect(runtime).toEqual({ baseUrl: 'http://127.0.0.1:5051', miniAppContract: 'c'.repeat(64) })
  })

  test('a Localix run from source has no release', async () => {
    const runtime = await findLocalix({ env, fetch: answering({ productId: 'localix-api' }) })
    expect(runtime).toEqual({ baseUrl: 'http://127.0.0.1:5051' })
  })

  test('another program on the port is not Localix', async () => {
    expect(await findLocalix({ env, fetch: answering({ productId: 'other' }) })).toBeNull()
  })
})
