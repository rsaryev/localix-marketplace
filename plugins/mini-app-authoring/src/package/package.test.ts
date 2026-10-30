import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fakeKit } from '../testing/fake-kit'
import { tempDirPerTest, writeTree } from '../testing/temp'
import { assemblePackage, PACKAGE_DIR } from './assemble'
import { packIntoMarketplace } from './pack'
import { validatePackage } from './validate'

const tempDir = tempDirPerTest('mini-app-package-')

const MANIFEST = {
  name: 'gpu-monitor',
  version: '0.2.0',
  description: 'Watch the GPU.',
  backend: './backend/index.ts',
  icon: './icon.svg',
  guide: './guide.md',
  screenshots: [{ path: './media/main.png', caption: 'The board' }],
}

/** A source folder after a passing check: the candidate holds the built backend and UI. */
function checkedApp() {
  const dir = tempDir()
  writeTree(dir, {
    '.localix-mini-app/mini-app.json': JSON.stringify(MANIFEST),
    'guide.md': '# Guide',
    'icon.svg': '<svg/>',
    'media/main.png': 'png',
    'README.md': '# GPU Monitor',
    'backend/index.ts': 'export {}',
    'backend/index.test.ts': 'test',
    'ui/Workspace.tsx': 'export {}',
    'AGENTS.md': 'for the agent',
    'package.json': '{}',
    '.env': 'SECRET=1',
    'node_modules/zod/index.js': '',
    'dist/.candidate-1/dist/backend/index-abc.mjs': 'export {}',
    'dist/.candidate-1/dist/ui/artifact.json': '{}',
  })
  const outputs = {
    dir: join(dir, 'dist/.candidate-1'),
    manifest: MANIFEST,
    backend: './dist/backend/index-abc.mjs',
    hasUi: true,
  }
  return { dir, outputs }
}

const files = (root: string, dir = root): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(root, join(dir, entry.name))
      : [join(dir, entry.name).slice(root.length + 1)],
  )

describe('assemblePackage', () => {
  test('carries the built code and what the app reads, and leaves sources and secrets behind', async () => {
    const { dir, outputs } = checkedApp()
    const packageDir = await assemblePackage(dir, outputs)
    expect(packageDir).toBe(join(dir, PACKAGE_DIR))
    expect(files(packageDir).sort()).toEqual([
      '.localix-mini-app/mini-app.json',
      'README.md',
      'dist/backend/index-abc.mjs',
      'dist/ui/artifact.json',
      'guide.md',
      'icon.svg',
      'media/main.png',
    ])
    const manifest = JSON.parse(readFileSync(join(packageDir, '.localix-mini-app/mini-app.json'), 'utf8'))
    expect(manifest.backend).toBe('./dist/backend/index-abc.mjs')
  })

  test('authoring names are left behind at the package root only, not inside shipped folders', async () => {
    const { dir, outputs } = checkedApp()
    writeTree(dir, {
      'assets/preview/shot.txt': 'shipped',
      'data/package.json': '{"shipped":true}',
      'preview/draft.txt': 'authoring',
    })
    const packageDir = await assemblePackage(dir, outputs)
    expect(files(packageDir)).toContain('assets/preview/shot.txt')
    expect(files(packageDir)).toContain('data/package.json')
    expect(files(packageDir)).not.toContain('preview/draft.txt')
    expect(files(packageDir)).not.toContain('package.json')
  })

  test('the docs for readers of its repository stay behind, unless the manifest names one', async () => {
    const { dir } = checkedApp()
    writeTree(dir, {
      'docs/gpu-monitor.md': '# GPU Monitor',
      'docs/assets/board.png': 'png',
      'docs/help.md': '# Help',
    })
    const manifest = { ...MANIFEST, guide: './docs/help.md' }
    writeTree(dir, { '.localix-mini-app/mini-app.json': JSON.stringify(manifest) })
    const outputs = {
      dir: join(dir, 'dist/.candidate-1'),
      manifest,
      backend: './dist/backend/index-abc.mjs',
      hasUi: true,
    }
    const shipped = files(await assemblePackage(dir, outputs))
    expect(shipped).toContain('docs/help.md')
    expect(shipped).not.toContain('docs/gpu-monitor.md')
    expect(shipped).not.toContain('docs/assets/board.png')
  })

  test('a second build replaces the first package whole', async () => {
    const { dir, outputs } = checkedApp()
    await assemblePackage(dir, outputs)
    writeTree(join(dir, PACKAGE_DIR), { 'stale.txt': 'old' })
    await assemblePackage(dir, outputs)
    expect(existsSync(join(dir, PACKAGE_DIR, 'stale.txt'))).toBe(false)
  })
})

