import { homedir } from 'node:os'
import { relative } from 'node:path'

import {
  ensureSigningKey,
  SIGNING_KEY_ENV,
  signingKeyFile,
  signingKeyFrom,
  signReleaseIn,
} from '../publish/signing'
import { stringOption } from './args'
import { type CliContext, type Command, folder } from './context'

const keyFileOf = (context: CliContext) =>
  signingKeyFile(context.env ?? process.env, context.home ?? homedir())

/** Make the publisher's signing key, once; asked again, name the one there is. */
export const keygen: Command = async (_args, context) => {
  const file = keyFileOf(context)
  const { made, publicKey } = await ensureSigningKey(file)
  context.out(
    [
      made
        ? `Made your signing key at ${file} (readable by you only). Keep it: every release of your marketplace is signed with it, and Localix stops updating your apps on its own if a release is signed with a key it was not told of. To move to a new key, sign one release with this one and --next-key <the new public key>.`
        : `Your signing key is already at ${file}.`,
      `Public key: ${publicKey}`,
      `To sign in a GitHub release, store the key as the repository secret ${SIGNING_KEY_ENV}: gh secret set ${SIGNING_KEY_ENV} < ${file}`,
    ].join('\n'),
  )
  return 0
}

/**
 * Sign the released marketplace in a folder (the current one by default), after it was last packed.
 * `--next-key <key>[,<key>]` names the keys that sign the next release instead of this one.
 */
export const signCommand: Command = async (args, context) => {
  const dir = folder(args, context)
  const key = await signingKeyFrom(context.env ?? process.env, keyFileOf(context))
  const next = stringOption(args, 'next-key')
  const { kit } = await context.kit(dir)
  const { file, publicKey, signingKeys } = await signReleaseIn(kit, dir, key, {
    ...(next ? { nextKeys: next.split(',').map((it) => it.trim()).filter(Boolean) } : {}),
  })
  const shown = relative(context.cwd, file)
  context.out(
    [
      `Signed ${shown.startsWith('..') ? file : shown} with the key ${publicKey}.`,
      ...(signingKeys.includes(publicKey)
        ? []
        : [`The next release is signed with ${signingKeys.join(', ')}: Localix keeps those now.`]),
    ].join('\n'),
  )
  return 0
}
