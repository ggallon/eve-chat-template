# Plan 005: Add a test runner and the first batch of characterization tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d1daea6..HEAD -- package.json pnpm-workspace.yaml tsconfig.json lib/chat/ components/chat/message/`
> If any of those changed since this plan was written, compare the "Current
> state" excerpts against the live file before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: LOW
- **Depends on**: none (but plan 006 — fixing the broken lint gate — depends
  on this plan for the resume-effect lint fixes to be safe)
- **Category**: tests
- **Planned at**: commit `d1daea6`, 2026-06-27

## Why this matters

This repo has zero automated tests. `package.json` has no `test` script, no
test runner is installed, and there are no `*.test.*` files anywhere. Every
critical path — chat create + rate limit, event persistence + snapshot merge,
authorization skip, resume-after-refresh, auth scoping — is unverified. The
event-log dedup helpers in `agent-chat.tsx` and the
`isChatTurnSettledEvent` predicate in `lib/chat/events.ts` feed persistence
decisions that determine what a user sees after refresh; a wrong answer there
is a silent regression to chat content. Per the improve playbook, "is there a
one-command way to know the codebase works? If not, that's finding #1 and a
prerequisite plan for any risky change." This plan stands up the runner and
pins the cheapest, highest-leverage pure-function modules first, so that
later perf/lint/refactor work has a safety net.

## Current state

- `package.json:10-24` — `scripts` block. There is no `test` script.
  `devDependencies` (lines 58-68) has `@biomejs/biome`, `drizzle-kit`,
