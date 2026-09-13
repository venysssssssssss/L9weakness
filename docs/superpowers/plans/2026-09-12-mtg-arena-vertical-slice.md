# MTG Arena Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 1v1 browser Magic vertical slice with authoritative rules, clear priority/stack feedback, and a cue-board interface.

**Architecture:** Extend the current in-memory arena reducer in `rooms.ts`; keep `server.ts` as the authenticated WebSocket/HTTP adapter; render the authoritative redacted snapshots in the existing vanilla browser client. Keep the change inside the current arena files and use the existing `selfcheck.ts` as the executable contract.

**Tech Stack:** Node.js, TypeScript, vanilla HTML/CSS/JavaScript, existing `ws` WebSocket dependency, Node `assert`, Docker deployment.

**Spec:** `docs/superpowers/specs/2026-09-12-mtg-arena-vertical-slice-design.md`

## Global Constraints

- Server remains authoritative; clients send actions and render snapshots only.
- First release contains two 40-card starter decks and a bounded representative card set.
- Keep the existing HTTP/WebSocket envelope, room authentication, and 64 KB payload ceiling.
- Do not add a dependency, framework, persistence layer, matchmaking system, or external card engine.
- Preserve opponent-hand redaction and private room-key handling.
- Every UI action is keyboard-operable, visibly focused, semantically named, and reduced-motion safe.
- Run TypeScript compilation, the arena self-check, the Impeccable detector once, and desktop/mobile render checks before deployment.

---

### Task 1: Lock the reducer contract with failing assertions

**Files:**
- Modify: `discord-bot/arena/selfcheck.ts`
- Modify: `discord-bot/arena/rooms.ts`

**Interfaces:**
- Consumes: existing `createRoom`, `applyAction`, `snapshot`, `Card`, and room/game types.
- Produces: deterministic assertions for opening setup, priority, stack, mana, combat, redaction, and terminal states that later tasks must satisfy.

- [ ] **Step 1: Extend `selfcheck.ts` with deterministic fixtures**

Add a local `testCard` helper that constructs cards with `id`, `name`, `mana_cost`, `type_line`, `oracle_text`, `power`, `toughness`, and empty `image_uri`. Create a room with fixed user ids, set `room.ready = true`, and replace each test player's library with a known ordered list. Do not use random card order in assertions.

- [ ] **Step 2: Add failing opening-state assertions**

Assert both players begin at 20 life, receive seven cards after `keep`, have an active player, and expose only `handCount` for the opponent. Assert a second land action in the same turn returns `{ ok: false }`.

- [ ] **Step 3: Add failing priority/stack assertions**

Cast a one-mana instant from the active player's hand, assert it enters `stack`, assert the opponent can respond while priority is theirs, assert the top item resolves only after both players send `{ t: 'pass' }`, and assert the resolved card moves to graveyard.

- [ ] **Step 4: Add failing mana and combat assertions**

Play a basic land, tap it, cast a creature, advance to combat, declare one attacker, declare one blocker, resolve combat damage, and assert the correct life total, battlefield, and graveyard changes. Assert a creature with lethal damage is removed from battlefield.

- [ ] **Step 5: Add failing terminal and validation assertions**

Assert `{ t: 'concede' }` produces a win state, zero life produces a win state, malformed card ids are rejected, actions from a non-priority player are rejected, and state is unchanged after each rejected action.

- [ ] **Step 6: Run the focused check and confirm failure**

Run from `discord-bot/`:

```bash
node -r ts-node/register arena/selfcheck.ts
```

Expected: failure on the first newly added assertion because the reducer lacks the new rules.

### Task 2: Implement authoritative setup, phases, mana, stack, and combat

**Files:**
- Modify: `discord-bot/arena/rooms.ts`

**Interfaces:**
- Consumes: existing `Room`, `Game`, `Player`, `Card`, `createRoom`, and `applyAction` contracts.
- Produces: state fields and reducer branches consumed by `server.ts`, `snapshot`, `selfcheck.ts`, and `arena.js`.

- [ ] **Step 1: Add the minimum state fields in existing game types**

