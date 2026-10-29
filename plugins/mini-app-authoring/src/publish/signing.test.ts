import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { tempDirPerTest, writeTree } from '../testing/temp'
import { ensureSigningKey, signCatalogIn, signingKeyFile, signingKeyFrom } from './signing'

const tempDir = tempDirPerTest('mini-app-signing-')

// The key from a seed of 32 sevens: Localix's own test checks the same file for the same bytes
// (`apps/api/src/features/mini-apps/catalog-signature.test.ts`), so both agree byte for byte.
const SEVENS =
  '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH\n-----END PRIVATE KEY-----\n'
const CATALOG = '{"schema":1,"apps":[]}\n'
const SIGNED =
  '{"schema":1,"algorithm":"ed25519","key":"6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=","signature":"x14FDCLQa1mrXW5bu06kNoAMfVlMD4FY7cxCYobmglHedXe/6dx+Um81YVbHoaTUubDDcjLl9iBnw7rJTjYTDw=="}\n'

describe('signing a catalog', () => {
  test('writes the signature Localix checks, beside the catalog', async () => {
    const dir = tempDir()
    writeTree(dir, { 'mini-app-catalog.json': CATALOG })
    const signed = await signCatalogIn(dir, SEVENS)
    expect(readFileSync(join(dir, 'mini-app-catalog.json.sig'), 'utf8')).toBe(SIGNED)
    expect(signed.publicKey).toBe('6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=')
  })

  test('a folder with no catalog is said, and nothing is written', async () => {
    const dir = tempDir()
    await expect(signCatalogIn(dir, SEVENS)).rejects.toThrow(/no mini-app-catalog\.json/)
  })
})

describe('the publisher’s signing key', () => {
  test('lives in the person’s config folder, never in the app', () => {
    expect(signingKeyFile({}, '/home/ada')).toBe(
      '/home/ada/.config/localix/mini-app-signing-key.pem',
    )
    expect(signingKeyFile({ XDG_CONFIG_HOME: '/cfg' }, '/home/ada')).toBe(
      '/cfg/localix/mini-app-signing-key.pem',
    )
  })

  test('is made once, readable by its owner only; asked again, the same key', async () => {
    const file = join(tempDir(), 'config', 'mini-app-signing-key.pem')
    const first = await ensureSigningKey(file)
    expect(first.made).toBe(true)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    const again = await ensureSigningKey(file)
    expect(again).toEqual({ made: false, publicKey: first.publicKey })
  })

  test('comes from MINI_APP_SIGNING_KEY first (a CI secret), else the file', async () => {
    const file = join(tempDir(), 'key.pem')
    expect(await signingKeyFrom({ MINI_APP_SIGNING_KEY: SEVENS }, file)).toBe(SEVENS)
    await expect(signingKeyFrom({}, file)).rejects.toThrow(/mini-app keygen/)
    await ensureSigningKey(file)
    expect(existsSync(file)).toBe(true)
    expect(await signingKeyFrom({}, file)).toContain('BEGIN PRIVATE KEY')
  })
})
