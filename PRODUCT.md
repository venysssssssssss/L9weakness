# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing Node.js/TypeScript Discord bot with vanilla HTML/CSS/JavaScript arena, HTTP, and WebSocket transport; deploys in Docker on `kali1` behind `kali2` nginx/Cloudflare tunnel.

## Users

Discord players who want to start or join a one-on-one Magic: The Gathering match from a browser.

## Product Purpose

Turn a Discord bot command into a focused, real-time browser match: players choose a starter deck, play cards, resolve combat, and understand every game state without leaving the conversation context.

## Positioning

The bot is the match launcher and social entry point; the browser arena is the authoritative shared table, with game state and actions synchronized over WebSocket.

## Operating Context

A player opens an arena link from Discord, joins with a private room key, selects a starter deck, and plays on desktop or mobile browser. The bot remains the room's lifecycle and social control plane.

## Capabilities and Constraints

- First release is a 1v1 vertical slice with two 40-card starter decks.
- Rules slice covers mulligan, draw, one land per turn, mana, priority, stack, targeted spells, combat, damage, death, life, concede, and win states.
- Server remains authoritative; room state currently lives in memory and expires after a bounded TTL.
- Existing arena uses Node.js/TypeScript, HTTP, WebSocket, and a browser client.
- Card metadata and images use the existing local card model first; card coverage expands incrementally.
- Public game UI must support keyboard access, readable contrast, focus states, and reduced motion.

## Brand Commitments

Product name in existing UI: `ARENA MTG`. User-requested reference: a complete, high-craft browser arena with Hearthstone-like clarity and responsiveness.

## Evidence on Hand

- Existing room/game code: `discord-bot/arena/rooms.ts`
- Existing browser client: `discord-bot/arena/public/arena.js`
- Existing end-to-end check: `discord-bot/arena/selfcheck.ts`
- Bot deployment: Docker container `L9Weakness` on `kali1`, port `3000`

## Product Principles

- Every action is legible before it is committed.
- Server truth beats client optimism.
- Information hierarchy protects decisions during combat.
- Feedback makes rules feel physical without delaying play.
- Expand card depth only after the core match loop stays understandable.

## Accessibility & Inclusion

Keyboard operation, visible focus, semantic controls, non-color-only state cues, readable text, and `prefers-reduced-motion` support are required for the arena UI.
