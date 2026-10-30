import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'

import type { Kit, KitTools } from '../kit/kit'

const publicKeyOf = (privateKey: string) => {
  const jwk = createPublicKey(createPrivateKey(privateKey)).export({ format: 'jwk' })
  return Buffer.from(jwk.x!, 'base64url').toString('base64')
}

/**
 * Localix's marketplace rules as tests need them: the files where Localix keeps them, a check and
 * a reader that pass everything (Localix tests its own), and real Ed25519 signatures in Localix's
 * schema 2 signature file, so what the toolchain signs verifies.
 */
const fakeMarketplaceTools: KitTools['marketplace'] = {
  file: '.localix-mini-app/marketplace.json',
  releaseFile: 'mini-app-marketplace.json',
  signatureSuffix: '.sig',
  schema: 3,
  problems: () => [],
  read: (raw) => ({ kind: 'marketplace', marketplace: raw as never }),
  sign: (bytes, privateKeys) =>
    `${JSON.stringify({
      schema: 2,
      signatures: privateKeys.map((key) => ({
        algorithm: 'ed25519',
        key: publicKeyOf(key),
        signature: sign(null, bytes, createPrivateKey(key)).toString('base64'),
      })),
    })}\n`,
  verify: (bytes, text) => {
    const { signatures } = JSON.parse(text) as { signatures: { key: string; signature: string }[] }
    return {
      keys: signatures.flatMap(({ key, signature }) => {
        const publicKey = createPublicKey({
          key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(key, 'base64').toString('base64url') },
          format: 'jwk',
        })
        return verify(null, bytes, publicKey, Buffer.from(signature, 'base64')) ? [key] : []
      }),
    }
  },
  publicKeyOf,
  githubUrl: (repo) => `https://github.com/${repo}/releases/latest/download/mini-app-marketplace.json`,
}

/**
 * A kit for unit tests: the shape `loadKit` returns, with the tools a test does not replace doing
 * nothing. The kit Localix publishes is tested against this toolchain in Localix's repository.
 */
export function fakeKit(overrides: { dir?: string; tools?: Partial<KitTools> } = {}): Kit {
  const tools: KitTools = {
    version: 2,
    manifest: {
      file: '.localix-mini-app/mini-app.json',
      validate: async () => ({ name: null, errors: [], warnings: [] }),
      checkMedia: async () => [],
      iconTypes: { svg: 'image/svg+xml', png: 'image/png' },
      screenshotTypes: { png: 'image/png' },
    },
    marketplace: fakeMarketplaceTools,
    ui: {
      artifactDir: 'dist/ui',
      artifactManifest: 'artifact.json',
      sharedGlobal: '__LOCALIX_MINI_APP_UI_SHARED__',
      preloadedModules: ['react'],
      sharedModule: /^(?:react|@localixai\/kit\/.+)$/u,
    },
    style: {
      rules: [],
      themeTokensOf: () => ({ colors: new Set(), radii: new Set() }),
      missingTokens: () => [],
    },
    routes: {
      rawBodyParse: /\b[A-Za-z_$][\w$]*\.req\s*\.\s*json\s*\(/gu,
      rawBodyParseFix:
        "read the body with jsonBody(schema) from '@localixai/mini-app-sdk/backend' and c.req.valid('json')",
    },
    compileTailwind: async () => ({ build: () => '' }),
    ...overrides.tools,
  }
  const dir = overrides.dir ?? '/kit'
  return {
    dir,
    templateDir: `${dir}/template`,
    tools,
    manifest: {
      apiVersion: 1,
      kitModules: [],
      uiSharedExports: {},
      hostStylesheet: 'ui/styles/index.css',
      backendModules: {},
      uiVendorModules: {},
      typePaths: {},
      authoring: {
        version: 2,
        styles: 'ui/styles',
        tailwindUtilities: 'ui/styles/tailwindcss/utilities.css',
        typecheck: 'typescript/check.mjs',
        typeRoots: 'types/node_modules/@types',
        testPreload: 'backend/test-preload.mjs',
        backendSharedModules: ['hono', 'zod', '@localixai/mini-app-sdk/backend'],
        uiPrebuiltModules: ['zod'],
        tools: 'tools/authoring.js',
      },
    },
  }
}
