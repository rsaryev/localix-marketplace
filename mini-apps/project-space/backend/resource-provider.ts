import type { ResourceRefProvider } from '@localixai/mini-app-sdk/backend'
import { describeSpace } from '../shared/agent/describe'
import { BOARD_FILE, parseSpaceUri, SPACE_PROVIDER, SPACE_TITLE, spaceUri } from '../shared/resource'
import { spaceTypes } from '../shared/types'
import { missingReferences } from './references'
import { spaceStore } from './space-store'
import type { ResolveRoot } from './tools'

/**
 * The board as a resource: the view attaches `spaceUri(chat)` to a message (`ui/register.tsx`),
 * and this answers it with the same roster `space_read` gives — one board per project, found
 * through the chat that names it. The picker offers the board of the chat it is opened in.
 */
export function createSpaceResourceProvider(resolveRoot: ResolveRoot): ResourceRefProvider {
  return {
    provider: SPACE_PROVIDER,
    title: SPACE_TITLE,

    async listChildren(_userId, parentUri, _query, scope) {
      if (parentUri !== null || !scope?.sessionId) return []
      return [
        {
          uri: spaceUri(scope.sessionId),
          label: SPACE_TITLE,
          detail: BOARD_FILE,
          hasChildren: false,
          icon: 'board',
        },
      ]
    },

    async expand(_userId, uri, scope) {
      const parsed = parseSpaceUri(uri)
      if (!parsed) return { ok: false, error: 'not a Project Space board' }
      const root = await resolveRoot(parsed.sessionId ?? scope?.sessionId)
      const snapshot = await spaceStore.read(root, 'agent')
      const missing = new Set(await missingReferences(root, snapshot.space))
      const roster = describeSpace(snapshot.space, spaceTypes, { missing, issues: snapshot.issues })
      return { ok: true, content: `The project’s board (${BOARD_FILE}):\n${roster}` }
    },
  }
}