Add only the fields needed by the spec: `priorityPlayerId`, explicit `phase`, per-player `mana` with five colored counts plus colorless, `landsPlayedThisTurn`, `stack`, `combat`, `turn`, and `winnerId`. Keep existing zone names when present; add `graveyard` and `exile` only if absent.

Use discriminated data in the same file:

```ts
type ArenaPhase =
  | 'mulligan' | 'untap' | 'upkeep' | 'draw' | 'main1'
  | 'begin-combat' | 'attackers' | 'blockers' | 'damage'
  | 'end-combat' | 'main2' | 'end' | 'cleanup' | 'game-over';

type StackItem = {
  id: string;
  sourceCardId: string;
  controllerId: string;
  kind: 'spell' | 'ability';
  effect: { type: 'draw' | 'damage' | 'pump' | 'destroy' };
  targetId?: string;
};
```

- [ ] **Step 2: Implement deterministic opening setup**

On room readiness, shuffle with the existing random mechanism, draw seven, set both life totals to 20, set phase to `mulligan`, set priority to the host, and track each player's `kept` flag. `mulligan` returns the hand to the library, shuffles it back, draws six, and marks the player as resolved. `keep` marks the player resolved. Start the first turn only when both players resolve mulligan.

- [ ] **Step 3: Implement turn and priority transitions**

Add a single phase-advance branch in `applyAction`. Reject a phase action unless the acting player owns priority. At `untap`, untap that player's permanents and clear temporary mana; at `draw`, draw one; at `main1`, reset `landsPlayedThisTurn`; at `cleanup`, switch active player, reset per-turn fields, and return to `untap`. Set priority to the active player at each phase boundary.

- [ ] **Step 4: Implement land play and mana**

Reject land play outside `main1`/`main2`, from a non-priority player, or after one land this turn. Move a basic land from hand to battlefield, increment `landsPlayedThisTurn`, and allow `{ t: 'tap', card }` only for an untapped land controlled by the player. Add the land's color to mana pool and mark it tapped. Consume mana in deterministic order when paying a spell cost.

- [ ] **Step 5: Implement cast, target, pass, and stack resolution**

For `{ t: 'cast', card, target }`, validate ownership, current zone, phase, priority, card type, mana cost, and target. Move the card to stack, create a `StackItem`, pay mana, and pass priority to the opponent. For `{ t: 'pass' }`, pass priority; when both players pass with a non-empty stack, pop one item, apply its effect, move the source to its destination, emit a compact event, and give priority to the active player. Permanent spells enter battlefield on resolution.

- [ ] **Step 6: Implement combat as explicit sub-phases**

At `begin-combat`, set attackers phase. `{ t: 'attackers', cards }` validates control, untapped state, summoning sickness, and unique ids; tap attackers and store them. `{ t: 'blockers', assignments }` validates blocker control and one-blocker assignment, stores blockers, and advances to damage. Apply simultaneous power damage, remove lethal creatures, send unblocked damage to the defending player, and emit `attack`, `damage`, and `destroy` events.

- [ ] **Step 7: Implement terminal rules and bounded validation**

After each state mutation, check zero life and empty-library draw loss, set `winnerId`, phase `game-over`, and reject all further actions except no-op state reads. Validate strings, ids, arrays, numeric deltas, target ownership, and action names before mutation. Keep the existing 64 KB server boundary and cap event-log entries at the existing room limit.

- [ ] **Step 8: Run the focused check and confirm it passes**

Run from `discord-bot/`:

```bash
node -r ts-node/register arena/selfcheck.ts
```

Expected: all newly added pure-rule assertions pass; existing assertions remain green.

### Task 3: Keep WebSocket protocol aligned with the reducer

**Files:**
- Modify: `discord-bot/arena/server.ts`
- Modify: `discord-bot/arena/selfcheck.ts`

**Interfaces:**
- Consumes: `applyAction(room, playerId, action)` and `snapshot(room, playerId)` from `rooms.ts`.
- Produces: authenticated WS messages for `state`, `event`, `error`, `dice`, and `disconnect` consumed by `arena.js`.

- [ ] **Step 1: Add two-client protocol assertions**

