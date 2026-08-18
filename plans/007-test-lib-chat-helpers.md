# Plan 007: Characterization tests for `lib/chat/*` pure helpers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Split note**: this plan was split out of the original plan 005 (which
> covered runner setup + all four characterization test files). This plan
> covers the three `lib/chat/*` files. See plan 008 for
> `components/chat/message/tool-status.ts`. Both depend on plan 005 (adds
> the vitest runner) and are independent of each other.
>
> **Drift check (run first)**:
> `git diff --stat d1daea6..HEAD -- lib/chat/`
> If that changed since this plan was written, compare the "Current state"
> excerpts against the live files before proceeding; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 005 (adds the vitest runner and `vitest.config.ts`)
- **Category**: tests
- **Planned at**: commit `d1daea6`, 2026-06-27 (split from the original 005
  on 2026-07-01)

## Why this matters

The event-log dedup helpers in `agent-chat.tsx` and the
`isChatTurnSettledEvent` predicate in `lib/chat/events.ts` feed persistence
decisions that determine what a user sees after refresh; a wrong answer there
is a silent regression to chat content. `lib/chat/title.ts` and
`lib/chat/limits.ts` are smaller but still unverified pure string helpers on
the chat-create path. Per the improve playbook, these are the cheapest,
highest-leverage pure-function modules to pin first once a runner exists.

## Current state

- The pure-function modules that are this plan's targets (verified to be
  pure or near-pure — read each before writing tests):
  - `lib/chat/events.ts:3-10` — `isChatTurnSettledEvent(event)` returns
    `boolean`. Branches on `event.type` ∈
    `{ "session.completed", "session.failed", "session.waiting" }`
    (and one more — read the file to confirm the exact set). This predicate is
    what `getChatForUser` (`lib/db/queries.ts:152-159`) uses to decide whether
    a pending message has been consumed — wrong answers here change what the
    user sees after refresh.
  - `lib/chat/title.ts` — `createFallbackTitle(text)` and
    `truncateTitle(text)` — pure string transforms. Edge cases: empty/whitespace
    → `DEFAULT_CHAT_TITLE`; `>72` chars → `slice(0,69) + "..."`. Read the file
    for the exact constant.
  - `lib/chat/limits.ts` — `assertChatMessageLength` throws on too-long input;
    `MAX`/length constants. Pure given the input string.

### Repo conventions (match these)

- Biome/ultracite enforces `import type` for type-only imports and sorts
  imports. After creating test files, run `pnpm fix` — it formats `.ts`/`.tsx`
  (not just source). Confirm with `pnpm check` afterward.
- Test file location: colocate tests next to the module under test
  (`lib/chat/events.test.ts` next to `lib/chat/events.ts`), the Node/Vitest
  convention. Do NOT put tests under a separate `tests/` tree.
- `readonly` on object params is used throughout (e.g.
  `lib/rate-limit.ts:3-8` `LimitOptions`). Match in test fixtures.
- No comments in test files unless explanatory of a non-obvious case — match
  the surrounding source style (which has none). Test names carry the meaning.

## Commands you will need

| Purpose     | Command                          | Expected on success               |
|-------------|-----------------------------------|-----------------------------------|
| Typecheck   | `pnpm typecheck`                 | exit 0, no errors                 |
| Tests       | `pnpm test:run`                  | exit 0, all tests pass            |
| Autofix     | `pnpm fix`                       | exit 0 (formats/sorts test files) |
| Lint        | `pnpm check`                     | exit non-zero expected repo-wide; for THIS plan, confirm zero NEW errors in the three new test files |

## Scope

**In scope**:
- `lib/chat/events.test.ts` — create
- `lib/chat/title.test.ts` — create
- `lib/chat/limits.test.ts` — create

**Out of scope** (do NOT touch):
- `components/chat/message/tool-status.test.ts` — that's plan 008.
- `app/_components/agent-chat.tsx` — its pure helpers
  (`areEqualJsonValues`, `mergeStreamEventLogs`, `preserveKnownInitialEvents`)
  are still module-private inside the 2192-LOC component; extracting them is
  a god-module-split finding tracked elsewhere. Do NOT add tests for them
  here — they can't be imported.
- `lib/db/queries.ts` — testing it requires a Drizzle in-memory/Neon
  harness. Not in this plan's scope; a follow-up plan can add it once this
  baseline exists.
- `lib/rate-limit.ts` — requires a Redis mock; same reason, out of scope here.
- Do NOT modify any non-test source file.

## Git workflow

- Branch: `advisor/007-test-lib-chat-helpers`
- Commit message style (match `git log`): short imperative, capitalized —
  e.g. `Add characterization tests for lib/chat helpers`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add `lib/chat/events.test.ts`

Read `lib/chat/events.ts` first to confirm the exact settled-event type set
(the plan's recon says `session.completed` / `session.failed` /
`session.waiting` plus one more — confirm in the file). Then write a
table-driven test:

