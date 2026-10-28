/**
 * What Localix's own catalog says beyond its apps (`mini-apps/catalog-picks.json`): which apps the
 * store features, which a new installation gets on its own, Discover's collections — and that its
 * publisher is Localix, verified. Localix honours all of it only for the catalog it vouches for;
 * from any other source the same fields are ignored.
 *
 * A collection item is an app's name or `<kind>:<id>` for another kind
 * (`plugin:<name>@<marketplace>`). A pick that names no app in the catalog is a typo that would
 * quietly drop the app from the store's top, so it stops the release.
 */
export interface CatalogCollection {
  id: string
  title: string
  subtitle?: string
  style: 'row' | 'grid' | string
  items: string[]
}

export interface CatalogPicks {
  featured?: string[]
  recommended?: string[]
  collections?: CatalogCollection[]
}

interface CatalogApp {
  name: string
  publisher: { name: string; verified: boolean }
}

interface Catalog<App extends CatalogApp> {
  schema: number
  apps: App[]
  editorial?: { collections: CatalogCollection[] }
}

export function withCatalogPicks<App extends CatalogApp>(
  catalog: Catalog<App>,
  picks: CatalogPicks,
): Catalog<App> {
  const names = new Set(catalog.apps.map((app) => app.name))
  const featured = picks.featured ?? []
  const recommended = picks.recommended ?? []
  const collections = picks.collections ?? []
  const unknown = [
    ...featured,
    ...recommended,
    ...collections.flatMap((collection) => collection.items.filter((item) => !item.includes(':'))),
  ].filter((name) => !names.has(name))
  if (unknown.length) {
    throw new Error(`catalog-picks.json names apps the catalog does not have: ${unknown.join(', ')}`)
  }
  return {
    ...catalog,
    apps: catalog.apps.map((app) => ({
      ...app,
      publisher: { ...app.publisher, verified: true },
      ...(featured.includes(app.name) ? { featured: true } : {}),
      ...(recommended.includes(app.name) ? { recommended: true } : {}),
    })),
    ...(collections.length ? { editorial: { collections } } : {}),
  }
}