Open one WebSocket for each room key in `selfcheck.ts`. Assert each receives an initial redacted state, an accepted action broadcasts an event and state to both clients, a rejected action returns an error only to the sender, and the opponent never receives the sender's private hand or room key.

- [ ] **Step 2: Parse and dispatch bounded actions**

Keep the existing message handler and add the new action names to its validated dispatch. Reject non-object JSON, payloads over 64 KB, unknown action names, and missing/oversized string ids before calling `applyAction`.

- [ ] **Step 3: Broadcast accepted results and errors**

After `applyAction` returns `{ ok: true }`, broadcast a redacted snapshot to each connected player and a compact event record. On `{ ok: false }`, send the existing error envelope with the reducer's recovery message and do not broadcast state. Preserve invalid-key close behavior.

- [ ] **Step 4: Run HTTP and WebSocket checks**

Run from `discord-bot/`:

```bash
node -r ts-node/register arena/selfcheck.ts
```

Expected: `ARENA SELFCHECK OK`, including HTTP auth, two-client state sync, action rejection, dice, and life checks.

### Task 4: Build the cue-board arena surface

**Files:**
- Modify: `discord-bot/arena/public/arena.html`
- Modify: `discord-bot/arena/public/arena.js`

**Interfaces:**
- Consumes: redacted `state`, `event`, `error`, `dice`, and connection messages from `server.ts`.
- Produces: semantic interactive regions and visible state for both desktop and narrow screens.

- [ ] **Step 1: Add the direction contract as the first body child**

Place this HTML comment as the first child of `<body>` and keep the seed key intact:

```html
<!--
THESIS: Make rules feel like live stage cues; refuse the generic fantasy dashboard.
OWN-WORLD: Ink-black board, paper cards, metal seams, amber live cue, vermilion error, fixed-cell rail.
STORY: Players see whose cue is live, choose a legal action, then watch it travel through stack and combat.
FIRST VIEWPORT: Cue rail top; opponent wing upper; stack center; player wing lower; hand dock bottom; action beside active cue.
FORM: Stage-manager cue board, assigned grounded direction 6, seed 98dcbd32.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->
```

- [ ] **Step 2: Replace generic layout with semantic board regions**

Add landmarks for `header` cue rail, `main` board, opponent panel, opponent battlefield, stack queue, combat lane, player battlefield, player panel, hand dock, event log, card inspector, live-region errors, and connection status. Keep existing ids/classes used by the client when possible; update `arena.js` selectors in the same change.

- [ ] **Step 3: Render state from one snapshot function**

Make `render(state)` clear and repopulate the board from the snapshot. Render phase, active player, priority, life, mana, lands, creatures, stack, hand count, graveyard count, and winner. Opponent hand renders facedown backs/count only. Add `aria-live="polite"` for phase/event updates and `aria-live="assertive"` for action errors.

- [ ] **Step 4: Wire card and action controls**

Use real buttons for `pass`, `phase`, `mulligan`, `keep`, `concede`, dice, land, tap, cast, attackers, and blockers. Cards remain focusable buttons or keyboard-operable elements with card name/type/mana labels. Disable illegal client actions from the snapshot for feedback, but rely on server validation. Card inspection opens on focus/click and never depends on hover.

- [ ] **Step 5: Add causal event classes**

When an event arrives, add a short class to its source and destination: `event-cast`, `event-resolve`, `event-attack`, `event-damage`, `event-destroy`, or `event-phase`. Remove the class after one animation cycle. Keep state visible before animation; `prefers-reduced-motion: reduce` makes event classes instant.

- [ ] **Step 6: Run static surface checks**

Assert in `selfcheck.ts` that the HTTP response contains `ARENA MTG`, the direction seed `98dcbd32`, semantic board ids, `prefers-reduced-motion`, and no opponent hand payload. Run the existing self-check and confirm no client syntax errors in the browser console.

### Task 5: Commit the cue-board visual system in the existing stylesheet

**Files:**
- Modify: `discord-bot/arena/public/arena.html`

**Interfaces:**
- Consumes: semantic regions and event classes from Task 4.
- Produces: responsive, keyboard-visible, contrast-safe desktop and mobile composition without new CSS dependencies.