describe('validatePackage', () => {
  test('a built package is valid', async () => {
    const { dir, outputs } = checkedApp()
    const verdict = await validatePackage(fakeKit(), await assemblePackage(dir, outputs))
    expect(verdict).toEqual({ ok: true, name: 'gpu-monitor', problems: [], warnings: [] })
  })

  test('a source folder is not a package, and a named file must be there', async () => {
    const dir = tempDir()
    writeTree(dir, { '.localix-mini-app/mini-app.json': JSON.stringify(MANIFEST), 'icon.svg': '<svg/>' })
    const verdict = await validatePackage(fakeKit(), dir)
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join('\n')).toContain('backend ./backend/index.ts is a source file')
    expect(verdict.problems.join('\n')).toContain(
      './guide.md is named in .localix-mini-app/mini-app.json but missing',
    )
  })

  test('the SDK schema’s problems and the media rules come from the kit', async () => {
    const { dir, outputs } = checkedApp()
    const kit = fakeKit({
      tools: {
        manifest: {
          ...fakeKit().tools.manifest,
          validate: async () => ({
            name: 'gpu-monitor',
            errors: ['Invalid .localix-mini-app/mini-app.json: version: invalid'],
            warnings: [],
          }),
          checkMedia: async () => ['icon.svg is not a square'],
        },
      },
    })
    const verdict = await validatePackage(kit, await assemblePackage(dir, outputs))
    expect(verdict.problems).toEqual(['Invalid .localix-mini-app/mini-app.json: version: invalid'])
    expect(verdict.warnings).toEqual(['icon.svg is not a square'])
  })
})

const RELEASE = 'mini-app-marketplace.json'
const NOW = () => new Date('2026-10-30T12:00:00.000Z')
const release = (outDir: string) => JSON.parse(readFileSync(join(outDir, RELEASE), 'utf8'))

