---
version: 1
slug: "discord-bot-arena-public-arena-html"
primary_target: "discord-bot/arena/public/arena.html"
related_targets: []
---

# Arena MTG surface brief

## Scope and mode

Browser match table for `/arena/:roomId`; Operate. Players must understand legal state, choose actions, and recover from errors during a live 1v1 match.

## Audience and task

Discord players joining a private room. Job: choose a starter deck, play a complete representative Magic match, and read priority, stack, combat, and life changes without leaving the arena.

## Constraints

Existing Node/TypeScript HTTP + WebSocket app; server-authoritative state; local card model; two 40-card starter decks; keyboard access, readable contrast, non-color state cues, and reduced-motion support.

## Chosen direction

Stage-manager cue board. Ink-black control surface, warm paper cards, metal seams, amber live cue, vermilion error. Player wings face a central stage; fixed-cell cue rail carries phase and priority; stack is a live cue queue; hand is a readable lower dock. Assigned grounded direction 6, seed `98dcbd32`.

## Memorable moment

Priority lamp moves to the correct player, the card travels from hand to stage, then the stack cue resolves with a visible event in the log.

## Implementation inventory

- Cue rail, status, controls: semantic HTML/CSS.
- Cards, counters, tokens, focus and state markers: semantic HTML/CSS with inline SVG icons.
- Existing card art: existing local card image URLs.
- Motion: CSS transitions/keyframes driven by event classes; no rasterized UI.
- Responsive layout: CSS grid/flex; compact mobile phase strip and inline stack.

## Unresolved decisions

Card universe, persistent accounts, ranked play, deckbuilding, and deeper continuous-effect layers remain later milestones, not blockers for this slice.
