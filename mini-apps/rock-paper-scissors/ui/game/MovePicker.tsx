import { cn, CONTROL_FOCUS_VISIBLE } from '@localixai/mini-app-sdk/ui/classes'

import { MOVES, type Move } from '../../shared/game'
import { MOVE_LABEL } from './copy'
import { MoveIcon } from './MoveIcon'

/**
 * The person's three choices, as borderless tiles on a veil. Disabled — not hidden — while it is
 * not their turn, so nothing jumps when the turn arrives.
 */
export function MovePicker({
  enabled,
  chosen,
  onPick,
}: {
  enabled: boolean
  chosen: Move | null
  onPick: (move: Move) => void
}) {
  return (
    <div role="group" aria-label="Your move" className="grid w-full grid-cols-3 gap-2">
      {MOVES.map((move) => (
        <button // mini-app: native-control — a move card with its icon and label is the hit target; a kit Button would impose a control height
          key={move}
          type="button"
          disabled={!enabled}
          aria-pressed={chosen === move}
          onClick={() => onPick(move)}
          className={cn(
            'rps-pick group flex flex-col items-center gap-1.5 rounded-xl py-4 transition-colors duration-(--dur-fast) ease-(--ease-soft) disabled:cursor-not-allowed',
            chosen === move
              ? 'bg-surface-active'
              : 'bg-foreground/[0.035] enabled:hover:bg-surface-hover',
            !enabled && chosen !== move && 'opacity-40',
            CONTROL_FOCUS_VISIBLE,
          )}
        >
          <MoveIcon move={move} className="rps-pick-glyph size-8 text-foreground" />
          <span className="text-xs font-medium text-text-soft">{MOVE_LABEL[move]}</span>
        </button>
      ))}
    </div>
  )
}
