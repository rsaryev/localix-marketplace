import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { KitTools } from '../kit/kit'
import { fakeKit } from '../testing/fake-kit'
import { tempDirPerTest, writeTree } from '../testing/temp'
import { buildMarketplace, linkProblems, readSource, sourceProblems } from './marketplace'

const tempDir = tempDirPerTest('mini-app-marketplace-')
const SHA = 'b'.repeat(64)
const NOW = new Date('2026-10-30T12:00:00.000Z')

const LISTED = {
  schema: 3,
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
      source: { source: 'url', url: 'https://ada.example.test/mini-app-marketplace.json' },
    },
  ],
}

/** A repository whose `.localix-mini-app/marketplace.json` is `marketplace`, with app folders. */
function repository(marketplace: unknown, files: Record<string, string> = {}) {
  const root = tempDir()
  writeTree(root, {
    '.localix-mini-app/marketplace.json': JSON.stringify(marketplace),
    ...files,
  })
  return { root, file: join(root, '.localix-mini-app/marketplace.json') }
}

const kitWith = (marketplace: Partial<KitTools['marketplace']> = {}) => {
  const kit = fakeKit()
  return fakeKit({ tools: { marketplace: { ...kit.tools.marketplace, ...marketplace } } })
}

const manifest = (name: string) => JSON.stringify({ name, version: '1.0.0' })

describe('a marketplace as its keeper writes it', () => {
  test('Localix’s rules say what is wrong, and only the Localix marketplace may curate', async () => {
    const asked: boolean[] = []
    const kit = kitWith({
      problems: (_raw, check) => {
        asked.push(check.curation)
        return ['apps[0].featured: only the Localix marketplace curates']
      },
    })
    const { file } = repository(LISTED)
    const raw = await readSource(file)
    expect(await sourceProblems(kit, raw, file, { curation: false })).toEqual([
      'apps[0].featured: only the Localix marketplace curates',
    ])
    await sourceProblems(kit, raw, file, { curation: true })
    expect(asked).toEqual([false, true])
  })

  test('a folder entry holds the manifest of an app of that name, inside the repository', async () => {
    const { file } = repository(
      {
        ...LISTED,
        apps: [
          { name: 'kanban', source: './mini-apps/kanban' },
          { name: 'ledger', source: './mini-apps/ledger' },
          { name: 'notes', source: './mini-apps/notes' },
        ],
      },
      {
        'mini-apps/kanban/.localix-mini-app/mini-app.json': manifest('kanban'),
        'mini-apps/ledger/mini-app.json': manifest('ledger'),
        'mini-apps/notes/.localix-mini-app/mini-app.json': manifest('jottings'),
      },
    )
    expect(await sourceProblems(fakeKit(), await readSource(file), file, { curation: true })).toEqual(
      [
        'apps[1].source: ./mini-apps/ledger holds no .localix-mini-app/mini-app.json',
        'apps[2].source: ./mini-apps/notes holds the mini app jottings',
      ],
    )
  })

  test('the app’s own folder may be the marketplace’s only app', async () => {
    const { file } = repository(
      { ...LISTED, apps: [{ name: 'notes', source: '.' }] },
      { '.localix-mini-app/mini-app.json': manifest('notes') },
    )
    expect(await sourceProblems(fakeKit(), await readSource(file), file, { curation: false })).toEqual(
      [],
    )
  })

  test('a file that is not JSON is said, with where it is', async () => {
    const root = tempDir()
    writeTree(root, { '.localix-mini-app/marketplace.json': '{ apps: [' })
    await expect(readSource(join(root, '.localix-mini-app/marketplace.json'))).rejects.toThrow(
      /marketplace\.json is not a JSON file/,
    )
  })
})

describe('the links of a marketplace', () => {
  const habits = {
    schema: 3,
    name: 'habits',
    owner: { name: 'rsaryev' },
    apps: [
      {
        name: 'habit-tracker',
        version: '1.0.0',
        source: { source: 'archive', url: 'h.tar.gz', bytes: 1, sha256: SHA },
      },
    ],
  }
  const fetchFrom =
    (pages: Record<string, unknown>) => async (input: string | URL | Request) => {
      const page = pages[String(input)]
      return page === undefined
        ? new Response('missing', { status: 404 })
        : typeof page === 'string'
          ? new Response(page)
          : Response.json(page)
    }

  test('each leads to a released marketplace that builds the app, and says if it is signed', async () => {
    const release = 'https://github.com/rsaryev/habit-tracker/releases/latest/download/mini-app-marketplace.json'
    const report = await linkProblems(fakeKit(), LISTED, {
      fetchImpl: fetchFrom({ [release]: habits }) as unknown as typeof fetch,
    })
    expect(report.problems).toEqual([
      'notes: https://ada.example.test/mini-app-marketplace.json answered 404',
    ])
    expect(report.notes).toEqual(['habit-tracker 1.0.0 from habits: not signed'])
  })

  test('a release Localix would not read, or that does not build the app, is a problem', async () => {
    const kit = kitWith({
      read: (raw) =>
        (raw as { schema: number }).schema === 4
          ? { kind: 'newer', schema: 4 }
          : { kind: 'marketplace', marketplace: raw as never },
    })
    const report = await linkProblems(kit, LISTED, {
      fetchImpl: fetchFrom({
        'https://github.com/rsaryev/habit-tracker/releases/latest/download/mini-app-marketplace.json':
          { ...habits, schema: 4 },
        'https://ada.example.test/mini-app-marketplace.json': { ...habits, apps: [] },
      }) as unknown as typeof fetch,
    })
    expect(report.problems).toEqual([
      'habit-tracker: https://github.com/rsaryev/habit-tracker/releases/latest/download/mini-app-marketplace.json is a newer format (schema 4) than this kit reads',
      'notes: https://ada.example.test/mini-app-marketplace.json does not build it',
    ])
  })
})

