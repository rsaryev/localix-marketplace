import { existsSync, promises as fs } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

import type { Kit } from '../kit/kit'
import { UserError } from '../lib/errors'
import { MANIFEST_FILE } from '../lib/manifest-file'

/**
 * A MINI APP MARKETPLACE (Localix's `docs/extending/mini-app-marketplace.md`): the file a
 * repository of mini apps keeps, `.localix-mini-app/marketplace.json`, in the shape of Claude Code's
 * `.claude-plugin/marketplace.json` — a `name`, an `owner`, and `apps`, each with a `source`:
 *
 * - `"./mini-apps/notes"`, a folder of this repository (`"."`, the repository's own app), which
 *   `buildMarketplace` packs;
 * - `{ "source": "github", "repo": "ada/notes" }`, the app in the marketplace that repository's
 *   latest release publishes (what `mini-app ci` releases);
 * - `{ "source": "url", "url": "https://…/mini-app-marketplace.json" }`, a released marketplace.
 *
 * Built, it is the released `mini-app-marketplace.json` Localix reads: the folders' apps as
 * archives, the links as they are (Localix reads a linked app from its own marketplace, signed by
 * its author), the keeper's curation kept. What is wrong with the file is Localix's to say, through
 * the kit (`tools.marketplace.problems`); this module adds only what needs the repository: that a
 * folder holds the app it names.
 */

type Raw = Record<string, unknown>

const isRecord = (raw: unknown): raw is Raw =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw)

/** The marketplace at `file`, as its keeper wrote it. */
export async function readSource(file: string): Promise<Raw> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    throw new UserError(`${file} is not a JSON file: ${(error as Error).message}`)
  }
  if (!isRecord(parsed)) throw new UserError(`${file} is not a marketplace: not a JSON object`)
  return parsed
}

const appsOf = (raw: Raw): Raw[] => (Array.isArray(raw.apps) ? raw.apps.filter(isRecord) : [])

/** The folder a `"./…"` (or `"."`) source names, inside the repository `file` sits in, or null. */
function folderOf(source: string, file: string): string | null {
  if (!(source === '.' || source.startsWith('./')) || source.split('/').includes('..')) return null
  // The file is `<repository>/.localix-mini-app/marketplace.json`.
  const root = dirname(dirname(file))
  const dir = resolve(root, source)
  return dir === root || dir.startsWith(`${root}${sep}`) ? dir : null
}

async function folderProblem(app: Raw, file: string): Promise<string | null> {
  if (typeof app.source !== 'string') return null
  const dir = folderOf(app.source, file)
  if (!dir) return null
  const manifestFile = join(dir, MANIFEST_FILE)
  if (!existsSync(manifestFile)) return `${app.source} holds no ${MANIFEST_FILE}`
  let name: unknown
  try {
    name = (JSON.parse(await fs.readFile(manifestFile, 'utf8')) as Raw).name
  } catch {
    return `${app.source}: its ${MANIFEST_FILE} is not JSON`
  }
  return name === app.name ? null : `${app.source} holds the mini app ${String(name)}`
}

/**
 * Every way the marketplace would not be read as meant, one line each: Localix's rules, then
 * each folder's app. `curation` only for the Localix marketplace, the one Localix takes it from.
 */
export async function sourceProblems(
  kit: Kit,
  raw: Raw,
  file: string,
  check: { curation: boolean },
): Promise<string[]> {
  const problems = [...kit.tools.marketplace.problems(raw, check)]
  for (const [index, app] of appsOf(raw).entries()) {
    const problem = await folderProblem(app, file)
    if (problem) problems.push(`apps[${index}].source: ${problem}`)
  }
  return problems
}

/** The released marketplace a link names, as Localix resolves it. */
function linkedRelease(kit: Kit, source: unknown): string | null {
  if (!isRecord(source)) return null
  if (source.source === 'github' && typeof source.repo === 'string')
    return kit.tools.marketplace.githubUrl(source.repo)
  return source.source === 'url' && typeof source.url === 'string' ? source.url : null
}

/**
 * Each link followed, as Localix would: its release answers, reads as a marketplace, and builds the
 * app. `notes` says what each linked app is and whether its release is signed.
 */
