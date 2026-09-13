# MTG Arena Vertical Slice Design

## Status

Approved by user: vertical slice, existing Node/TypeScript arena, local card registry, two starter decks.

## Goal

Turn the current arena into a trustworthy 1v1 Magic match that feels immediate in a browser while keeping the Discord bot as launcher and room authority.

## Scope

The first playable slice includes two starter decks, opening hand and mulligan, draw, one land per turn, mana production and payment, priority, stack resolution, targeted instants and sorceries, creatures, combat, damage, graveyard, life totals, concede, and win states. It must support two browsers connected to the same room and expose enough feedback that both players can tell whose action is legal and why.

It does not include a complete card universe, ranked matchmaking, accounts, persistence, trading, deck construction, multiplayer formats, or a complete implementation of every continuous-effect layer. Those follow only after the vertical slice is stable and observable.

## Architecture

Keep the current arena boundary. `discord-bot/arena/rooms.ts` owns game state, validation, phase transitions, priority, stack resolution, and snapshots. `discord-bot/arena/server.ts` remains the authenticated HTTP/WebSocket adapter and broadcasts accepted state changes. `discord-bot/arena/public/arena.html`, `arena.js`, and the existing arena stylesheet own semantic markup, rendering, input, animation, and responsive behavior. `discord-bot/arena/selfcheck.ts` remains the single runnable check covering pure rules plus HTTP/WebSocket behavior.

All game actions enter the existing room reducer. The client never mutates authoritative state: it sends an action, renders the next snapshot, and shows an error returned by the server. Snapshot redaction continues to hide the opponent's hand and private room key.

## Rules Contract

Game state must explicitly carry active player, phase, priority player, per-player life, mana pool, lands played this turn, library, hand, battlefield, graveyard, exile, combat attackers/blockers, and a LIFO stack of pending effects. Each card instance retains owner and controller. The reducer rejects actions from non-priority players, illegal phases, missing targets, duplicate land plays, insufficient mana, and malformed identifiers.

Minimum legal flow:

1. Create room, choose deck, shuffle, draw seven, offer mulligan/keep.
2. Begin turn: untap, upkeep, draw, main phase.
3. Play one land, tap lands for mana, cast permanents or spells.
4. Pass priority; resolve the top stack item only after both players pass.
5. Enter combat, declare attackers, declare blockers, assign combat damage, then post-combat main and end step.
6. Cleanup clears temporary mana and turn flags; victory occurs at zero life or empty-library draw loss; either player may concede.

The starter card set deliberately covers the interaction vocabulary: basic lands, vanilla creatures, one creature with an enter-the-battlefield effect, a pump instant, a direct-damage instant, a creature-removal sorcery, and a draw spell. Card text is local data, not client-authored HTML.

## Protocol

Retain the existing authenticated WebSocket envelope and action result shape. Add only actions needed by the contract: `mulligan`, `keep`, `pass`, `land`, `tap`, `cast`, `target`, `attackers`, `blockers`, and `concede`. Every accepted action broadcasts a redacted snapshot plus a compact event record (`draw`, `cast`, `resolve`, `attack`, `damage`, `destroy`, `life`, `phase`, `win`). Every rejected action returns a short error with recovery text and leaves state unchanged. Enforce bounded JSON input and keep the existing 64 KB WebSocket payload ceiling.

## Surface Direction

The arena uses a stage-manager cue board as its visual world: an ink-black control surface, warm paper card faces, brushed-metal seams, amber live-cue state, and vermilion error state. A fixed-cell cue rail makes phase and priority legible; the board is the entire composition, not decoration around a generic card grid. Player areas read as opposing wings around a central stage, the stack is a vertical cue queue, and the player's hand is a readable fan anchored to the lower stage edge.

First viewport: phase/cue rail across the top; opponent status and battlefield in the upper half; stack and combat lane centered; player battlefield and life/mana controls in the lower half; hand docked at the bottom; primary action button beside the active cue. On narrow screens, the cue rail becomes a compact phase strip, the stack becomes a bottom sheet-like inline region, and cards remain tappable without hover.

Motion is physical and causal: a card travels from hand to stage, a spell joins the cue rail, priority lamp moves to the active player, attacks cross the combat lane, damage flashes the affected life counter, and destroyed cards fall into graveyard. Use short step transitions, one orchestration per event, `prefers-reduced-motion` fallback to instant state changes, and no animation that delays input.

## Accessibility and Failure States

Every action is a real button or keyboard-operable card control with a visible focus ring and an accessible name. State is conveyed by text, icon geometry, and position as well as color. Disabled actions explain the rule. Loading, reconnecting, opponent-disconnected, invalid-action, empty-zone, mulligan, game-over, and reduced-motion states are explicit. Card inspection is available by focus and click, not hover only.

## Verification

Extend the existing self-check with deterministic assertions for opening setup, mulligan, land limit, mana payment, priority/stack, targets, combat, life loss, win/concede, snapshot redaction, malformed actions, and two WebSocket clients. Run TypeScript compilation, the arena self-check, the Impeccable detector once, and one desktop/mobile render inspection before deployment. Deploy only after local checks are green; smoke-test the public route and one two-client match on `kali1` through the existing `kali2` edge path.

## Direction Contract

<!--
THESIS: Make rules feel like live stage cues; refuse the generic fantasy dashboard.
OWN-WORLD: Ink-black board, paper cards, metal seams, amber live cue, vermilion error, fixed-cell rail.
STORY: Players see whose cue is live, choose a legal action, then watch it travel through stack and combat.
FIRST VIEWPORT: Cue rail top; opponent wing upper; stack center; player wing lower; hand dock bottom; action beside active cue.
FORM: Stage-manager cue board, assigned grounded direction 6, seed 98dcbd32.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->
