import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { listFiles } from '../scaffold/template-layout'

/**
 * No private key in the app's folder: it becomes a public repository, and a catalog signing key
 * copied into it (`mini-app keygen` keeps one in the person's config folder) would be published
 * with it, letting anyone sign a catalog as them.
 */

/** A key file is small; a larger file (an image, a font) is not read. */
const KEY_FILE_MAX_BYTES = 16 * 1024
/** A whole PEM block, its key between the lines: a header alone (a form's placeholder) is none. */
const PRIVATE_KEY =
  /-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]{40,}-----END \1PRIVATE KEY-----/u

/** One problem per file that holds a private key. */
export async function checkMiniAppSecrets(miniAppDir: string): Promise<string[]> {
  const problems: string[] = []
  for (const file of listFiles(miniAppDir)) {
    const path = join(miniAppDir, file)
    if ((await fs.stat(path)).size > KEY_FILE_MAX_BYTES) continue
    if (PRIVATE_KEY.test(await fs.readFile(path, 'utf8')))
      problems.push(
        `${file} holds a private key: delete it from the app's folder (its repository is public). A signing key belongs in your config folder (mini-app keygen) and the MINI_APP_SIGNING_KEY secret.`,
      )
  }
  return problems
}