`microsandbox`, `typescript`, `@types/*`, `ultracite`. **No test runner.**
- `package.json:6-9` — `imports: { "#*": "./agent/*", "#evals/*": "./evals/*" }`.
  The `#evals/*` map points at a directory that does **not** exist. Do not
  create `evals/` in this plan (it's a separate direction decision); but
  understand the project already signals an intent for some kind of
  eval/test harness. This plan uses a standard runner, not the `#evals/*`
  mechanism, to avoid coupling to an unbuilt convention.
- The pure-function modules that are the first targets (verified to be pure
  or near-pure — read each before writing tests):
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
  - `components/chat/message/tool-status.ts` — exported pure functions
    (`getToolStatus`, `getToolGroupStatus`, `summarizeToolGroup`,
    `describeToolAction`, `resolveToolName`, `needsInputResponse`,
    `hasToolDetails`, `toolStatusLabel`, etc.). Take a typed
    `EveDynamicToolPart` from `eve/react`; return strings/enums/booleans. Now
    isolated by the plan 001 split — the prerequisite for testability.
- `tsconfig.json:1-35` — TS 6 strict, `module ESNext`, `moduleResolution:
  "Bundler"`, `paths: { "@/*": ["./*"] }`, `target ES2017`, `jsx react-jsx`.
  The test runner config must respect these (especially `@/*` alias and
  `react-jsx`).

### Repo conventions (match these)

- Package manager is **pnpm** (`package.json:5` `"packageManager": "pnpm@11.9.0"`).
  Use `pnpm` for all installs.
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
|-------------|----------------------------------|-----------------------------------|
| Install     | `pnpm install`                   | exit 0, lockfile updated          |
| Typecheck   | `pnpm typecheck`                 | exit 0, no errors                 |
| Tests       | `pnpm test`                      | exit 0, all tests pass            |
| Tests watch | `pnpm test --run` (one-shot)     | exit 0                            |
| Autofix     | `pnpm fix`                       | exit 0 (formats/sorts test files) |
| Lint        | `pnpm check`                     | exit non-zero expected repo-wide; for THIS plan, confirm zero NEW errors in test files (`pnpm check 2>&1 \| rg "\.test\."` → zero, or only style infos) |

## Suggested executor toolkit

- The repo already declares `#evals/*` import intent and eve ships an evals
  package (`node_modules/eve/dist/src/evals/`), but this plan deliberately
  uses a standard runner instead of coupling to eve's eval harness — the
  goal is a baseline safety net for the pure helpers, not an eval framework
  decision. If a reviewer wants the agent-eval story later, that is a
  separate plan.

## Scope

**In scope**:
- `package.json` — add `test` + `test:run` scripts; add the chosen runner to
  `devDependencies`.
- `vitest.config.ts` — create (the config that wires `@/*` alias, jsdom-free
  node env, and the include glob).
- `lib/chat/events.test.ts` — create
- `lib/chat/title.test.ts` — create
- `lib/chat/limits.test.ts` — create
- `components/chat/message/tool-status.test.ts` — create

**Out of scope** (do NOT touch):
- `app/_components/agent-chat.tsx` — its pure helpers
  (`areEqualJsonValues`, `mergeStreamEventLogs`, `preserveKnownInitialEvents`)
  are still module-private inside the 2192-LOC component; extracting them is
  a god-module-split finding tracked elsewhere. Do NOT add tests for them
  here — they can't be imported.
- `lib/db/queries.ts` — testing it requires a Drizzle in-memory/Neon
  harness. That is a valuable next step but is **not** in this plan's scope
  because it pulls in a DB-mock dependency and a bigger harness. A follow-up
  plan can add it once this baseline exists.
- `lib/rate-limit.ts` — requires a Redis mock; same reason, out of scope here.
- Do NOT create `evals/` — the dangling `#evals/*` import map is a separate
  direction decision.
- Do NOT add UI/DOM-rendering tests (jsdom + RTL). The first batch is pure
  functions only; the harness stays node-only to keep it fast and dependency-free.
- Do NOT modify any non-test source file.

## Git workflow

- Branch: `advisor/005-add-test-runner`
- Commit per logical unit; message style (match `git log`, e.g.
  `Add Vercel Analytics and Speed Insights`): short imperative, capitalized —
  e.g. `Add vitest and first characterization tests`. Splitting into two
  commits (runner setup, then tests) is fine and clearer.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Choose the runner and add it to devDependencies

Use **vitest** (Vite-native, zero-config for TS/ESM, supports `@/*` via a
vite-tsconfig-paths plugin, fast, the most common choice for Next 16/React 19
repo conventions). Add to `devDependencies` in `package.json`:

```jsonc
    "vitest": "^3.2.0",
```

(Use whatever the latest stable 3.x is at install time — run `pnpm add -D vitest`
and let it resolve; the exact patch version is fine.)

Do NOT add `jsdom` or `@testing-library/react` — out of scope (node-only first
batch).

**Verify**: `pnpm install` → exit 0; `pnpm vitest --version` prints a 3.x version.

### Step 2: Add the `test` / `test:run` scripts

In `package.json` `scripts`, add (keep existing scripts; add these):

```jsonc
    "test": "vitest",
    "test:run": "vitest run",
```

`pnpm test` runs in watch mode (good for dev); `pnpm test:run` is one-shot (CI
and the gate you should use to verify each step below).

**Verify**: `pnpm test:run` → runs and exits 0 with "No test files found"
(vite picks up `*.test.ts` by default; none exist yet — that's expected for
this step).

### Step 3: Create `vitest.config.ts`

Create at repo root:

```ts
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts", "app/**/*.test.ts"],
  },
});
```

Add `vite-tsconfig-paths` to `devDependencies` (`pnpm add -D vite-tsconfig-paths`).
It reads `tsconfig.json` paths so `@/lib/chat/events` resolves in tests.

**Verify**: `pnpm test:run` → still exits 0 with no test files; `pnpm typecheck`
→ exit 0 (the config itself is type-checked).

### Step 4: Add `lib/chat/events.test.ts`

Read `lib/chat/events.ts` first to confirm the exact settled-event type set
(the plan's recon says `session.completed` / `session.failed` /
`session.waiting` plus one more — confirm in the file). Then write a
table-driven test:

- one `it` per settled type → returns `true`
- one `it` each for several NON-settled `HandleMessageStreamEvent` variants
  (e.g. `session.started`, `message.part`, `tool.call`, `authorization.required`)
  → returns `false`
- a final `it` for an unknown string `type` → returns `false` (defensive)

Pattern to follow for structure: a typical vitest `describe`/`it` with
`expect(x).toBe(true/false)`. No DOM. Use `import { isChatTurnSettledEvent }
from "./events"` (relative, since the test sits next to the module — match the
node convention; do NOT use `@/lib/...` in the test file, use the relative
path biome expects to collocate).

**Verify**: `pnpm test:run lib/chat/events.test.ts` → all new tests pass.

### Step 5: Add `lib/chat/title.test.ts`

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

### Step 6: Add `lib/chat/limits.test.ts`

Read `lib/chat/limits.ts` for the `MAX` constant and
`assertChatMessageLength` behavior. Cover:
- string at `MAX` → does not throw
- string at `MAX + 1` → throws
- string over `MAX` by a lot → throws
- the thrown error's message shape (a `toMatch(/.../)` on the message is
  enough; do not assert exact wording, since it may be tweaked)

