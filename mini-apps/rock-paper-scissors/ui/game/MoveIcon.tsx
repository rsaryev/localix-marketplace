import { Hand, HandFist, Scissors, type LucideIcon } from 'lucide-react'

import type { Move } from '../../shared/game'

/** Each move as the hand shape it is, drawn as an icon so it follows the theme like the rest. */
const ICON: Record<Move, LucideIcon> = { rock: HandFist, paper: Hand, scissors: Scissors }

export function MoveIcon({ move, className }: { move: Move; className?: string }) {
  const Icon = ICON[move]
  return <Icon className={className} strokeWidth={1.5} aria-hidden />
}
