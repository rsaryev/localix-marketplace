import { existsSync, promises as fs } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

import { UserError } from '../lib/errors'
import { CATALOG_FILE, CATALOG_SCHEMA } from '../package/pack'

/**
 * A MINI APP MARKETPLACE: the file a repository of mini apps keeps, `.mini-app/marketplace.json`,
 * in the shape of Claude Code's `.claude-plugin/marketplace.json` — a `name`, an `owner`,
 * `metadata` (Localix's picks under `metadata.localix`) and `apps`, each with a `source`:
 *
 * - `"./mini-apps/notes"`, a folder of this repository, which `buildMarketplace` packs;
 * - `{ "source": "github", "repo": "ada/notes" }`, the catalog the repository's latest release
 *   publishes (what `mini-app ci` releases);
 * - `{ "source": "url", "url": "https://…/mini-app-catalog.json" }`, a catalog at an address;
 * - `{ "source": "archive", … }`, a built app beside the catalog (what packing writes).
 *
 * Built, it is a catalog Localix reads, with the folders' apps as archives and the links as they
 * are: Localix reads a linked app from its own catalog, signed by its own author. The checks are
 * those of Anthropic's community marketplace, where they apply: sorted unique names, bounded
 * descriptions, https only, no shell metacharacters and no invisible characters.
 */

export const MARKETPLACE_FILE = join('.mini-app', 'marketplace.json')

type Source =
  | string
  | { source: 'github'; repo: string }
  | { source: 'url'; url: string }
  | { source: 'archive'; url: string; bytes: number; sha256: string }

export interface MarketplaceApp {
  name: string
  description?: string
  source: Source
  [key: string]: unknown
}

export interface Marketplace {
  schema: number
  name: string
  owner: { name: string }
  metadata?: {
    description?: string
    localix?: {
      featured?: string[]
      recommended?: string[]
      suits?: Record<string, unknown>
      collections?: { items?: unknown[] }[]
    }
  }
  apps: MarketplaceApp[]
}

const NAME = /^[a-z0-9][a-z0-9-]{1,63}$/
const APP_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const HTTPS = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[A-Za-z0-9./_~%-]*$/
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/

export async function readMarketplace(file: string): Promise<Marketplace> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    throw new UserError(`${file} is not a JSON file: ${(error as Error).message}`)
  }
  const marketplace = parsed as Partial<Marketplace>
  if (marketplace?.schema !== CATALOG_SCHEMA || !Array.isArray(marketplace.apps))
    throw new UserError(`${file} is not a schema ${CATALOG_SCHEMA} marketplace with an apps list`)
  return marketplace as Marketplace
}

/** The folder a `"./…"` source names, inside the repository the file sits in, or null. */
function folderOf(source: string, file: string): string | null {
  if (!source.startsWith('./') || source.split('/').includes('..')) return null
  const root = dirname(dirname(file))
  const dir = resolve(root, source)
  return dir === root || dir.startsWith(`${root}${sep}`) ? dir : null
}

/** What is wrong with each entry's source, or null. */
async function sourceProblem(app: MarketplaceApp, file: string): Promise<string | null> {
  const { source } = app
  const kinds = 'the source is a folder ("./…"), github, url or archive'
  if (typeof source === 'string') {
    const dir = folderOf(source, file)
    if (!dir) return kinds
    if (!existsSync(join(dir, 'mini-app.json'))) return `${source} holds no mini-app.json`
    const manifest = JSON.parse(await fs.readFile(join(dir, 'mini-app.json'), 'utf8'))
    return manifest.name === app.name ? null : `${source} holds the mini app ${manifest.name}`
  }
  if (source?.source === 'github')
    return REPO.test(source.repo ?? '') ? null : 'a github source is <owner>/<repo>'
  if (source?.source === 'url')
    return HTTPS.test(source.url ?? '') ? null : 'a url source is an https:// address'
  if (source?.source === 'archive')
    return /^[a-f0-9]{64}$/.test(source.sha256 ?? '') ? null : 'an archive is pinned by its sha256'
  return kinds
}

