import { resolveWithin } from '@localixai/mini-app-sdk/backend'

/** Resolve a repository-relative path only when it remains inside the repository. */
export const confineToDir = resolveWithin
