import { join, resolve } from 'node:path'

import { UserError } from '../lib/errors'
import { buildMarketplace, linkProblems, readSource, shown, sourceProblems } from '../marketplace/marketplace'
import { packApp } from '../package/pack'
import { stringOption } from './args'
import { buildPackage } from './build-package'
import type { Command } from './context'

/**
 * `mini-app marketplace validate|build [file]`: a repository's `.localix-mini-app/marketplace.json`
 * (`marketplace.ts`). `validate` checks it with Localix's rules, and with `--fetch` follows each
 * link to its released marketplace. `build` checks it, packs each folder's app, and writes the
 * release with the links beside them, the owner publishing the packed apps. `--curation` is for the
 * Localix marketplace only, the one marketplace Localix takes curation from: without it, a
 * `featured`, `installByDefault`, `suggestFor`, `collections` or `blockedArchives` is a problem.
 */
export const marketplaceCommand: Command = async (args, context) => {
  const [action, path] = args.positional
  const { kit } = await context.kit()
  const file = resolve(context.cwd, path ?? kit.tools.marketplace.file)
  const curation = args.options.curation === true
  if (action === 'validate') {
    const raw = await readSource(file)
    const problems = await sourceProblems(kit, raw, file, { curation })
    const notes: string[] = []
    if (args.options.fetch === true && !problems.length) {
      const linked = await linkProblems(kit, raw)
      problems.push(...linked.problems)
      notes.push(...linked.notes)
    }
    for (const note of notes) context.out(`- ${note}`)
    if (problems.length) {
      context.out(`${shown(file, context.cwd)}:\n${problems.map((p) => `- ${p}`).join('\n')}`)
      return 1
    }
    const apps = Array.isArray(raw.apps) ? raw.apps.length : 0
    context.out(`${shown(file, context.cwd)}: ${apps} apps, all as Localix reads them.`)
    return 0
  }
  if (action === 'build') {
    const outDir = resolve(context.cwd, stringOption(args, 'out') ?? join('dist', 'marketplace'))
    const release = await buildMarketplace({
      kit,
      file,
      outDir,
      curation,
      pack: async (dir) => {
        const built = await buildPackage(dir, context)
        if (!built) throw new UserError(`${dir} did not pass its check`)
        return packApp({ kit, packageDir: built.packageDir, outDir })
      },
    })
    const apps = (release.apps as unknown[]).length
    context.out(`Built ${apps} apps into ${join(outDir, kit.tools.marketplace.releaseFile)}.`)
    return 0
  }
  throw new UserError('mini-app marketplace validate|build [file]: say which.')
}
