import { existsSync, promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { UserError } from '../lib/errors'

/**
 * Finding a running Localix and talking to it. The toolchain never reads Localix's own files beyond
 * the one it publishes for this: the API writes `<database>.api-runtime.json` (`baseUrl`, `pid`)
 * while it runs, and answers `GET /health` with its product id, so a stale file or another program
 * on the port is told apart from Localix, and with its release, so a mini app builds against that
 * release's kit.
 */

export interface LocalixRuntime {
  baseUrl: string
  /** The Localix release running; absent when it runs from source. */
  version?: string
  /** The digest of the mini app contract it implements (`contract.ts`), release or not. */
  miniAppContract?: string
}

export interface RuntimeDeps {
  env?: Record<string, string | undefined>
  home?: string
  fetch?: typeof fetch
}

const PRODUCT_ID = 'localix-api'

function runtimeFiles(env: Record<string, string | undefined>, home: string): string[] {
  const database = env.LOCALIX_DB_FILE?.trim() || join(home, '.localix', 'localix.db')
  return [`${resolve(database)}.api-runtime.json`]
}

/** The Localix answering at `baseUrl`, or null when nothing or something else does. */
async function localixAt(baseUrl: string, fetchImpl: typeof fetch): Promise<LocalixRuntime | null> {
  try {
    const response = await fetchImpl(new URL('/health', baseUrl), {
      signal: AbortSignal.timeout(2_000),
    })
    if (!response.ok) return null
    const body = (await response.json()) as {
      productId?: unknown
      version?: unknown
      miniAppContract?: unknown
    }
    if (body.productId !== PRODUCT_ID) return null
    const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
    const version = text(body.version)
    const miniAppContract = text(body.miniAppContract)
    return {
      baseUrl,
      ...(version ? { version } : {}),
      ...(miniAppContract ? { miniAppContract } : {}),
    }
  } catch {
    return null
  }
}

/** The running Localix, or null. `LOCALIX_API_URL` names one directly (a development API). */
export async function findLocalix(deps: RuntimeDeps = {}): Promise<LocalixRuntime | null> {
  const env = deps.env ?? process.env
  const fetchImpl = deps.fetch ?? fetch
  const candidates: string[] = []
  if (env.LOCALIX_API_URL?.trim()) candidates.push(env.LOCALIX_API_URL.trim())
  for (const file of runtimeFiles(env, deps.home ?? homedir())) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as { baseUrl?: unknown }
      if (typeof parsed.baseUrl === 'string') candidates.push(parsed.baseUrl)
    } catch {
      // Not running, or never run under this database.
    }
  }
  for (const baseUrl of candidates) {
    const runtime = await localixAt(baseUrl, fetchImpl)
    if (runtime) return runtime
  }
  return null
}

/** How long a request waits for Localix: the post-edit hook is killed after 15 s. */
const REQUEST_TIMEOUT_MS = 5_000

/**
 * One JSON request to Localix; a refusal is thrown with the reason Localix gave, and a Localix that
 * does not answer within `timeoutMs` is an error rather than a stall.
 */
export async function localixRequest<T>(
  runtime: LocalixRuntime,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const signal = AbortSignal.timeout(init.timeoutMs ?? REQUEST_TIMEOUT_MS)
  let text: string
  let response: Response
  try {
    response = await fetchImpl(new URL(path, runtime.baseUrl), {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? {} : { 'content-type': 'application/json' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal,
    })
    text = await response.text()
  } catch (error) {
    if (signal.aborted) throw new UserError(`Localix did not answer ${path} in time`)
    throw error
  }
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : typeof body === 'string' && body
          ? body
          : `HTTP ${response.status}`
    throw new UserError(`Localix refused ${path}: ${message}`)
  }
  return body as T
}

/** Where an installed Localix app is on this computer, or null. */
export function installedLocalixApp(home: string = homedir()): string | null {
  if (process.platform !== 'darwin') return null
  return (
    ['/Applications/Localix.app', join(home, 'Applications', 'Localix.app')].find((path) =>
      existsSync(path),
    ) ?? null
  )
}
