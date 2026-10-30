import { randomUUID } from 'node:crypto'
import { constants, existsSync, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

import { UserError } from '../lib/errors'
import { MANIFEST_FILE as MINI_APP_MANIFEST } from '../lib/manifest-file'
import { KIT_MANIFEST } from './kit'
import type { KitSource } from './resolve'

/**
 * A mini app keeps the kit it is built against in its own folder, as the development dependency
 * `@localixai/mini-app-kit`: the commands find it there first (`resolve.ts`), the generated
 * `tsconfig.json` points into it, and the agent reads the SDK's declarations without leaving the
 * app's folder. `node_modules/` is never committed (`GENERATED_IGNORES`); a clone gets its kit on
 * the first command.
 */

export const INSTALLED_KIT = join('node_modules', '@localixai', 'mini-app-kit')

/**
 * Copy the kit at `kitDir` into `appDir`, replacing the one there; the installed folder.
 *
 * Assembled beside and swapped in with one rename, so a command never reads half a kit and a
 * failed copy leaves the previous one in place. Files are cloned where the filesystem can (APFS,
 * Btrfs), so a kit in every app costs no disk until one changes; elsewhere they are copied.
 */
export async function installKit(kitDir: string, appDir: string): Promise<string> {
  if (!existsSync(join(kitDir, KIT_MANIFEST))) {
    throw new UserError(`${kitDir} is not a mini app kit: it has no ${KIT_MANIFEST}.`)
  }
  const target = join(appDir, INSTALLED_KIT)
  const staging = join(dirname(target), `.mini-app-kit-${randomUUID()}`)
  const previous = `${staging}.old`
  await fs.mkdir(dirname(target), { recursive: true })
  try {
    await fs.cp(kitDir, staging, {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      verbatimSymlinks: true,
    })
    if (existsSync(target)) await fs.rename(target, previous)
    await fs.rename(staging, target).catch(async (error: unknown) => {
      if (existsSync(previous)) await fs.rename(previous, target)
      throw error
    })
  } finally {
    await fs.rm(staging, { recursive: true, force: true })
    await fs.rm(previous, { recursive: true, force: true })
  }
  return target
}

/**
 * The kit a command builds `appDir` with: a downloaded one is installed into the app first (and
 * then found there), a named or already installed one is used where it is. A folder that is not a
 * mini app gets nothing written into it.
 */
export async function kitInApp(source: KitSource, appDir: string): Promise<KitSource> {
  if (source.from !== 'release' || !existsSync(join(appDir, MINI_APP_MANIFEST))) return source
  return { ...source, dir: await installKit(source.dir, appDir), from: 'installed' }
}
