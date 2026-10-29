import { homedir } from 'node:os'
import { relative } from 'node:path'

import {
  ensureSigningKey,
  signCatalogIn,
  SIGNING_KEY_ENV,
  signingKeyFile,
  signingKeyFrom,
} from '../publish/signing'
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
        ? `Made your signing key at ${file} (readable by you only). Keep it: every release of your catalog is signed with it, and Localix stops updating your apps on its own if the key changes.`
        : `Your signing key is already at ${file}.`,
      `Public key: ${publicKey}`,
      `To sign in a GitHub release, store the key as the repository secret ${SIGNING_KEY_ENV}: gh secret set ${SIGNING_KEY_ENV} < ${file}`,
    ].join('\n'),
  )
  return 0
}

/** Sign the catalog in a folder (the current one by default), after it was last packed. */
export const signCommand: Command = async (args, context) => {
  const dir = folder(args, context)
  const key = await signingKeyFrom(context.env ?? process.env, keyFileOf(context))
  const { file, publicKey } = await signCatalogIn(dir, key)
  const shown = relative(context.cwd, file)
  context.out(`Signed ${shown.startsWith('..') ? file : shown} with the key ${publicKey}.`)
  return 0
}