describe('building a marketplace', () => {
  const SOURCE = {
    $schema: 'https://localix.ai/schemas/mini-app-marketplace/v3.json',
    schema: 3,
    name: 'localix',
    owner: { name: 'Localix' },
    metadata: { description: 'Localix’s own' },
    collections: [{ id: 'play', title: 'Play', style: 'row', items: ['kanban'] }],
    apps: [
      { name: 'gone', revoked: { reason: 'It leaked notes.' } },
      {
        name: 'habit-tracker',
        description: 'Habits, by their author.',
        source: { source: 'github', repo: 'rsaryev/habit-tracker' },
        featured: true,
      },
      {
        name: 'kanban',
        source: './mini-apps/kanban',
        installByDefault: true,
        suggestFor: { files: ['TODO.md'] },
        revoked: { reason: 'Loses cards.', versions: ['1.1.0'] },
      },
    ],
  }

  test('each folder packed, the links and the curation kept, and the release stamped', async () => {
    const { root, file } = repository(SOURCE, {
      'mini-apps/kanban/.localix-mini-app/mini-app.json': manifest('kanban'),
    })
    const outDir = join(root, 'dist/marketplace')
    const packed: string[] = []
    const release = await buildMarketplace({
      kit: fakeKit(),
      file,
      outDir,
      curation: true,
      now: () => NOW,
      pack: async (dir) => {
        packed.push(dir)
        return {
          name: 'kanban',
          version: '1.2.0',
          source: { source: 'archive', url: 'k.tar.gz', bytes: 1, sha256: SHA },
        }
      },
    })
    expect(packed).toEqual([join(root, 'mini-apps/kanban')])
    expect(release).toEqual({
      schema: 3,
      name: 'localix',
      owner: { name: 'Localix' },
      metadata: { description: 'Localix’s own' },
      published: '2026-10-30T12:00:00.000Z',
      collections: [{ id: 'play', title: 'Play', style: 'row', items: ['kanban'] }],
      apps: [
        { name: 'gone', revoked: { reason: 'It leaked notes.' } },
        {
          name: 'habit-tracker',
          description: 'Habits, by their author.',
          source: { source: 'github', repo: 'rsaryev/habit-tracker' },
          featured: true,
        },
        {
          name: 'kanban',
          version: '1.2.0',
          source: { source: 'archive', url: 'k.tar.gz', bytes: 1, sha256: SHA },
          installByDefault: true,
          suggestFor: { files: ['TODO.md'] },
          revoked: { reason: 'Loses cards.', versions: ['1.1.0'] },
        },
      ],
    })
    expect(JSON.parse(readFileSync(join(outDir, 'mini-app-marketplace.json'), 'utf8'))).toEqual(
      release,
    )
  })

  test('a marketplace with problems builds nothing, and says every one', async () => {
    const { root, file } = repository(SOURCE)
    const kit = kitWith({ problems: () => ['collections: only the Localix marketplace curates'] })
    await expect(
      buildMarketplace({
        kit,
        file,
        outDir: join(root, 'out'),
        curation: false,
        pack: async () => ({ name: 'x' }),
      }),
    ).rejects.toThrow(
      /collections: only the Localix marketplace curates\n- apps\[2\]\.source: \.\/mini-apps\/kanban holds no/,
    )
  })

  test('a release Localix would not read is not written', async () => {
    const { root, file } = repository(SOURCE, {
      'mini-apps/kanban/.localix-mini-app/mini-app.json': manifest('kanban'),
    })
    const kit = kitWith({ read: () => ({ kind: 'invalid', problem: 'apps: not a list' }) })
    await expect(
      buildMarketplace({
        kit,
        file,
        outDir: join(root, 'out'),
        curation: true,
        pack: async () => ({ name: 'kanban' }),
      }),
    ).rejects.toThrow('The built marketplace would not read in Localix: apps: not a list')
  })
})
