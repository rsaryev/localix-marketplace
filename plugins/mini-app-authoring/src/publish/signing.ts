import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

import type { Kit } from '../kit/kit'
import { UserError } from '../lib/errors'

/**
 * A released marketplace's signature, as Localix checks it (Localix's
 * `docs/extending/mini-app-marketplace.md`, "Signing"): `mini-app-marketplace.json.sig` beside the
 * release, Ed25519 signatures of its exact bytes, made with the kit's own signer. Localix keeps the
 * keys of a marketplace's first signed read, and its apps update on their own only while each
 * release is signed with a kept key — so a publisher signs every release with one key, made once
 * (`mini-app keygen`) and kept off the app's repository. The release names the keys of the next one
 * (`signingKeys`, inside the signed bytes): its own, or the new ones it hands over to.
 */

/** The private key, PEM, as a CI secret hands it to `mini-app sign`. */
export const SIGNING_KEY_ENV = 'MINI_APP_SIGNING_KEY'

/** Where the publisher's private key is kept: their config folder, one per person. */
export function signingKeyFile(env: Record<string, string | undefined>, home: string): string {
  const config = env.XDG_CONFIG_HOME?.trim() || join(home, '.config')
  return join(config, 'localix', 'mini-app-signing-key.pem')
}

/** The public key Localix keeps for a marketplace: the raw 32 bytes, base64. */
export function publicKeyOf(privatePem: string): string {
  const jwk = createPublicKey(createPrivateKey(privatePem)).export({ format: 'jwk' })
  return Buffer.from(jwk.x!, 'base64url').toString('base64')
}

/** The key at `file`, made there (readable by its owner only) when there is none yet. */
export async function ensureSigningKey(
  file: string,
): Promise<{ made: boolean; publicKey: string }> {
  if (existsSync(file))
    return { made: false, publicKey: publicKeyOf(await fs.readFile(file, 'utf8')) }
  const { privateKey } = generateKeyPairSync('ed25519')
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
  await fs.mkdir(dirname(file), { recursive: true, mode: 0o700 })
  await fs.writeFile(file, pem, { mode: 0o600, flag: 'wx' })
  return { made: true, publicKey: publicKeyOf(pem) }
}

/** The private key to sign with: `MINI_APP_SIGNING_KEY` (a CI secret), else the key file. */
export async function signingKeyFrom(
  env: Record<string, string | undefined>,
  file: string,
): Promise<string> {
  const named = env[SIGNING_KEY_ENV]?.trim()
  if (named) return `${named}\n`
  if (!existsSync(file))
    throw new UserError(
      `No signing key: set ${SIGNING_KEY_ENV}, or make one with \`mini-app keygen\` (kept at ${file}).`,
    )
  return fs.readFile(file, 'utf8')
}

/** An Ed25519 public key as Localix keeps one: 32 bytes, base64. */
const PUBLIC_KEY = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/

/**
 * Sign the release in `dir`, as it is now: run it after the last change to the release. It first
 * names the keys of the next release, `nextKeys` or this key's own, then signs the bytes it wrote.
 */
export async function signReleaseIn(
  kit: Kit,
  dir: string,
  privatePem: string,
  opts: { nextKeys?: readonly string[] } = {},
): Promise<{ file: string; publicKey: string; signingKeys: string[] }> {
  const { releaseFile, signatureSuffix, sign, publicKeyOf: keyOf } = kit.tools.marketplace
  const release = join(dir, releaseFile)
  if (!existsSync(release)) throw new UserError(`${dir} has no ${releaseFile} to sign.`)
  for (const key of opts.nextKeys ?? [])
    if (!PUBLIC_KEY.test(key))
      throw new UserError(`${key} is not an Ed25519 public key (32 bytes, base64).`)
  const publicKey = keyOf(privatePem)
  const signingKeys = opts.nextKeys?.length ? [...opts.nextKeys] : [publicKey]
  const parsed = JSON.parse(await fs.readFile(release, 'utf8')) as Record<string, unknown>
  const bytes = new TextEncoder().encode(`${JSON.stringify({ ...parsed, signingKeys }, null, 2)}\n`)
  await fs.writeFile(release, bytes)
  const file = `${release}${signatureSuffix}`
  await fs.writeFile(file, sign(bytes, [privatePem]))
  return { file, publicKey, signingKeys }
}
