import { ROOT } from './kit'

/** What the staged change touches, checked the way CI checks it — nothing else. */
const staged = Bun.spawnSync(['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMRD'], {
  cwd: ROOT,
})
  .stdout.toString()
  .split('\n')
  .filter(Boolean)

const miniApps = [
  ...new Set(staged.flatMap((file) => /^mini-apps\/([^/]+)\//u.exec(file)?.[1] ?? [])),
].sort()
const template = staged.some((file) => file.startsWith('plugins/mini-app-authoring/template/'))
const plugin = staged.some(
  (file) => file.startsWith('plugins/') && !file.startsWith('plugins/mini-app-authoring/template/'),
)

const run = (cmd: string[], cwd = ROOT) => {
  console.log(`$ ${cmd.join(' ')}`)
  const result = Bun.spawnSync(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) process.exit(result.exitCode ?? 1)
}

// The authoring plugin builds every mini app: a change to it checks the plugins and them all.
if (plugin || staged.includes('.claude-plugin/marketplace.json')) run(['bun', 'scripts/check.ts'])
else if (miniApps.length || template)
  run(['bun', 'scripts/check.ts', ...miniApps, ...(template ? ['template'] : [])])