Use `expect(() => fn()).toThrow()` pattern.

**Verify**: `pnpm test:run lib/chat/limits.test.ts` → all pass.

### Step 7: Add `components/chat/message/tool-status.test.ts`

This is the biggest of the four. Read `components/chat/message/tool-status.ts`
in full first (it's 286 lines; the functions are pure given a typed
`EveDynamicToolPart`). Build a tiny `makePart(overrides)` helper in the test
that constructs a minimal `EveDynamicToolPart` with sensible defaults (so the
table-driven cases only specify what differs). Cover:

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

### Step 8: Run the full gate

**Verify**:
- `pnpm test:run` → all tests across all four files pass; exit 0.
- `pnpm typecheck` → exit 0 (test files are TS and get type-checked too).
- `pnpm fix` → formats/sorts the new test + config files; exit 0.
- `pnpm check` → no NEW errors in `*.test.*` files
  (`pnpm check 2>&1 | rg "\.test\." | rg -v "info\|warn"` → zero, or only
  style infos; no errors).

## Test plan

This plan IS the test plan — the verification above is the test plan.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test:run` exits 0 with all tests passing
- [ ] `pnpm test:run 2>&1 | rg -c "\.test\.ts"` shows at least 4 test files
      ran (events, title, limits, tool-status)
- [ ] `pnpm typecheck` exits 0
- [ ] `package.json` has a `"test"` script and `vitest` in `devDependencies`
      (`rg -n "\"test\":|vitest" package.json` shows both)
- [ ] `vitest.config.ts` exists at repo root
- [ ] `git status` shows only: `package.json`, `pnpm-lock.yaml`,
      `vitest.config.ts`, and the four new `*.test.ts` files modified/created
      (plus this `plans/` update)
- [ ] `plans/README.md` status row for plan 005 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `package.json`, `tsconfig.json`, `lib/chat/`, or
  `components/chat/message/` changed since `d1daea6` in a way that contradicts
  the "Current state" excerpts (e.g. a function signature moved or a settled
  type was added/removed — re-read the file and adapt, but report the drift).
- A target module is NOT actually pure — e.g. `lib/chat/events.ts` imports
  something that requires a DB or DOM at module load — so importing it in a
  test pulls in side effects. Report it; do not wire up mocks. Choose a
  different first target or drop that file from this plan.
- `vite-tsconfig-paths` does not resolve `@/*` in tests (a test using
  `import { ... } from "@/lib/..."` fails to resolve). Try the relative import
  (`./events`) instead — the collocation convention prefers relative imports
  anyway. If relative imports also fail, STOP and report the resolution error.
- `vitest` v3.x requires a Node version below the repo's floor (Node 24 per
  `scripts/setup.sh:28`) — unlikely, but if `pnpm install` warns about engine
  incompatibility, STOP and report.
- An existing source file a test imports has a type error that
  `pnpm typecheck` previously didn't surface because nothing imported it in
  that configuration. Do NOT modify the source — report it; it's a
  pre-existing latent type error.

## Maintenance notes

- **For the reviewer**: the right review is (1) confirm the runner is wired
  (`pnpm test:run` works from a clean clone after `pnpm install`); (2) read
  each test for assertions that actually catch regressions — a test that
  asserts `expect(fn(x)).not.toThrow()` or `toBeTruthy()` on its own is weak;
  require specific values; (3) confirm no source file was modified.
- **Future tests**: the next tier (after this plan lands) should add a
  Drizzle in-memory harness for `lib/db/queries.ts` (the snapshot merge +
  ownership predicates) and a Redis mock for `lib/rate-limit.ts`. Those are
  the highest-value next steps and depend on this plan's runner existing.
- **The `#evals/*` import map** remains dangling after this plan; that is a
  direction decision (build vs. delete) tracked as a separate finding. This
  plan does NOT create `evals/` and does NOT use the `#evals/*` path.
- **Watch mode caveat**: `pnpm test` runs in watch mode by default; CI and the
  verification gates use `pnpm test:run`. Make sure the plan's done criteria
  and any future CI config use `test:run`, not `test`.
- The test files now make `pnpm check`'s pre-existing failure surface test
  files too — that's fine, biome already includes `*.ts`. If biome emits
  style infos on test fixtures (e.g. magic numbers), prefer fixing the test
  to satisfy biome over suppressing; do NOT add `biome-ignore` comments.