- one `it` per settled type → returns `true`
- one `it` each for several NON-settled `MessageStreamEvent` variants
  (e.g. `session.started`, `message.part`, `tool.call`, `authorization.required`)
  → returns `false`
- a final `it` for an unknown string `type` → returns `false` (defensive)

Pattern to follow for structure: a typical vitest `describe`/`it` with
`expect(x).toBe(true/false)`. No DOM. Use `import { isChatTurnSettledEvent }
from "./events"` (relative, since the test sits next to the module — match the
node convention; do NOT use `@/lib/...` in the test file, use the relative
path biome expects to collocate).

**Verify**: `pnpm test:run lib/chat/events.test.ts` → all new tests pass.

### Step 2: Add `lib/chat/title.test.ts`

Read `lib/chat/title.ts` to confirm: `DEFAULT_CHAT_TITLE` constant value,
`createFallbackTitle`, `truncateTitle`. Edge cases to cover:
- empty string → `DEFAULT_CHAT_TITLE`
- whitespace-only → `DEFAULT_CHAT_TITLE`
- `<72` char string → unchanged
- exactly 72 → unchanged (boundary)
- 73 chars → truncated to `slice(0,69) + "..."` (confirm exact indices in the
  source — do not copy from this plan, copy from the file)
- markdown-ish input (e.g. `"# Hi\n\nbody"`) → whatever the function does
  (confirm by reading; it likely strips markdown — write the test to assert
  the actual behavior, characterizing it)

**Verify**: `pnpm test:run lib/chat/title.test.ts` → all pass.

### Step 3: Add `lib/chat/limits.test.ts`

Read `lib/chat/limits.ts` for the `MAX` constant and
`assertChatMessageLength` behavior. Cover:
- string at `MAX` → does not throw
- string at `MAX + 1` → throws
- string over `MAX` by a lot → throws
- the thrown error's message shape (a `toMatch(/.../)` on the message is
  enough; do not assert exact wording, since it may be tweaked)

Use `expect(() => fn()).toThrow()` pattern.

**Verify**: `pnpm test:run lib/chat/limits.test.ts` → all pass.

### Step 4: Run the local gate

**Verify**:
- `pnpm test:run` → all tests in these three files pass; exit 0.
- `pnpm typecheck` → exit 0 (test files are TS and get type-checked too).
- `pnpm fix` → formats/sorts the new test files; exit 0.
- `pnpm check` → no NEW errors in these three test files
  (`pnpm check 2>&1 | rg "\.test\." | rg -v "info\|warn"` → zero, or only
  style infos; no errors).

## Test plan

This plan IS the test plan — the verification above is the test plan.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test:run` exits 0 with all tests passing
- [ ] `pnpm test:run 2>&1 | rg -c "\.test\.ts"` shows at least 3 test files
      ran (events, title, limits)
- [ ] `pnpm typecheck` exits 0
- [ ] `git status` shows only: `lib/chat/events.test.ts`,
      `lib/chat/title.test.ts`, `lib/chat/limits.test.ts` (plus this
      `plans/` update)
- [ ] `plans/README.md` status row for plan 007 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 005 is not DONE yet (no `vitest.config.ts` / no `test:run` script) —
  do this plan after 005 lands.
- The drift check shows `lib/chat/` changed since `d1daea6` in a way that
  contradicts the "Current state" excerpts (e.g. a function signature moved
  or a settled type was added/removed — re-read the file and adapt, but
  report the drift).
- A target module is NOT actually pure — e.g. `lib/chat/events.ts` imports
  something that requires a DB or DOM at module load — so importing it in a
  test pulls in side effects. Report it; do not wire up mocks. Choose a
  different first target or drop that file from this plan.
- `vite-tsconfig-paths` does not resolve `@/*` in tests. Try the relative
  import (`./events`) instead — the collocation convention prefers relative
  imports anyway. If relative imports also fail, STOP and report the
  resolution error.
- An existing source file a test imports has a type error that
  `pnpm typecheck` previously didn't surface because nothing imported it in
  that configuration. Do NOT modify the source — report it; it's a
  pre-existing latent type error.

## Maintenance notes

- **For the reviewer**: (1) confirm `pnpm test:run` picks up these three
  files; (2) read each test for assertions that actually catch regressions —
  a test that asserts `expect(fn(x)).not.toThrow()` or `toBeTruthy()` on its
  own is weak; require specific values; (3) confirm no source file was
  modified.
- **Future tests**: the next tier (after this plan and 008 land) should add a
  Drizzle in-memory harness for `lib/db/queries.ts` (the snapshot merge +
  ownership predicates) and a Redis mock for `lib/rate-limit.ts`. Those are
  the highest-value next steps and depend on the runner (plan 005) existing.
- The test files now make `pnpm check`'s pre-existing failure surface test
  files too — that's fine, biome already includes `*.ts`. If biome emits
  style infos on test fixtures (e.g. magic numbers), prefer fixing the test
  to satisfy biome over suppressing; do NOT add `biome-ignore` comments.
</content>
