# Plan 008: Characterization tests for `components/chat/message/tool-status.ts`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Split note**: this plan was split out of the original plan 005 (which
> covered runner setup + all four characterization test files). This plan
> covers the largest/most complex file, `tool-status.ts`. See plan 007 for
> the three `lib/chat/*` files. Both depend on plan 005 (adds the vitest
> runner) and are independent of each other.
>
> **Drift check (run first)**:
> `git diff --stat d1daea6..HEAD -- components/chat/message/`
> If that changed since this plan was written, compare the "Current state"
> excerpts against the live file before proceeding; on a mismatch, treat it
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

`components/chat/message/tool-status.ts` holds the pure derivation logic for
how tool calls are labeled and grouped in the chat UI (status precedence,
labels, action descriptions, name resolution). It was isolated by plan 001's
split — the prerequisite for testability — but is still unverified. A wrong
status/label mapping is a visible, silent UI regression (e.g. a failed tool
call rendered as "running"). This is the most complex of the first-batch
targets, hence its own plan.

## Current state

- `components/chat/message/tool-status.ts` — exported pure functions
  (`getToolStatus`, `getToolGroupStatus`, `summarizeToolGroup`,
  `describeToolAction`, `resolveToolName`, `needsInputResponse`,
  `hasToolDetails`, `toolStatusLabel`, etc.). Take a typed
  `EveDynamicToolPart` from `eve/react`; return strings/enums/booleans. Now
  isolated by the plan 001 split — the prerequisite for testability.

### Repo conventions (match these)

- Biome/ultracite enforces `import type` for type-only imports and sorts
  imports. After creating the test file, run `pnpm fix` — it formats
  `.ts`/`.tsx` (not just source). Confirm with `pnpm check` afterward.
- Test file location: colocate the test next to the module under test
  (`components/chat/message/tool-status.test.ts`), the Node/Vitest
  convention. Do NOT put it under a separate `tests/` tree.
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
| Lint        | `pnpm check`                     | exit non-zero expected repo-wide; for THIS plan, confirm zero NEW errors in the new test file |

## Scope

**In scope**:
- `components/chat/message/tool-status.test.ts` — create

**Out of scope** (do NOT touch):
- `lib/chat/events.test.ts`, `lib/chat/title.test.ts`,
  `lib/chat/limits.test.ts` — that's plan 007.
- The private `normalizeToolName`/`formatDisplayName` helpers in
  `tool-status.ts` — do not export them just to test them directly; test
  only the public surface (see Step 1).
- Do NOT add UI/DOM-rendering tests (jsdom + RTL). This stays a pure-function,
  node-only test.
- Do NOT modify any non-test source file.

## Git workflow

- Branch: `advisor/008-test-tool-status`
- Commit message style (match `git log`): short imperative, capitalized —
  e.g. `Add characterization tests for tool-status helpers`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add `components/chat/message/tool-status.test.ts`

Read `components/chat/message/tool-status.ts` in full first (it's 286 lines;
the functions are pure given a typed `EveDynamicToolPart`). Build a tiny
`makePart(overrides)` helper in the test that constructs a minimal
`EveDynamicToolPart` with sensible defaults (so the table-driven cases only
specify what differs). Cover:

- `getToolStatus` — one `it` per `part.state` value
  (`input-streaming` → "running", `output-available` → "completed",
  `output-denied` → "denied", `output-error` → "error", etc.). Confirm the
  full state enum by reading the `eve/react` types or the switch in the
  source.
- `getToolGroupStatus` precedence: a group with error+denied+running →
  "error"; denied+running → "denied"; running+completed → "running";
  all completed → "completed".
- `toolStatusLabel` — one per status → the label string.
- `resolveToolName` — `toolMetadata?.eve?.name` present and not "unknown" →
  returns it; otherwise returns `toolName`.
- `needsInputResponse` — inputRequest present and no inputResponse → true;
  inputResponse present → false; no inputRequest → false.
- `describeToolAction` — pick 3-4 representative cases (a read tool with a
  path → "Read …"; a search with a query → "Searched …"; a connection-search
  with a connection name → "Searched <Display Name>"; an unknown tool →
  "Used <formatted name>"). Confirm exact wording from the source.

Keep the test file focused on the EXPORTED functions; do not test the private
`normalizeToolName`/`formatDisplayName` directly unless they are exported
(they are NOT — read the source; only test the public surface).

**Verify**: `pnpm test:run components/chat/message/tool-status.test.ts` → all
pass.

### Step 2: Run the local gate

**Verify**:
- `pnpm test:run` → the new test file passes; exit 0.
- `pnpm typecheck` → exit 0 (test files are TS and get type-checked too).
- `pnpm fix` → formats/sorts the new test file; exit 0.
- `pnpm check` → no NEW errors in the new test file
  (`pnpm check 2>&1 | rg "\.test\." | rg -v "info\|warn"` → zero, or only
  style infos; no errors).
- If plan 007 has already landed, also run the combined check:
  `pnpm test:run 2>&1 | rg -c "\.test\.ts"` → shows all 4 test files ran
  (events, title, limits, tool-status). If 007 hasn't landed yet, this will
  show 1 — that's expected; no action needed.

## Test plan

This plan IS the test plan — the verification above is the test plan.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test:run` exits 0 with all tests passing
- [ ] `pnpm test:run 2>&1 | rg -c "\.test\.ts"` shows at least 1 test file ran
      (tool-status), and 4 if plan 007 has also landed
- [ ] `pnpm typecheck` exits 0
- [ ] `git status` shows only:
      `components/chat/message/tool-status.test.ts` (plus this `plans/`
      update)
- [ ] `plans/README.md` status row for plan 008 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 005 is not DONE yet (no `vitest.config.ts` / no `test:run` script) —
  do this plan after 005 lands.
- The drift check shows `components/chat/message/` changed since `d1daea6`
  in a way that contradicts the "Current state" excerpts (e.g. a function
  was renamed, removed, or the state enum changed — re-read the file and
  adapt, but report the drift).
- `tool-status.ts` is NOT actually pure — e.g. it imports something that
  requires a DB or DOM at module load — so importing it in a test pulls in
  side effects. Report it; do not wire up mocks.
- `vite-tsconfig-paths` does not resolve `@/*` in the test. Try the relative
  import (`./tool-status`) instead — the collocation convention prefers
  relative imports anyway. If relative imports also fail, STOP and report the
  resolution error.
- An existing source file the test imports has a type error that
  `pnpm typecheck` previously didn't surface because nothing imported it in
  that configuration. Do NOT modify the source — report it; it's a
  pre-existing latent type error.

## Maintenance notes

- **For the reviewer**: (1) confirm `pnpm test:run` picks up this file; (2)
  read the tests for assertions that actually catch regressions — a test
  that asserts `expect(fn(x)).not.toThrow()` or `toBeTruthy()` on its own is
  weak; require specific values (exact labels/strings); (3) confirm no
  source file was modified.
- **Future tests**: the next tier (after this plan and 007 land) should add a
  Drizzle in-memory harness for `lib/db/queries.ts` (the snapshot merge +
  ownership predicates) and a Redis mock for `lib/rate-limit.ts`. Those are
  the highest-value next steps and depend on the runner (plan 005) existing.
- The test file now makes `pnpm check`'s pre-existing failure surface test
  files too — that's fine, biome already includes `*.ts`. If biome emits
  style infos on test fixtures (e.g. magic numbers), prefer fixing the test
  to satisfy biome over suppressing; do NOT add `biome-ignore` comments.
</content>
