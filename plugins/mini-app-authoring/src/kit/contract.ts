import type { LocalixRuntime } from '../localix/runtime'
import type { KitManifest } from './kit'

/**
 * Is this app's kit the one the running Localix implements? A Localix publishes the digest of its
 * mini app contract (`GET /health` → `miniAppContract`) and stamps it into its kit (`kit.json` →
 * `contract`, the hash of the kit's `API.md`): the same digest means the kit and that Localix are
 * one contract, 1:1. A kit from before the digest, or a Localix that does not say it, is compared
 * by release version instead. A different contract is said, never a failure: an app built against
 * an older Localix runs on a newer one.
 */

export interface ContractNotice {
  /** The kit is not the running Localix's: a reason to `mini-app kit --update`. */
  differs: boolean
  text: string
}

const short = (digest: string) => digest.slice(0, 12)

export function contractNotice(
  kit: Pick<KitManifest, 'localixVersion' | 'contract'>,
  running: LocalixRuntime | null | undefined,
): ContractNotice | null {
  if (!running) return null
  if (kit.contract && running.miniAppContract) {
    return kit.contract === running.miniAppContract
      ? {
          differs: false,
          text: `This app's kit matches the running Localix exactly (contract ${short(kit.contract)}).`,
        }
      : {
          differs: true,
          text: `This app's kit (Localix ${kit.localixVersion ?? 'unknown'}, contract ${short(kit.contract)}) is not the contract the running Localix implements (${short(running.miniAppContract)}): \`mini-app kit --update\``,
        }
  }
  if (running.version && kit.localixVersion && running.version !== kit.localixVersion) {
    return {
      differs: true,
      text: `Localix ${running.version} is running; this app builds against ${kit.localixVersion} — \`mini-app kit --update\` installs its kit.`,
    }
  }
  return null
}

/** After installing the running release's kit, a development Localix can still differ. */
export const CHECKOUT_KIT_HINT =
  'The running Localix implements a contract no release kit carries (a development build): run `bun run mini-app-kit` in its checkout and build with `MINI_APP_KIT=<localix checkout>/.turbo/mini-app-kit`.'