describe('packIntoMarketplace', () => {
  test('publishes the archive and the store media beside a marketplace that names them', async () => {
    const { dir, outputs } = checkedApp()
    const packageDir = await assemblePackage(dir, outputs)
    const outDir = tempDir()
    const entry = await packIntoMarketplace({
      kit: fakeKit(),
      packageDir,
      outDir,
      publisher: 'Ada',
      now: NOW,
    })
    // A released marketplace of the kit's schema, named after the app: the publisher keeps it,
    // and the app's source is its archive beside it.
    expect(release(outDir)).toEqual({
      schema: 3,
      name: 'gpu-monitor',
      owner: { name: 'Ada' },
      published: '2026-10-30T12:00:00.000Z',
      apps: [entry],
    })
    expect(entry.source).toMatchObject({ source: 'archive' })
    expect(entry.icon).toMatchObject({ type: 'image/svg+xml' })
    for (const file of [entry.source, entry.icon, ...(entry.screenshots as [])] as {
      url: string
    }[]) {
      expect(existsSync(join(outDir, file.url))).toBe(true)
    }

    const archive = new Bun.Archive(readFileSync(join(outDir, entry.source.url)))
    const inside = [...(await archive.files()).keys()]
    expect(inside).toContain('.localix-mini-app/mini-app.json')
    expect(inside).not.toContain('media/main.png')
  })

  test('the packed archive validates although the screenshots are published beside it', async () => {
    const { dir, outputs } = checkedApp()
    const packageDir = await assemblePackage(dir, outputs)
    const outDir = tempDir()
    const entry = await packIntoMarketplace({ kit: fakeKit(), packageDir, outDir, publisher: 'Ada' })
    const verdict = await validatePackage(fakeKit(), join(outDir, entry.source.url))
    expect(verdict).toEqual({ ok: true, name: 'gpu-monitor', problems: [], warnings: [] })
  })

  test('packing another version replaces the app in the same marketplace, keeping its name', async () => {
    const { dir, outputs } = checkedApp()
    const packageDir = await assemblePackage(dir, outputs)
    const outDir = tempDir()
    await packIntoMarketplace({ kit: fakeKit(), packageDir, outDir, publisher: 'Ada' })
    writeTree(packageDir, {
      '.localix-mini-app/mini-app.json': JSON.stringify({
        ...MANIFEST,
        name: 'gpu-alerts',
        version: '0.3.0',
      }),
    })
    await packIntoMarketplace({ kit: fakeKit(), packageDir, outDir, publisher: 'Ada' })
    writeTree(packageDir, {
      '.localix-mini-app/mini-app.json': JSON.stringify({ ...MANIFEST, version: '0.3.0' }),
    })
    await packIntoMarketplace({ kit: fakeKit(), packageDir, outDir, publisher: 'Ada' })
    const packed = release(outDir)
    expect(packed.name).toBe('gpu-monitor')
    expect(packed.apps.map((app: { name: string; version: string }) => `${app.name} ${app.version}`)).toEqual([
      'gpu-alerts 0.3.0',
      'gpu-monitor 0.3.0',
    ])
  })

  // An app's name may hold capitals and underscores; a marketplace's is lower-case words and dashes.
  test('a new marketplace is named after its first app, as a marketplace may be named', async () => {
    const { dir, outputs } = checkedApp()
    const packageDir = await assemblePackage(dir, outputs)
    writeTree(packageDir, {
      '.localix-mini-app/mini-app.json': JSON.stringify({ ...MANIFEST, name: 'GPU_Monitor' }),
    })
    const outDir = tempDir()
    await packIntoMarketplace({ kit: fakeKit(), packageDir, outDir, publisher: 'Ada' })
    expect(release(outDir).name).toBe('gpu-monitor')
  })

  test('a marketplace Localix would not read is not written', async () => {
    const { dir, outputs } = checkedApp()
    const packageDir = await assemblePackage(dir, outputs)
    const kit = fakeKit({
      tools: {
        marketplace: {
          ...fakeKit().tools.marketplace,
          read: () => ({ kind: 'invalid', problem: 'owner: who keeps it' }),
        },
      },
    })
    const outDir = tempDir()
    await expect(
      packIntoMarketplace({ kit, packageDir, outDir, publisher: ' ' }),
    ).rejects.toThrow('The packed marketplace would not read in Localix: owner: who keeps it')
    expect(existsSync(join(outDir, RELEASE))).toBe(false)
  })

  // Localix reads the author as one name; the manifest may say it either way.
  test('the author is a name', async () => {
    const { dir, outputs } = checkedApp()
    const packageDir = await assemblePackage(dir, outputs)
    writeTree(packageDir, {
      '.localix-mini-app/mini-app.json': JSON.stringify({ ...MANIFEST, author: { name: 'Ada' } }),
    })
    const entry = await packIntoMarketplace({
      kit: fakeKit(),
      packageDir,
      outDir: tempDir(),
      publisher: 'Ada',
    })
    expect(entry.author).toBe('Ada')
  })

  test('the files it opens travel in its marketplace entry, so the Store can offer it for one', async () => {
    const { dir, outputs } = checkedApp()
    const packageDir = await assemblePackage(dir, outputs)
    const opens = [
      { ext: ['gpu', 'gpulog'], name: 'GPU Log', role: 'Viewer', mimeType: 'text/x-gpu', x: 1 },
    ]
    writeTree(packageDir, {
      '.localix-mini-app/mini-app.json': JSON.stringify({ ...MANIFEST, fileAssociations: opens }),
    })
    const entry = await packIntoMarketplace({
      kit: fakeKit(),
      packageDir,
      outDir: tempDir(),
      publisher: 'Ada',
    })
    expect(entry.fileAssociations).toEqual([
      { ext: ['gpu', 'gpulog'], name: 'GPU Log', role: 'Viewer', mimeType: 'text/x-gpu' },
    ])
  })

  test('without a homepage, the marketplace entry links the repository the app is released from', async () => {
    const { dir, outputs } = checkedApp()
    const packageDir = await assemblePackage(dir, outputs)
    const pack = async (manifest: Record<string, unknown>) => {
      writeTree(packageDir, { '.localix-mini-app/mini-app.json': JSON.stringify({ ...MANIFEST, ...manifest }) })
      return packIntoMarketplace({ kit: fakeKit(), packageDir, outDir: tempDir(), publisher: 'Ada' })
    }
    const released = await pack({ repository: 'git+https://github.com/ada/gpu-monitor.git' })
    expect(released.homepage).toBe('https://github.com/ada/gpu-monitor')
    const site = await pack({
      homepage: 'https://gpu.example.test',
      repository: 'https://github.com/ada/gpu-monitor',
    })
    expect(site.homepage).toBe('https://gpu.example.test')
  })

  test('an app without a valid icon is refused', async () => {
    const packageDir = tempDir()
    mkdirSync(packageDir, { recursive: true })
    writeTree(packageDir, { '.localix-mini-app/mini-app.json': JSON.stringify({ ...MANIFEST, icon: undefined }) })
    const kit = fakeKit({
      tools: {
        manifest: { ...fakeKit().tools.manifest, checkMedia: async () => ['icon is required'] },
      },
    })
    await expect(
      packIntoMarketplace({ kit, packageDir, outDir: tempDir(), publisher: 'Ada' }),
    ).rejects.toThrow('icon is required')
  })
})