- [ ] **Step 1: Define the token block**

Use CSS custom properties in the existing style location:

```css
:root {
  --ink: #0b0f12;
  --board: #141b20;
  --metal: #6c7880;
  --paper: #f1eadc;
  --paper-ink: #172026;
  --amber: #f4b942;
  --vermilion: #ef5b4d;
  --teal: #68d5c7;
  --focus: #9be8ff;
}
```

Use dark board surfaces for player state, warm paper only where card content is presented, amber only for live/active state, and vermilion only for errors/damage/cancelled state.

- [ ] **Step 2: Style fixed-cell cue rail and player wings**

Use a readable condensed UI face for phase cells and an ordinary sans stack for body copy; use monospace only for life/mana/measurement values. Give phase cells fixed min widths, active priority a lamp geometry plus text, and player areas a central stage alignment rather than nested generic cards.

- [ ] **Step 3: Style cards and state affordances**

Keep card art readable, add a non-color tapped marker, summoning-sickness marker, focus ring, selected outline, disabled treatment, and inspect panel. Use a single elevation rule with soft offset shadow; avoid zero-blur block shadows, gradients, glass effects, emoji icons, and decorative grid overlays.

- [ ] **Step 4: Add event motion and focus behavior**

Animate card travel, cue lamp movement, attack travel, damage pulse, and graveyard fall with short step timing. Keep all controls usable while animation runs. Style `:focus-visible` with `--focus`; do not remove outlines.

- [ ] **Step 5: Add narrow-screen composition**

At the narrow breakpoint, switch the board to one column, compress cue cells, keep the player's hand horizontally scrollable, place stack after combat lane, preserve minimum 44px action targets, and keep the active action visible without hover.

- [ ] **Step 6: Re-run reducer and markup checks**

Run from `discord-bot/`:

```bash
node -r ts-node/register arena/selfcheck.ts
```

Expected: `ARENA SELFCHECK OK` and semantic marker assertions pass.

### Task 6: Verify, inspect, and prepare deployment

**Files:**
- Modify: `discord-bot/arena/selfcheck.ts` only if verification exposes a missing assertion.

**Interfaces:**
- Consumes: complete reducer, protocol, and browser surface.
- Produces: green local evidence and a deployment-ready container build.

- [ ] **Step 1: Compile TypeScript without emitting files**

Run from repository root:

```bash
npx tsc -p discord-bot/tsconfig.json --noEmit
```

Expected: exit code 0.

- [ ] **Step 2: Run the complete arena self-check**

Run from `discord-bot/`:

```bash
node -r ts-node/register arena/selfcheck.ts
```

Expected: `ARENA SELFCHECK OK`.

- [ ] **Step 3: Run Impeccable detector once**

Run from repository root:

```bash
node /home/vgreis/.agents/skills/impeccable/scripts/detect.mjs --json discord-bot/arena/public/arena.html discord-bot/arena/public/arena.js
```

Expected: no mechanical findings that violate contrast, focus, responsive, state, or banned visual patterns. Fix only findings caused by this task.

- [ ] **Step 4: Perform one desktop/mobile render inspection**

Serve the existing arena HTTP route, inspect one desktop viewport and one narrow viewport, then verify: cue/priority visible in seconds; hand and stack never overlap action controls; keyboard focus visible; opponent hand hidden; event feedback readable; reduced-motion removes movement. Batch fixes and perform one final recapture only.

- [ ] **Step 5: Verify container source and build path on `kali1`**

Use read-only commands first:

```bash
ssh kali1 docker inspect L9Weakness --format '{{.Config.WorkingDir}}'
ssh kali1 docker exec L9Weakness node --version
ssh kali1 docker exec L9Weakness npm --version
```

Build the image using the repository's existing Docker workflow after local checks; do not mutate unrelated containers. Keep `L9Weakness` bound to port `3000`, then smoke-test the arena route and two-client WebSocket match through the existing `kali2` edge path.

- [ ] **Step 6: Record final evidence**

Capture command output, public route status, two-client match result, detector result, and any unresolved later-scope items in the final handoff. Do not claim complete all-card MTG coverage; report the shipped vertical-slice boundary accurately.
