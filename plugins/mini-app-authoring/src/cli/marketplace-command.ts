import { join, resolve } from 'node:path'

import { UserError } from '../lib/errors'
import {
  buildMarketplace,
  linkProblems,
  MARKETPLACE_FILE,
  marketplaceProblems,
  readMarketplace,
  shown,
} from '../marketplace/marketplace'
import { CATALOG_FILE, packIntoCatalog } from '../package/pack'
import { stringOption } from './args'
import { buildPackage } from './build-package'
import type { Command } from './context'

/**
 * `mini-app marketplace validate|build [file]`: a repository's `.mini-app/marketplace.json`
 * (`marketplace.ts`). `validate` checks it, and with `--fetch` follows each link to its catalog;
 * `--reserve <catalog url>` refuses the names that catalog has (Localix Community reserves the
 * Localix catalog's). `build` checks and packs each folder's app, and writes the catalog with the
 * links beside it, the owner publishing the packed apps.
 */
export const marketplaceCommand: Command = async (args, context) => {
  const [action, path] = args.positional
  const file = resolve(context.cwd, path ?? MARKETPLACE_FILE)
  if (action === 'validate') {
    const marketplace = await readMarketplace(file)
    const problems = await marketplaceProblems(marketplace, file)
    const notes: string[] = []
    if (args.options.fetch === true && !problems.length) {
      const reserved = stringOption(args, 'reserve')
      const linked = await linkProblems(marketplace, reserved ? { reserved } : {})
      problems.push(...linked.problems)
      notes.push(...linked.notes)
    }
    for (const note of notes) context.out(`- ${note}`)
    if (problems.length) {
      context.out(`${shown(file, context.cwd)}:\n${problems.map((p) => `- ${p}`).join('\n')}`)
      return 1
    }
    context.out(
      `${shown(file, context.cwd)}: ${marketplace.apps.length} apps, all as Localix reads them.`,
    )
    return 0
  }
  if (action === 'build') {
    const outDir = resolve(context.cwd, stringOption(args, 'out') ?? join('dist', 'catalog'))
    const { kit } = await context.kit()
    const marketplace = await readMarketplace(file)
    const catalog = await buildMarketplace({
      file,
      outDir,
      pack: async (dir) => {
        const built = await buildPackage(dir, context)
        if (!built) throw new UserError(`${dir} did not pass its check`)
        return packIntoCatalog({
          kit,
          packageDir: built.packageDir,
          outDir,
          publisher: marketplace.owner.name,
        })
      },
    })
    context.out(`Built ${catalog.apps.length} apps into ${join(outDir, CATALOG_FILE)}.`)
    return 0
  }
  throw new UserError('mini-app marketplace validate|build [file]: say which.')
}
