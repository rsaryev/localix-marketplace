import { promises as fs } from 'node:fs'

import { checkMiniApp, formatCheck } from '../check/check'
import { assemblePackage } from '../package/assemble'
import { type CliContext, readManifest } from './context'
import { sayContractDiffers } from './kit-command'

/** Check, then assemble the package; null (with the report printed) when the check failed. */
export async function buildPackage(
  dir: string,
  context: CliContext,
): Promise<{ packageDir: string; name: string } | null> {
  const { kit } = await context.kit()
  const manifest = await readManifest(dir)
  const name = typeof manifest.name === 'string' ? manifest.name : dir
  const { report, outputs } = await checkMiniApp({
    kit,
    miniAppDir: dir,
    keepOutputs: true,
    ...(context.runTests ? { runTests: context.runTests } : {}),
  })
  context.out(formatCheck(name, report))
  await sayContractDiffers(kit, context)
  if (!outputs) return null
  try {
    return { packageDir: await assemblePackage(dir, outputs), name }
  } finally {
    await fs.rm(outputs.dir, { recursive: true, force: true })
  }
}
