/**
 * The one sanctioned way to keep a native control: a board cell, a code text area or a canvas hit
 * target is native on purpose, and a kit Button around it would change what it is. The comment
 * names the reason where the next reader meets the element:
 *
 *   {/* mini-app: native-control — a board cell is a bare hit target *\/}
 *   <button className="size-12" />
 *
 * It sits after the element on its line, or alone on the line above it; it waives the native-control
 * rule for that element only, and needs its reason: a bare marker waives nothing and is a problem of its own.
 */
const MARKER = /mini-app:\s*native-control\b(.*)$/u

export const NATIVE_CONTROL_RULE = 'native control'

export interface NativeControlExceptions {
  /** Lines (1-based) whose native control the app keeps on purpose. */
  waived: Set<number>
  /** `line` of every marker that gives no reason. */
  unreasoned: number[]
}

/** The reason after the marker's dash, without the comment's own closing. */
function reasonOf(rest: string): string {
  const afterDash = /^\s*[—–-]+\s*(.*)$/u.exec(rest)?.[1] ?? ''
  return afterDash.replace(/\*\/\s*\}?\s*$/u, '').trim()
}

/** The exceptions written in `raw` (the source with its comments). */
export function nativeControlExceptions(raw: string): NativeControlExceptions {
  const waived = new Set<number>()
  const unreasoned: number[] = []
  raw.split('\n').forEach((text, index) => {
    const marker = MARKER.exec(text)
    if (!marker) return
    const line = index + 1
    if (!reasonOf(marker[1] ?? '')) {
      unreasoned.push(line)
      return
    }
    waived.add(line)
    // A marker alone on its line speaks for the element below; one after code, for its own line.
    const before = text.slice(0, marker.index).replace(/\{?\s*\/[*/]\s*$/u, '')
    if (!before.trim()) waived.add(line + 1)
  })
  return { waived, unreasoned }
}