export async function linkProblems(
  kit: Kit,
  raw: Raw,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ problems: string[]; notes: string[] }> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const { read, signatureSuffix, verify } = kit.tools.marketplace
  const problems: string[] = []
  const notes: string[] = []
  for (const app of appsOf(raw)) {
    const url = linkedRelease(kit, app.source)
    if (!url) continue
    const name = String(app.name)
    const response = await fetchImpl(url).catch((error: Error) => error)
    if (response instanceof Error || !response.ok) {
      problems.push(
        `${name}: ${url} ${response instanceof Error ? `cannot be read (${response.message})` : `answered ${response.status}`}`,
      )
      continue
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    let parsed: unknown
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      problems.push(`${name}: ${url} is not JSON`)
      continue
    }
    const released = read(parsed)
    if (released.kind === 'newer') {
      problems.push(
        `${name}: ${url} is a newer format (schema ${released.schema}) than this kit reads`,
      )
      continue
    }
    if (released.kind === 'invalid') {
      problems.push(`${name}: ${url} is not a mini app marketplace (${released.problem})`)
      continue
    }
    const listed = released.marketplace.apps.find((entry) => entry.name === name)
    if (listed?.source?.source !== 'archive') {
      problems.push(`${name}: ${url} does not build it`)
      continue
    }
    const signature = await fetchImpl(`${url}${signatureSuffix}`).catch(() => null)
    const keys = signature?.ok ? verify(bytes, await signature.text()) : null
    const signed = !!keys && 'keys' in keys && keys.keys.length > 0
    notes.push(
      `${name} ${listed.version ?? '?'} from ${released.marketplace.name}: ${signed ? 'signed' : 'not signed'}`,
    )
  }
  return { problems, notes }
}

/** What the keeper writes and the build carries into the release as it is. */
const KEPT = ['name', 'owner', 'metadata'] as const
const KEPT_CURATED = ['collections', 'blockedArchives'] as const
/** What an entry says beside its folder that the packed entry keeps: curation and revocation. */
const ENTRY_KEPT = ['featured', 'installByDefault', 'suggestFor', 'revoked'] as const

const wholeRevoked = (app: Raw) => isRecord(app.revoked) && app.revoked.versions === undefined

/**
 * The released marketplace: each folder's app packed into `outDir` by `pack` (one revoked whole is
 * not), the links as they are, stamped `published` and written as the kit's release file there.
 * Checked first, and the result read back with Localix's reader before it is written.
 */
export async function buildMarketplace(input: {
  kit: Kit
  file: string
  outDir: string
  curation: boolean
  pack: (dir: string) => Promise<Raw & { name: string }>
  now?: () => Date
}): Promise<Raw> {
  const { kit, file, outDir } = input
  const tools = kit.tools.marketplace
  const raw = await readSource(file)
  const problems = await sourceProblems(kit, raw, file, { curation: input.curation })
  if (problems.length) throw new UserError(`${file}:\n- ${problems.join('\n- ')}`)
  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(outDir, { recursive: true })
  const apps: Raw[] = []
  for (const app of appsOf(raw)) {
    if (typeof app.source !== 'string' || wholeRevoked(app)) {
      const { source, ...rest } = app
      apps.push(typeof source === 'string' ? rest : app)
      continue
    }
    const packed = await input.pack(folderOf(app.source, file)!)
    const kept = Object.fromEntries(
      ENTRY_KEPT.flatMap((key) => (app[key] === undefined ? [] : [[key, app[key]]])),
    )
    apps.push({ ...packed, ...kept })
  }
  const release: Raw = {
    schema: tools.schema,
    ...Object.fromEntries(KEPT.flatMap((key) => (raw[key] === undefined ? [] : [[key, raw[key]]]))),
    published: (input.now?.() ?? new Date()).toISOString(),
    ...Object.fromEntries(
      KEPT_CURATED.flatMap((key) => (raw[key] === undefined ? [] : [[key, raw[key]]])),
    ),
    apps,
  }
  const read = tools.read(release)
  if (read.kind !== 'marketplace')
    throw new UserError(
      `The built marketplace would not read in Localix: ${read.kind === 'invalid' ? read.problem : `schema ${read.schema}`}`,
    )
  await fs.writeFile(join(outDir, tools.releaseFile), `${JSON.stringify(release, null, 2)}\n`)
  return release
}

/** Where `file` is, said from `cwd`, for messages. */
export const shown = (file: string, cwd: string) => relative(cwd, file) || file
