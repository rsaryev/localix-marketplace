import { describe, expect, test } from 'bun:test'

import { fakeKit } from '../testing/fake-kit'
import { tempDirPerTest, writeTree } from '../testing/temp'
import { checkMiniAppStyle } from './style'

const tempDir = tempDirPerTest('mini-app-style-exception-')

/** A kit whose theme declares the tokens the screens below use. */
function kitWithTheme() {
  const dir = tempDir()
  writeTree(dir, { 'ui/styles/theme.css': ':root { --color-foreground: #000; }' })
  return fakeKit({
    dir,
    tools: {
      style: {
        rules: [],
        themeTokensOf: () => ({ colors: new Set(['foreground']), radii: new Set() }),
        missingTokens: () => [],
      },
    },
  })
}

async function problemsOf(screen: string): Promise<string[]> {
  const app = tempDir()
  writeTree(app, { 'ui/Board.tsx': screen })
  return checkMiniAppStyle(app, kitWithTheme())
}

describe('a native control the app means to keep', () => {
  test('is waived by a reasoned exception on the line above or the same line', async () => {
    const screen = `export const Board = () => (
  <div>
    {/* mini-app: native-control — a board cell is a bare hit target, not a styled button */}
    <button className="size-12" />
    <textarea className="font-mono" /> {/* mini-app: native-control — code is typed raw */}
  </div>
)`
    expect(await problemsOf(screen)).toEqual([])
  })

  test('a marker after the element waives that line, never the next', async () => {
    const screen = `export const Board = () => (
  <div>
    <textarea className="font-mono" /> {/* mini-app: native-control — code is typed raw */}
    <button className="size-12" />
  </div>
)`
    const problems = (await problemsOf(screen)).join('\n')
    expect(problems).not.toContain('ui/Board.tsx:3')
    expect(problems).toContain('ui/Board.tsx:4 <button — native control')
  })

  test('an exception without a reason is itself a problem, and waives nothing', async () => {
    const screen = `export const Board = () => (
  <div>
    {/* mini-app: native-control */}
    <button className="size-12" />
  </div>
)`
    const problems = (await problemsOf(screen)).join('\n')
    expect(problems).toContain('ui/Board.tsx:3')
    expect(problems).toContain('native-control exception without a reason')
    expect(problems).toContain('ui/Board.tsx:4 <button — native control')
  })

  test('waives only the native-control rule on that element, not the next one', async () => {
    const screen = `export const Board = () => (
  <div>
    {/* mini-app: native-control — a board cell is a bare hit target */}
    <button className="size-12" />
    <button className="bg-clip-text" />
  </div>
)`
    const problems = (await problemsOf(screen)).join('\n')
    expect(problems).not.toContain('ui/Board.tsx:4')
    expect(problems).toContain('ui/Board.tsx:5 <button — native control')
    expect(problems).toContain('ui/Board.tsx:5 bg-clip-text — gradient text')
  })
})
