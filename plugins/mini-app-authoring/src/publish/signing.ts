import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

import { UserError } from '../lib/errors'
import { CATALOG_FILE } from '../package/pack'

/**
 * A catalog's signature, as Localix checks it (`docs/extending/mini-app-publishing.md`, "Signing"):
 * `mini-app-catalog.json.sig` beside the catalog, an Ed25519 signature of the catalog file's exact
 * bytes and the public key that made it. Localix keeps the key a catalog was first signed with, and
 * its apps update on their own only while the catalog stays signed with it — so a publisher signs
 * every release with one key, made once (`mini-app keygen`) and kept off the app's repository.
 */
export const SIGNATURE_FILE = `${CATALOG_FILE}.sig`
/** The private key, PEM, as a CI secret hands it to `mini-app sign`. */
export const SIGNING_KEY_ENV = 'MINI_APP_SIGNING_KEY'

/** Where the publisher's private key is kept: their config folder, one per person. */
export function signingKeyFile(env: Record<string, string | undefined>, home: string): string {
  const config = env.XDG_CONFIG_HOME?.trim() || join(home, '.config')
  return join(config, 'localix', 'mini-app-signing-key.pem')
}

/** The public key Localix keeps for a catalog: the raw 32 bytes, base64. */
export function publicKeyOf(privatePem: string): string {
  const jwk = createPublicKey(createPrivateKey(privatePem)).export({ format: 'jwk' })
  return Buffer.from(jwk.x!, 'base64url').toString('base64')
}

/** The signature file for a catalog's `bytes`. */
export function signatureFor(bytes: Uint8Array, privatePem: string): string {
  return `${JSON.stringify({
    schema: 1,
    algorithm: 'ed25519',
    key: publicKeyOf(privatePem),
    signature: sign(null, bytes, createPrivateKey(privatePem)).toString('base64'),
  })}\n`
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

/** Sign the catalog in `dir`, as it is now: run it after the last change to the catalog. */
export async function signCatalogIn(
  dir: string,
  privatePem: string,
): Promise<{ file: string; publicKey: string }> {
  const catalog = join(dir, CATALOG_FILE)
  if (!existsSync(catalog)) throw new UserError(`${dir} has no ${CATALOG_FILE} to sign.`)
  const file = join(dir, SIGNATURE_FILE)
  await fs.writeFile(file, signatureFor(await fs.readFile(catalog), privatePem))
  return { file, publicKey: publicKeyOf(privatePem) }
}
