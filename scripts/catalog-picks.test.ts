import { expect, test } from 'bun:test'

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
