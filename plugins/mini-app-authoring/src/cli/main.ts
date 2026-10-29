import { resolve } from 'node:path'

import { installKit, kitInApp } from '../kit/install-kit'
import { loadKit } from '../kit/kit'
import { resolveKit } from '../kit/resolve'
import { findLocalix } from '../localix/runtime'
import { errorMessage, UserError } from '../lib/errors'
import { postEdit } from '../hook/post-edit'
import { parseArgs } from './args'
import { type CliContext, COMMANDS, HELP } from './commands'

/** `mini-app <command>`: the exit code; output goes to `context.out`. */
export async function runCli(argv: readonly string[], context: CliContext): Promise<number> {
  const args = parseArgs(argv)
  if (!args.command || args.command === 'help' || args.options.help === true) {
    context.out(HELP)
    return args.command && args.command !== 'help' ? 2 : 0
  }
  const command = COMMANDS[args.command]
  if (!command) {
    context.out(`Unknown command "${args.command}".\n\n${HELP}`)
    return 2
  }
  try {
    return await command(args, context)
  } catch (error) {
    if (!(error instanceof UserError)) throw error
    context.out(error.message)
    return 1
  }
}

/**
 * One load per key while it holds: a command asks for its app's kit more than once. A load `keep`
 * rejects is done again next time: `create` asks before the app exists, and again once it does.
 */
function memoBy<T>(
  load: (key: string) => Promise<T>,
  keep: (value: T) => boolean,
): (key: string) => Promise<T> {
  const values = new Map<string, Promise<T>>()
  return (key) => {
    const known = values.get(key)
    if (known) return known
    const value = load(key)
    values.set(key, value)
    value.then(
      (loaded) => keep(loaded) || values.delete(key),
      () => values.delete(key),
    )
    return value
  }
}

if (import.meta.main) {
  const argv = process.argv.slice(2)
  if (argv[0] === 'hook' && argv[1] === 'post-edit') {
    // A hook must never fail the edit it follows: any error means nothing to say.
    const output = await postEdit(await Bun.stdin.text(), async () =>
      loadKit((await resolveKit({ offline: true, near: [process.cwd()] })).dir),
    ).catch(() => null)
    if (output) process.stdout.write(`${output}\n`)
    process.exit(0)
  }
  // The app a command names (its first plain argument), else the working directory: its own kit,
  // or one installed above it (a repository that pins one), is the one it builds with.
  const target = resolve(argv.slice(1).find((arg) => !arg.startsWith('-')) ?? '.')
  // `validate` judges a built package, which must stay as it was built.
  const installs = argv[0] !== 'validate'
  const kit = memoBy(
    async (appDir) => {
      const found = await resolveKit({ near: [appDir, process.cwd()] })
      const source = installs ? await kitInApp(found, appDir) : found
      return { source, kit: await loadKit(source.dir) }
    },
    ({ source }) => !installs || source.from !== 'release',
  )
  try {
    process.exitCode = await runCli(argv, {
      cwd: process.cwd(),
      out: (text) => process.stdout.write(`${text}\n`),
      kit: (appDir) => kit(appDir ?? target),
      updateKit: async (appDir, version) => {
        const release = await resolveKit({ version: version ?? 'running' })
        const source = { dir: await installKit(release.dir, appDir), from: 'installed' as const }
        return { source, kit: await loadKit(source.dir) }
      },
      runningLocalix: () => findLocalix(),
    })
  } catch (error) {
    process.stderr.write(`mini-app: ${errorMessage(error)}\n`)
    process.exitCode = 1
  }
}
