import { expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { withCatalogPicks } from './catalog-picks'

const app = (name: string) => ({
  name,
  version: '1.0.0',
  publisher: { name: 'Localix', verified: false },
  archive: { url: `${name}.tar.gz`, bytes: 1, sha256: 'a'.repeat(64) },
})

test('the Localix catalog carries its picks and vouches for its publisher', () => {
  const catalog = { schema: 1, apps: [app('chess'), app('kanban'), app('snake')] }
  const picks = {
    featured: ['chess', 'kanban'],
    recommended: ['kanban'],
    collections: [
      {
        id: 'play',
        title: 'Play with the agent',
        subtitle: 'Games',
        style: 'row',
        items: ['chess', 'plugin:neon@claude-plugins-official'],
      },
    ],
  }

  const picked = withCatalogPicks(catalog, picks)

  expect(picked.apps).toEqual([
    { ...app('chess'), publisher: { name: 'Localix', verified: true }, featured: true },
    {
      ...app('kanban'),
      publisher: { name: 'Localix', verified: true },
      featured: true,
      recommended: true,
    },
    { ...app('snake'), publisher: { name: 'Localix', verified: true } },
  ])
  expect(picked.editorial).toEqual({ collections: picks.collections })
})

test('a pick that names no app in the catalog stops the release', () => {
  const catalog = { schema: 1, apps: [app('chess')] }
  expect(() => withCatalogPicks(catalog, { featured: ['chesss'] })).toThrow('chesss')
  expect(() =>
    withCatalogPicks(catalog, {
      collections: [{ id: 'play', title: 'Play', style: 'row', items: ['chesss'] }],
    }),
  ).toThrow('chesss')
})

test('what an app is for reaches its entry, so Localix recommends it beside those files', () => {
  const catalog = { schema: 1, apps: [app('database'), app('chess')] }

  const picked = withCatalogPicks(catalog, {
    suits: { database: { files: ['*.sql'], dependencies: ['pg'] } },
  })

  expect(picked.apps[0]).toMatchObject({ suits: { files: ['*.sql'], dependencies: ['pg'] } })
  expect(picked.apps[1]).not.toHaveProperty('suits')
})

test('what an app is for, said of an app the catalog does not have or not as names, stops the release', () => {
  const catalog = { schema: 1, apps: [app('database')] }
  expect(() => withCatalogPicks(catalog, { suits: { databse: { files: ['*.sql'] } } })).toThrow(
    'databse',
  )
  expect(() =>
    withCatalogPicks(catalog, { suits: { database: { files: '*.sql' } } } as never),
  ).toThrow('database')
  expect(() => withCatalogPicks(catalog, { suits: { database: {} } })).toThrow('database')
})

test('this repository’s picks name only its own apps and read, so a typo fails here, not at release', () => {
  const dir = join(import.meta.dir, '..', 'mini-apps')
  const names = readdirSync(dir).filter((name) => existsSync(join(dir, name, 'mini-app.json')))
  const picks = JSON.parse(readFileSync(join(dir, 'catalog-picks.json'), 'utf8'))

  expect(() => withCatalogPicks({ schema: 1, apps: names.map(app) }, picks)).not.toThrow()
})
