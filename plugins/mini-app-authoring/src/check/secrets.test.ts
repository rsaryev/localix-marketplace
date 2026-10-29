import { expect, test } from 'bun:test'

import { tempDirPerTest, writeTree } from '../testing/temp'
import { checkMiniAppSecrets } from './secrets'

const tempDir = tempDirPerTest('secrets-check-')
const KEY =
  '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH\n-----END PRIVATE KEY-----\n'

// The app's folder becomes a public repository: a signing key copied into it is published with it.
test('a private key anywhere in the app is reported, whatever the file is called', async () => {
  const dir = tempDir()
  writeTree(dir, { 'mini-app.json': '{}', 'notes/key.txt': KEY, 'signing.pem': KEY })
  const problems = await checkMiniAppSecrets(dir)
  expect(problems).toHaveLength(2)
  expect(problems[0]).toContain('notes/key.txt')
  expect(problems[1]).toContain('signing.pem')
})

test('an app with no private key passes', async () => {
  const dir = tempDir()
  writeTree(dir, { 'mini-app.json': '{}', 'ui/App.tsx': 'export const App = () => null\n' })
  expect(await checkMiniAppSecrets(dir)).toEqual([])
})

// An SSH form's placeholder, or a test of what such a form sends, names a key without holding one.
test('a key’s header alone, with no key under it, passes', async () => {
  const dir = tempDir()
  writeTree(dir, {
    'ui/Form.tsx': `const hint = '-----BEGIN OPENSSH PRIVATE KEY-----\\n…  or  \${secret:KEY}'\n`,
    'ui/form.test.ts': `const sent = { privateKey: '-----BEGIN PRIVATE KEY-----\\nraw-key' }\n`,
  })
  expect(await checkMiniAppSecrets(dir)).toEqual([])
})
