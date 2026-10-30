import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { MANIFEST_FILE } from '../check/check'
import { mediaFields } from '../check/media'
import type { Kit } from '../kit/kit'
import { readAppFile } from '../lib/app-file'
import { UserError } from '../lib/errors'

/**
 * A CATALOG: what a person publishes to share mini apps, and what Localix's store reads. One gzip
 * tarball per app whose root is the app's package, and `mini-app-catalog.json` naming each archive
 * beside it with its size and sha256, plus the icon, screenshots and README published beside the
 * archive for the store page. Every URL is relative, so the folder is uploaded together — a GitHub
 * release, a site, any HTTPS host — and people add the catalog's address in Localix.
 *
 * The file is a schema 2 catalog, in the shape of a Claude Code `marketplace.json`: its `owner`
 * (the publisher), and each app with its `source`, here `archive` (Localix's
 * `docs/extending/mini-app-publishing.md`, "The catalog").
 *
 * Packing into a folder that already holds a catalog adds the app to it, replacing an earlier
 * version of the same app, so one catalog can carry several apps.
 */

export const CATALOG_FILE = 'mini-app-catalog.json'
export const CATALOG_SCHEMA = 2
const README_FILE = 'README.md'
const README_MAX_BYTES = 512 * 1024

interface PublishedFile {
  url: string
  bytes: number
  sha256: string
}

export interface CatalogApp {
  name: string
  version: string
  source: PublishedFile & { source: 'archive' }
  [key: string]: unknown
}

export interface Catalog {
  schema: number
  name: string
  owner: { name: string }
  apps: Record<string, unknown>[]
  [key: string]: unknown
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined
const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const withoutDot = (path: string) => path.replace(/^\.\//u, '')
const extensionOf = (path: string) => {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * A repository's page: `git+https://…/app.git` and `git@host:owner/app.git` both read as
 * `https://host/owner/app`; anything else names no page.
 */
function repositoryPage(repository: unknown): string | undefined {
  const page = text(repository)
    ?.trim()
    .replace(/^git\+/, '')
    .replace(/^git@([^:/\s]+):/, 'https://$1/')
    .replace(/\.git$/, '')
  return page && /^https:\/\/[^\s/]+\/\S+$/.test(page) ? page : undefined
}

/** Every regular file of the package but `skip`, keyed by its `/`-separated path. */
async function filesOf(
  dir: string,
  skip: ReadonlySet<string>,
): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {}
  const visit = async (current: string) => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.localix-') || entry.name === '.DS_Store') continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) {
        const key = relative(dir, path).split(sep).join('/')
        if (!skip.has(key)) files[key] = new Uint8Array(await fs.readFile(path))
      } else {
        throw new UserError(
          `${relative(dir, path)} is not a regular file; an archive holds only files`,
        )
      }
    }
  }
  await visit(dir)
  return files
}

async function publish(
  outDir: string,
  app: { name: string; version: string },
  label: string,
  bytes: Uint8Array,
  ext: string,
): Promise<PublishedFile> {
  const sha256 = sha256Of(bytes)
  const url = `${app.name}-${app.version}-${label}-${sha256.slice(0, 12)}.${ext}`
  await fs.writeFile(join(outDir, url), bytes)
  return { url, bytes: bytes.byteLength, sha256 }
}

/** The catalog already in `outDir`, if it is one of this schema; else a new one of `name`. */
async function readCatalog(outDir: string, name: string, owner: string): Promise<Catalog> {
  try {
    const parsed = JSON.parse(await fs.readFile(join(outDir, CATALOG_FILE), 'utf8')) as Catalog
    if (parsed.schema === CATALOG_SCHEMA && Array.isArray(parsed.apps))
      return { ...parsed, owner: { name: owner } }
  } catch {
    // No catalog yet.
  }
  return { schema: CATALOG_SCHEMA, name, owner: { name: owner }, apps: [] }
}