/** Everything the file says that Localix would not read as meant, one line each. */
export async function marketplaceProblems(m: Marketplace, file: string): Promise<string[]> {
  const problems: string[] = []
  if (!NAME.test(m.name ?? ''))
    problems.push(`name: ${m.name} is not lower-case words joined by dashes`)
  if (!m.owner?.name?.trim()) problems.push('owner: name who keeps it')
  const names = m.apps.map((app) => app.name)
  const unsorted = names.findIndex((name, at) => at > 0 && name < names[at - 1]!)
  if (unsorted > 0)
    problems.push(
      `apps are not sorted by name: ${names[unsorted]} comes after ${names[unsorted - 1]}`,
    )
  const seen = new Set<string>()
  for (const app of m.apps) {
    const say = (problem: string) => problems.push(`${app.name}: ${problem}`)
    if (seen.has(app.name)) problems.push(`${app.name} is listed twice`)
    seen.add(app.name)
    if (!APP_NAME.test(app.name ?? '')) say('a name is letters, digits, dashes or underscores')
    const linked = typeof app.source === 'object' && app.source?.source !== 'archive'
    const description = app.description ?? ''
    if (
      linked &&
      (description.length < 10 || description.length > 2000 || description !== description.trim())
    )
      say('a description is 10 to 2000 characters')
    if (INVISIBLE.test(`${app.name}${description}`))
      say('name or description holds an invisible character')
    const problem = await sourceProblem(app, file)
    if (problem) say(problem)
  }
  const picks = m.metadata?.localix
  const picked = [
    ...(picks?.featured ?? []),
    ...(picks?.recommended ?? []),
    ...Object.keys(picks?.suits ?? {}),
    ...(picks?.collections ?? []).flatMap((collection) =>
      (collection.items ?? []).filter(
        (item): item is string => typeof item === 'string' && !item.includes(':'),
      ),
    ),
  ]
  for (const name of new Set(picked))
    if (!seen.has(name))
      problems.push(`metadata.localix: ${name} is not an app of this marketplace`)
  return problems
}

/** The catalog a link names, as Localix resolves it. */
export function linkedCatalog(source: Source): string | null {
  if (typeof source !== 'object') return null
  if (source.source === 'github')
    return `https://github.com/${source.repo}/releases/latest/download/${CATALOG_FILE}`
  return source.source === 'url' ? source.url : null
}

async function readJson(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`answered ${response.status}`)
  return (await response.json()) as { schema?: number; apps?: Record<string, unknown>[] }
}

/**
 * Each link followed: its catalog answers, is a catalog, lists the app; its name is not one the
 * `reserved` catalog (Localix's own) has. `notes` says what each linked app is, signed or not.
 */
export async function linkProblems(
  m: Marketplace,
  opts: { fetchImpl?: typeof fetch; reserved?: string } = {},
): Promise<{ problems: string[]; notes: string[] }> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const problems: string[] = []
  const notes: string[] = []
  const reserved = opts.reserved
    ? new Set(((await readJson(opts.reserved, fetchImpl)).apps ?? []).map((app) => app.name))
    : new Set()
  for (const app of m.apps) {
    const url = linkedCatalog(app.source)
    if (!url) continue
    if (reserved.has(app.name)) problems.push(`${app.name}: the name is taken by ${opts.reserved}`)
    let catalog: Awaited<ReturnType<typeof readJson>>
    try {
      catalog = await readJson(url, fetchImpl)
    } catch (error) {
      problems.push(`${app.name}: its catalog ${url} ${(error as Error).message}`)
      continue
    }
    if (![1, 2].includes(catalog.schema ?? 0) || !Array.isArray(catalog.apps)) {
      problems.push(`${app.name}: ${url} is not a mini app catalog`)
      continue
    }
    const listed = catalog.apps.find((entry) => entry.name === app.name)
    if (!listed) {
      problems.push(`${app.name}: ${url} does not list it`)
      continue
    }
    const signed = (await fetchImpl(`${url}.sig`)).ok
    notes.push(`${app.name} ${listed.version ?? '?'}: ${signed ? 'signed' : 'not signed'}`)
  }
  return { problems, notes }
}

/**
 * The catalog of a marketplace: each folder's app packed into `outDir` by `pack`, the links and
 * Localix's picks as they are, written as `mini-app-catalog.json` there.
 */
export async function buildMarketplace(input: {
  file: string
  outDir: string
  pack: (dir: string) => Promise<Record<string, unknown> & { name: string }>
}): Promise<Marketplace> {
  const m = await readMarketplace(input.file)
  const problems = await marketplaceProblems(m, input.file)
  if (problems.length) throw new UserError(`${input.file}:\n- ${problems.join('\n- ')}`)
  await fs.rm(input.outDir, { recursive: true, force: true })
  await fs.mkdir(input.outDir, { recursive: true })
  const apps: MarketplaceApp[] = []
  for (const app of m.apps) {
    if (typeof app.source !== 'string') {
      apps.push(app)
      continue
    }
    const packed = await input.pack(folderOf(app.source, input.file)!)
    apps.push(packed as MarketplaceApp)
  }
  const catalog: Marketplace = {
    schema: CATALOG_SCHEMA,
    name: m.name,
    owner: m.owner,
    ...(m.metadata ? { metadata: m.metadata } : {}),
    apps,
  }
  await fs.writeFile(join(input.outDir, CATALOG_FILE), `${JSON.stringify(catalog, null, 2)}\n`)
  return catalog
}

/** Where `file` is, said from `cwd`, for messages. */
export const shown = (file: string, cwd: string) => relative(cwd, file) || file
