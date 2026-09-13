# Arena MTG — Design System

## Direction

Stage-manager cue board: the table makes priority, stack, and combat read like live cues. The surface is ink-black, paper-card, metal-seam, amber-live-cue, vermilion-error, and teal-resource.

## Table

- Cue rail: turn, phase, active player, priority, and match status.
- Opponent wing: life, resources, library count, graveyard, exile, and battlefield.
- Stack lane: spells resolve in LIFO order; targets and controller stay visible.
- Combat lane: attackers and blocker assignments are explicit before damage resolves.
- Player wing: battlefield, lands, graveyard, exile, and life.
- Hand dock: paper cards with mana, type, oracle text, legal-action affordances, and target mode.

## Interaction rules

- The server owns legality, priority, mana, stack, combat, life, and win state.
- The client renders snapshots and event cues; invalid actions return privately to the sender.
- Keep/mulligan precedes play. Lands use one-per-turn. Instants and sorceries use the stack.
- Dice is table utility only; manual life, draw, untap, and destroy mutation are not exposed.

## Motion and accessibility

- `steps()` card cues preserve the mechanical board language.
- Attack, resolve, damage, and phase changes have short event flashes.
- Focus rings use the amber cue color; controls have text labels and live status updates.
- `prefers-reduced-motion` collapses animation duration to near-zero.

## Intentional ceiling

This vertical slice models the core duel loop and representative cards. Expand the effect registry and rules engine when the card pool needs broader MTG coverage.