/** Pack one built package into the catalog at `outDir`; returns the entry it wrote. */
export async function packIntoCatalog(input: {
  kit: Kit
  packageDir: string
  outDir: string
  publisher: string
}): Promise<CatalogApp> {
  const { kit, packageDir, outDir } = input
  const manifest = JSON.parse(await fs.readFile(join(packageDir, MANIFEST_FILE), 'utf8')) as Record<
    string,
    unknown
  >
  const name = text(manifest.name)
  const version = text(manifest.version)
  if (!name) throw new UserError(`${MANIFEST_FILE} names no app`)
  if (!version) throw new UserError(`${name} has no version; a catalog app must declare one`)
  const read = (path: string) => readAppFile(packageDir, path)
  // A catalog shows every app by its icon: refuse to publish one without a valid icon.
  const problems = await kit.tools.manifest.checkMedia(mediaFields(manifest), read, {
    requireIcon: true,
  })
  if (problems.length) throw new UserError(`${name}: ${problems.join('; ')}`)

  await fs.mkdir(outDir, { recursive: true })
  const screenshots = Array.isArray(manifest.screenshots)
    ? (manifest.screenshots as { path: string; caption?: string }[])
    : []
  const bytes = await new Bun.Archive(
    await filesOf(packageDir, new Set(screenshots.map((shot) => withoutDot(shot.path)))),
    { compress: 'gzip' },
  ).bytes()
  const sha256 = sha256Of(bytes)
  // The hash in the name: a client holding an older catalog asks for a file that is gone (404),
  // never for one whose bytes changed under the same name.
  const archive = `${name}-${version}-${sha256.slice(0, 12)}.tar.gz`
  await fs.writeFile(join(outDir, archive), bytes)

  const app = { name, version }
  const iconPath = manifest.icon as string
  const iconExt = extensionOf(iconPath)
  const entry: CatalogApp = {
    name,
    ...(text(manifest.displayName) ? { displayName: manifest.displayName } : {}),
    description: text(manifest.description) ?? '',
    ...(text(manifest.category) ? { category: manifest.category } : {}),
    version,
    ...(typeof manifest.apiVersion === 'number' ? { apiVersion: manifest.apiVersion } : {}),
    source: { source: 'archive', url: archive, bytes: bytes.byteLength, sha256 },
    icon: {
      ...(await publish(outDir, app, 'icon', (await read(iconPath))!, iconExt)),
      type: kit.tools.manifest.iconTypes[iconExt],
    },
  }
  const published = []
  for (const [index, shot] of screenshots.entries()) {
    const ext = extensionOf(shot.path)
    published.push({
      ...(await publish(outDir, app, `screenshot-${index + 1}`, (await read(shot.path))!, ext)),
      type: kit.tools.manifest.screenshotTypes[ext],
      ...(text(shot.caption) ? { caption: shot.caption } : {}),
    })
  }
  if (published.length) entry.screenshots = published
  const readme = await read(README_FILE)
  if (readme && readme.byteLength <= README_MAX_BYTES) {
    entry.readme = await publish(outDir, app, 'readme', readme, 'md')
  }
  if (Array.isArray(manifest.tags) && manifest.tags.length) entry.tags = manifest.tags
  if (text(manifest.license)) entry.license = manifest.license
  // Without a site of its own, the Store's page links the repository it is released from.
  const homepage = text(manifest.homepage) ?? repositoryPage(manifest.repository)
  if (homepage) entry.homepage = homepage
  const author =
    text(manifest.author) ?? text((manifest.author as { name?: unknown } | undefined)?.name)
  if (author) entry.author = { name: author }
  if (Array.isArray(manifest.surfaces)) entry.surfaces = manifest.surfaces
  const commands = Object.keys((manifest.commands as Record<string, unknown> | undefined) ?? {})
  if (commands.length) entry.commands = commands
  const opens = fileAssociationsOf(manifest.fileAssociations)
  if (opens.length) entry.fileAssociations = opens

  // The publisher owns the catalog: Localix lists its apps as theirs.
  const catalog = await readCatalog(outDir, name, input.publisher)
  catalog.apps = [...catalog.apps.filter((other) => other.name !== name), entry].sort((a, b) =>
    String(a.name).localeCompare(String(b.name)),
  )
  await fs.writeFile(join(outDir, CATALOG_FILE), `${JSON.stringify(catalog, null, 2)}\n`)
  return entry
}

/** What `fileAssociations` says of each kind of file, its own fields only: the Store reads them. */
const ASSOCIATION_FIELDS = ['ext', 'name', 'description', 'mimeType', 'role', 'rank']

/**
 * The kinds of file the app opens, copied into its catalog entry: Localix offers the app when a
 * person opens a file of one of them and nothing they have opens it. The kit checked the manifest,
 * so this only keeps the declared fields.
 */
function fileAssociationsOf(declared: unknown): Record<string, unknown>[] {
  if (!Array.isArray(declared)) return []
  return declared.flatMap((association) =>
    association && typeof association === 'object'
      ? [
          Object.fromEntries(
            ASSOCIATION_FIELDS.flatMap((key) =>
              key in association ? [[key, (association as Record<string, unknown>)[key]]] : [],
            ),
          ),
        ]
      : [],
  )
}
