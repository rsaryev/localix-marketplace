import { CHECKOUT_KIT_HINT, contractNotice } from '../kit/contract'
import type { Kit } from '../kit/kit'
import { UserError } from '../lib/errors'
import { stringOption } from './args'
import { type CliContext, type Command, folder, readManifest } from './context'

/** `mini-app kit [--update [--version <v>|latest]]`: which kit an app builds with, or a new one. */
export const kitInfo: Command = async (args, context) => {
  if (args.options.update === true) {
    if (!context.updateKit) throw new UserError('Updating the kit is not available here.')
    const dir = folder(args, context)
    await readManifest(dir)
    const version = stringOption(args, 'version')
    const { kit } = await context.updateKit(dir, version)
    context.out(
      `Installed the mini app kit in ${dir}: it now builds against Localix ${kit.manifest.localixVersion ?? 'unknown'}.`,
    )
    if (version === undefined) {
      const notice = contractNotice(kit.manifest, await context.runningLocalix?.())
      if (notice?.differs) context.out(CHECKOUT_KIT_HINT)
    }
    return 0
  }
  const { kit, source } = await context.kit()
  const notice = contractNotice(kit.manifest, await context.runningLocalix?.())
  context.out(
    [
      `Kit: ${kit.dir} (from ${source.from})`,
      `Localix: ${kit.manifest.localixVersion ?? 'unknown'}, mini app API ${kit.manifest.apiVersion ?? 'unknown'}`,
      `Kit modules: ${kit.manifest.kitModules.length}`,
      ...(notice ? [notice.text] : []),
    ].join('\n'),
  )
  return 0
}

/** The contract notice a check report ends with, when the app's kit is not the running Localix's. */
export async function sayContractDiffers(kit: Kit, context: CliContext): Promise<void> {
  const notice = contractNotice(kit.manifest, await context.runningLocalix?.())
  if (notice?.differs) context.out(notice.text)
}
