import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { fakeKit } from '../testing/fake-kit'
import { tempDirPerTest, writeTree } from '../testing/temp'
import { ensureSigningKey, signingKeyFile, signingKeyFrom, signReleaseIn } from './signing'

const tempDir = tempDirPerTest('mini-app-signing-')

// The key from a seed of 32 sevens.
const SEVENS =
  '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH\n-----END PRIVATE KEY-----\n'
const SEVENS_KEY = '6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw='
const NEXT_KEY = 'bwCq5MPyZb+OxOHQnaBtzi9GmXBvu1U6WnGeyEPhdXg='
const RELEASE = { schema: 3, name: 'ada', owner: { name: 'Ada' }, apps: [] }

describe('signing a released marketplace', () => {
  const signed = (dir: string) => {
    const bytes = readFileSync(join(dir, 'mini-app-marketplace.json'))
    const signature = readFileSync(join(dir, 'mini-app-marketplace.json.sig'), 'utf8')
    return { release: JSON.parse(bytes.toString()), keys: fakeKit().tools.marketplace.verify(bytes, signature) }
  }

  // The keys of the next release are inside the signed bytes, so Localix keeps exactly them.
  test('names its own key as the next one, then signs the exact bytes Localix reads', async () => {
    const dir = tempDir()
    writeTree(dir, { 'mini-app-marketplace.json': JSON.stringify(RELEASE) })
    const done = await signReleaseIn(fakeKit(), dir, SEVENS)
    expect(done.publicKey).toBe(SEVENS_KEY)
    expect(signed(dir)).toEqual({
      release: { ...RELEASE, signingKeys: [SEVENS_KEY] },
      keys: { keys: [SEVENS_KEY] },
    })
  })

  // Moving to a new key: one release signed with the old key names the new one.
  test('with the next keys named, signs with this key and hands over to them', async () => {
    const dir = tempDir()
    writeTree(dir, { 'mini-app-marketplace.json': JSON.stringify(RELEASE) })
    await signReleaseIn(fakeKit(), dir, SEVENS, { nextKeys: [NEXT_KEY] })
    expect(signed(dir)).toEqual({
      release: { ...RELEASE, signingKeys: [NEXT_KEY] },
      keys: { keys: [SEVENS_KEY] },
    })
  })

  test('a next key that is not a public key is refused, and nothing is written', async () => {
    const dir = tempDir()
    writeTree(dir, { 'mini-app-marketplace.json': JSON.stringify(RELEASE) })
    await expect(signReleaseIn(fakeKit(), dir, SEVENS, { nextKeys: ['nope'] })).rejects.toThrow(
      /nope is not an Ed25519 public key/,
    )
    expect(existsSync(join(dir, 'mini-app-marketplace.json.sig'))).toBe(false)
  })

  test('a folder with no release is said, and nothing is written', async () => {
    const dir = tempDir()
    await expect(signReleaseIn(fakeKit(), dir, SEVENS)).rejects.toThrow(
      /no mini-app-marketplace\.json/,
    )
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
    expect(first.publicKey).toBe(fakeKit().tools.marketplace.publicKeyOf(readFileSync(file, 'utf8')))
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
