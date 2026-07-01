# Plan 005: Add a test runner (vitest)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Split note**: this plan used to also add the first batch of
> characterization tests. It has been split into three: this plan (runner
> setup only), plan 007 (characterization tests for `lib/chat/*`), and plan
> 008 (characterization tests for `components/chat/message/tool-status.ts`).
> 007 and 008 both depend on this plan landing first; they do not depend on
> each other and can run in parallel.
>
> **Drift check (run first)**:
> `git diff --stat d1daea6..HEAD -- package.json pnpm-workspace.yaml tsconfig.json`
> If any of those changed since this plan was written, compare the "Current
> state" excerpts against the live file before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plans 007 and 008 depend on this plan)
- **Category**: tests
- **Planned at**: commit `d1daea6`, 2026-06-27 (split from the original
  005 into 005/007/008 on 2026-07-01)

## Why this matters

This repo has zero automated tests. `package.json` has no `test` script, no
test runner is installed, and there are no `*.test.*` files anywhere. Every
critical path — chat create + rate limit, event persistence + snapshot merge,
authorization skip, resume-after-refresh, auth scoping — is unverified. Per
the improve playbook, "is there a one-command way to know the codebase
works? If not, that's finding #1 and a prerequisite plan for any risky
change." This plan stands up the runner itself so that plans 007/008 (the
first characterization tests) and any later perf/lint/refactor work have a
safety net to build on.

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
- `tsconfig.json:1-35` — TS 6 strict, `module ESNext`, `moduleResolution:
  "Bundler"`, `paths: { "@/*": ["./*"] }`, `target ES2017`, `jsx react-jsx`.
  The test runner config must respect these (especially `@/*` alias and
  `react-jsx`).

### Repo conventions (match these)

- Package manager is **pnpm** (`package.json:5` `"packageManager": "pnpm@11.9.0"`).
  Use `pnpm` for all installs.
- Biome/ultracite enforces `import type` for type-only imports and sorts
  imports. After creating config files, run `pnpm fix` — it formats
  `.ts`/`.tsx`. Confirm with `pnpm check` afterward.

## Commands you will need

| Purpose     | Command                          | Expected on success               |
|-------------|-----------------------------------|-----------------------------------|
| Install     | `pnpm install`                   | exit 0, lockfile updated          |
| Typecheck   | `pnpm typecheck`                 | exit 0, no errors                 |
| Tests       | `pnpm test`                      | exit 0 (watch mode)               |
| Tests (CI)  | `pnpm test:run`                  | exit 0, "No test files found"     |
| Autofix     | `pnpm fix`                       | exit 0 (formats/sorts new files)  |
| Lint        | `pnpm check`                     | exit non-zero expected repo-wide (pre-existing — plan 006); confirm zero NEW errors in the files this plan touches |

## Suggested executor toolkit

- The repo already declares `#evals/*` import intent and eve ships an evals
  package (`node_modules/eve/dist/src/evals/`), but this plan deliberately
  uses a standard runner instead of coupling to eve's eval harness — the
  goal is a baseline safety net, not an eval framework decision. If a
  reviewer wants the agent-eval story later, that is a separate plan.

## Scope

**In scope**:
- `package.json` — add `test` + `test:run` scripts; add the chosen runner
  (and `vite-tsconfig-paths`) to `devDependencies`.
- `vitest.config.ts` — create (the config that wires `@/*` alias, node
  env, and the include glob).

**Out of scope** (do NOT touch):
- Any `*.test.ts` file — that's plans 007 and 008.
- `app/_components/agent-chat.tsx`, `lib/db/queries.ts`, `lib/rate-limit.ts`
  — not targeted by this plan or its successors; see `plans/README.md`
  "Findings considered and rejected" for why.
- Do NOT create `evals/` — the dangling `#evals/*` import map is a separate
  direction decision.
- Do NOT add `jsdom` or `@testing-library/react` — the first batch of tests
  (plans 007/008) is pure-function/node-only.
- Do NOT modify any non-config source file.

## Git workflow

- Branch: `advisor/005-add-test-runner`
- Commit message style (match `git log`, e.g.
  `Add Vercel Analytics and Speed Insights`): short imperative, capitalized —
  e.g. `Add vitest test runner`.
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
batch, added by plans 007/008).

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
→ exit 0 (the config itself is type-checked); `pnpm fix` → exit 0; `pnpm check`
→ no NEW errors attributable to `vitest.config.ts` or `package.json`.

## Test plan

This plan IS the test plan — the verification above is the test plan. There
are no test files to write here; that's plans 007 and 008.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test:run` exits 0 with "No test files found" (no test files exist
      yet — that's expected before 007/008 land)
- [ ] `pnpm typecheck` exits 0
- [ ] `package.json` has a `"test"` and `"test:run"` script and `vitest` +
      `vite-tsconfig-paths` in `devDependencies`
      (`rg -n "\"test\":|\"test:run\":|vitest|vite-tsconfig-paths" package.json`
      shows all four)
- [ ] `vitest.config.ts` exists at repo root
- [ ] `git status` shows only: `package.json`, `pnpm-lock.yaml`,
      `vitest.config.ts` (plus this `plans/` update)
- [ ] `plans/README.md` status row for plan 005 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `package.json` or `tsconfig.json` changed since
  `d1daea6` in a way that contradicts the "Current state" excerpts.
- `vite-tsconfig-paths` does not resolve `@/*` (verify with a throwaway test
  file if in doubt, then delete it before finishing this plan — the actual
  test files belong to 007/008).
- `vitest` v3.x requires a Node version below the repo's floor (Node 24 per
  `scripts/setup.sh:28`) — unlikely, but if `pnpm install` warns about engine
  incompatibility, STOP and report.

## Maintenance notes

- **For the reviewer**: confirm the runner is wired (`pnpm test:run` works
  from a clean clone after `pnpm install` and reports "No test files found");
  confirm no source file was modified.
- **Next**: plans 007 and 008 add the first characterization tests on top of
  this runner and can proceed in parallel once this plan is DONE.
- **The `#evals/*` import map** remains dangling after this plan; that is a
  direction decision (build vs. delete) tracked as a separate finding. This
  plan does NOT create `evals/` and does NOT use the `#evals/*` path.
- **Watch mode caveat**: `pnpm test` runs in watch mode by default; CI and the
  verification gates use `pnpm test:run`. Make sure any future CI config uses
  `test:run`, not `test`.
</content>
