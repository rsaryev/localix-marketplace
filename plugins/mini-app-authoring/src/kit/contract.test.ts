import { describe, expect, test } from 'bun:test'

import { contractNotice } from './contract'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const kit = (localixVersion?: string, contract?: string) => ({
  ...(localixVersion ? { localixVersion } : {}),
  ...(contract ? { contract } : {}),
})
const running = (version?: string, miniAppContract?: string) => ({
  baseUrl: 'http://127.0.0.1:5051',
  ...(version ? { version } : {}),
  ...(miniAppContract ? { miniAppContract } : {}),
})

describe('contractNotice', () => {
  test('the same contract digest: the kit is exactly the running Localix’s', () => {
    expect(contractNotice(kit('0.4.0', A), running(undefined, A))).toEqual({
      differs: false,
      text: `This app's kit matches the running Localix exactly (contract ${A.slice(0, 12)}).`,
    })
  })

  // An older app on a newer Localix is supported: this is said, never a failure.
  test('another contract digest is named, with the way to update', () => {
    expect(contractNotice(kit('0.4.0', A), running('0.5.0', B))).toEqual({
      differs: true,
      text: `This app's kit (Localix 0.4.0, contract ${A.slice(0, 12)}) is not the contract the running Localix implements (${B.slice(0, 12)}): \`mini-app kit --update\``,
    })
  })

  test('without a digest on either side, the versions are compared', () => {
    expect(contractNotice(kit('0.4.0'), running('0.5.0', B))).toEqual({
      differs: true,
      text: 'Localix 0.5.0 is running; this app builds against 0.4.0 — `mini-app kit --update` installs its kit.',
    })
    expect(contractNotice(kit('0.4.0', A), running('0.4.0'))).toBeNull()
    expect(contractNotice(kit(undefined, A), running())).toBeNull()
  })

  test('no running Localix, nothing to compare', () => {
    expect(contractNotice(kit('0.4.0', A), null)).toBeNull()
  })
})
