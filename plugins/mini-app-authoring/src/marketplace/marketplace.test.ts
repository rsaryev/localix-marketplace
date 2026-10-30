import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { tempDirPerTest, writeTree } from '../testing/temp'
import {
  buildMarketplace,
  linkProblems,
  marketplaceProblems,
  readMarketplace,
  type Marketplace,
} from './marketplace'

const tempDir = tempDirPerTest('mini-app-marketplace-')

const LISTED = {
  schema: 2,
  name: 'localix-community',
  owner: { name: 'Localix Community' },
  apps: [
    {
      name: 'habit-tracker',
      description: 'Track daily habits with the agent.',
      source: { source: 'github', repo: 'rsaryev/habit-tracker' },
    },
    {
      name: 'notes',
      description: 'Notes beside every chat.',
      source: { source: 'url', url: 'https://ada.example.test/mini-app-catalog.json' },
    },
  ],
}

/** A repository whose `.mini-app/marketplace.json` lists `marketplace`, with app folders. */
function repository(marketplace: unknown, files: Record<string, string> = {}) {
  const root = tempDir()
  writeTree(root, { '.mini-app/marketplace.json': JSON.stringify(marketplace), ...files })
  return { root, file: join(root, '.mini-app/marketplace.json') }
}

const problemsOf = async (marketplace: unknown, files?: Record<string, string>) => {
  const { file } = repository(marketplace, files)
  return marketplaceProblems(await readMarketplace(file), file)
}

describe('a mini app marketplace', () => {
  test('a list of links in the shape of a Claude Code marketplace passes', async () => {
    expect(await problemsOf(LISTED)).toEqual([])
  })

  test('says what is wrong with each entry, by name', async () => {
    const problems = await problemsOf({
      ...LISTED,
      name: 'Localix Community',
      apps: [
        LISTED.apps[1],
        LISTED.apps[0],
        { ...LISTED.apps[0], source: { source: 'url', url: 'http://plain.example.test/c.json' } },
        { name: 'short', description: 'Too short', source: { source: 'github', repo: 'a/b' } },
        {
          name: 'hidden',
          description: 'Looks fine​ here.',
          source: { source: 'github', repo: 'a/b' },
        },
        {
          name: 'shell',
          description: 'A repo with a shell.',
          source: { source: 'github', repo: 'a/b;rm' },
        },
        {
          name: 'git',
          description: 'Not a catalog source.',
          source: { source: 'git-subdir', url: 'a/b' },
        },
      ],
    })
    expect(problems).toEqual([
      'name: Localix Community is not lower-case words joined by dashes',
      'apps are not sorted by name: habit-tracker comes after notes',
      'habit-tracker is listed twice',
      'habit-tracker: a url source is an https:// address',
      'short: a description is 10 to 2000 characters',
      'hidden: name or description holds an invisible character',
      'shell: a github source is <owner>/<repo>',
      'git: the source is a folder ("./…"), github, url or archive',
    ])
  })

  test('a folder entry is an app of that name, inside the repository', async () => {
    const problems = await problemsOf(
      {
        ...LISTED,
        apps: [
          { name: 'kanban', source: './mini-apps/kanban' },
          { name: 'notes', source: './mini-apps/notes' },
          { name: 'outside', source: '../elsewhere' },
        ],
        metadata: {
          localix: {
            featured: ['kanban', 'ghost'],
            collections: [{ items: ['plugin:x@y', 'nope'] }],
          },
        },
      },
      {
        'mini-apps/kanban/mini-app.json': '{"name":"kanban"}',
        'mini-apps/notes/mini-app.json': '{"name":"jottings"}',
      },
    )
    expect(problems).toEqual([
      'notes: ./mini-apps/notes holds the mini app jottings',
      'outside: the source is a folder ("./…"), github, url or archive',
      'metadata.localix: ghost is not an app of this marketplace',
      'metadata.localix: nope is not an app of this marketplace',
    ])
  })

  test('each link leads to a catalog that lists the app, and takes no reserved name', async () => {
    const habits = {
      schema: 2,
      name: 'habits',
      owner: { name: 'rsaryev' },
      apps: [
        {
          name: 'habit-tracker',
          version: '1.0.0',
          source: { source: 'archive', url: 'h.tar.gz', bytes: 1, sha256: 'a'.repeat(64) },
        },
      ],
    }
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input)
      if (
        url ===
        'https://github.com/rsaryev/habit-tracker/releases/latest/download/mini-app-catalog.json'
      )
        return Response.json(habits)
      if (url.endsWith('.sig')) return new Response('', { status: 404 })
      if (url === 'https://localix.example.test/mini-app-catalog.json')
        return Response.json({
          schema: 2,
          name: 'localix',
          owner: { name: 'Localix' },
          apps: [{ name: 'notes' }],
        })
      return new Response('missing', { status: 404 })
    }) as unknown as typeof fetch
    const report = await linkProblems(LISTED as Marketplace, {
      fetchImpl,
      reserved: 'https://localix.example.test/mini-app-catalog.json',
    })
    expect(report.problems).toEqual([
      'notes: the name is taken by https://localix.example.test/mini-app-catalog.json',
      'notes: its catalog https://ada.example.test/mini-app-catalog.json answered 404',
    ])
    expect(report.notes).toEqual(['habit-tracker 1.0.0: not signed'])
  })

  test('builds a catalog: each folder packed, the links and Localix’s picks as they are', async () => {
    const { root, file } = repository(
      {
        schema: 2,
        name: 'localix',
        owner: { name: 'Localix' },
        metadata: { description: 'Localix’s own', localix: { featured: ['kanban'] } },
        apps: [
          {
            name: 'habit-tracker',
            description: 'Habits, by their author.',
            source: { source: 'github', repo: 'rsaryev/habit-tracker' },
          },
          { name: 'kanban', source: './mini-apps/kanban' },
        ],
      },
      { 'mini-apps/kanban/mini-app.json': '{"name":"kanban"}' },
    )
    const outDir = join(root, 'dist/catalog')
    const packed: string[] = []
    const catalog = await buildMarketplace({
      file,
      outDir,
      pack: async (dir) => {
        packed.push(dir)
        return {
          name: 'kanban',
          version: '1.2.0',
          source: { source: 'archive', url: 'k.tar.gz', bytes: 1, sha256: 'b'.repeat(64) },
        }
      },
    })
    expect(packed).toEqual([join(root, 'mini-apps/kanban')])
    expect(catalog).toEqual({
      schema: 2,
      name: 'localix',
      owner: { name: 'Localix' },
      metadata: { description: 'Localix’s own', localix: { featured: ['kanban'] } },
      apps: [
        {
          name: 'habit-tracker',
          description: 'Habits, by their author.',
          source: { source: 'github', repo: 'rsaryev/habit-tracker' },
        },
        {
          name: 'kanban',
          version: '1.2.0',
          source: { source: 'archive', url: 'k.tar.gz', bytes: 1, sha256: 'b'.repeat(64) },
        },
      ],
    })
    expect(JSON.parse(readFileSync(join(outDir, 'mini-app-catalog.json'), 'utf8'))).toEqual(catalog)
  })
})
