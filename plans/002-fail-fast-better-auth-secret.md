# Plan 002: Fail fast when `BETTER_AUTH_SECRET` is unset

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d1daea6..HEAD -- lib/auth.ts`
> If `lib/auth.ts` changed since this plan was written, compare the "Current
> state" excerpts against the live file before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `d1daea6`, 2026-06-27

## Why this matters

Better Auth signs session cookies/JWTs with `secret`. Today, when
`BETTER_AUTH_SECRET` is missing the code falls back to a committed, public
string `"eve-chat-template-unconfigured-secret"` (`lib/auth.ts:46`). Anyone
who reads the repo can forge a valid session cookie for any user id and fully
bypass authentication — `getServerViewer` (`lib/session.ts`) will return a
`Viewer` for the forged principal, and every server action in
`app/actions/chat.ts` and every route in `app/api/**` trusts that viewer. This
is a total silent auth-bypass on any deploy that forgets the env var. The fix
is to fail loud at startup instead of silently serving with a known secret.

## Current state

Relevant files (read these before editing):

- `lib/auth.ts` — Better Auth configuration. The single line to change is the
  `secret:` option. Current state, line 11 and 46:
  ```ts
  const betterAuthSecret = process.env.BETTER_AUTH_SECRET?.trim();
  // ...
  export const auth = betterAuth({
    // ...
    secret: betterAuthSecret ?? "eve-chat-template-unconfigured-secret",
    // ...
  });
  ```
  The same file (lines 8-14) already computes `vercelProviderConfigured` and
  guards `socialProviders` on it — the pattern of "make a missing-config
  situation explicit" is already established here. Match it.
- `lib/session.ts` — `getServerViewer()` reads the session and returns a
  `Viewer | null`. It does not need to change; it is only context for why the
  secret matters (auth bypass flows through it).
- `app/actions/chat.ts` — every exported server action calls `requireViewer()`
  which calls `getServerViewer()` (line 172-179). No change needed here; it is
  context for the blast radius.
- `.env.example:2` already lists `BETTER_AUTH_SECRET=` (empty placeholder), so
  operators are reminded to set it. `README.md:60` lists it as "Required". The
  docs and example are correct; only the code silently tolerates its absence.

### Repo conventions (match these)

- **No new dependencies.** The fix uses existing `betterAuth` config only.
- **Throw styles in this repo**: server actions and query helpers throw plain
  `new Error("...")` with a short, human-readable message (see
  `app/actions/chat.ts:176` `"Sign in with Vercel to continue."` and
  `lib/db/queries.ts:346` `"Chat not found."`). Match that style for any new
  throw — no custom error class, no `console.error` before the throw unless
  the existing code in the same file does so (it does not).
- **Imports**: this repo uses biome/ultracite which auto-sorts imports. After
  editing, run `pnpm fix` to normalize, then `pnpm check`/`pnpm typecheck` to
  confirm. (Note: `pnpm check` currently exits 1 with pre-existing errors
  unrelated to this file — see plan 006. Filter: only count errors whose
  `path` is `lib/auth.ts`.)
- **No comments** unless asked — match the surrounding file (it has none).

## Commands you will need

| Purpose   | Command            | Expected on success                          |
|-----------|--------------------|---------------------------------------------|
| Typecheck | `pnpm typecheck`   | exit 0, no errors                            |
| Autofix   | `pnpm fix`         | exit 0 (formats/sorts files)                 |
| Lint      | `pnpm check`       | exit non-zero is expected repo-wide; for THIS plan, only confirm that `lib/auth.ts` produces zero NEW errors vs. before (compare with `pnpm check 2>&1 \| rg "lib/auth.ts"` run before and after) |

## Scope

**In scope** (the only file you should modify):
- `lib/auth.ts`

**Out of scope** (do NOT touch):
- `lib/session.ts`, `app/actions/chat.ts`, any `app/api/**` route — the auth
  bypass surface is downstream of the secret; fixing the secret is the fix.
- `.env.example`, `README.md` — the env-var documentation is already correct.
- Do NOT add a "warn and continue" path. The whole point is to fail, not warn.

## Git workflow

- Branch: `advisor/002-fail-fast-auth-secret`
- Commit message style (match `git log`, e.g. `Fix streamdown styles`,
  `Init codegraph`): short imperative, capitalized, no scope prefix — e.g.
  `Fail fast on missing BETTER_AUTH_SECRET`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace the silent fallback with a startup throw

In `lib/auth.ts`, after the existing `betterAuthSecret` declaration (line 11),
add a guard that throws if the secret is missing. Then remove the `?? "..."`
fallback from the `secret:` option.

Target shape (the only line being removed is the `?? "eve-chat-template-unconfigured-secret"`; the throw is the new code):

```ts
const betterAuthSecret = process.env.BETTER_AUTH_SECRET?.trim();

if (!betterAuthSecret) {
  throw new Error(
    "BETTER_AUTH_SECRET is required. Set it to a random value (e.g. `openssl rand -base64 32`) and restart."
  );
}
```

And later in the `betterAuth({ ... })` call:

```ts
  secret: betterAuthSecret,
```

Notes:
- The throw must be at module top-level so it runs on first import (server
  boot). It must NOT be inside the `betterAuth({...})` object literal or a
  function — top-level `throw` in a module halts the server boot.
- The `vercelProviderConfigured` constant on lines 12-14 references
  `betterAuthSecret` and must keep compiling — it now reads `Boolean(betterAuthSecret && ...)`, which is fine because the secret is a non-empty
  string by the time that line runs (the throw above already guaranteed it).
  Do NOT reorder or remove `vercelProviderConfigured`.
- Do NOT add a try/catch, a default value, or a `console.warn`. The throw IS
  the fix.

**Verify**:
- `pnpm typecheck` → exit 0, no errors.
- `pnpm check 2>&1 | rg "lib/auth.ts"` → either zero lines (no errors in this
  file) OR the same count as before your edit (no NEW errors introduced).
  Record the count in your report.

### Step 2: Confirm the throw is reachable and uncaught

Sanity-check that nothing catches the boot-time error. There is no error
boundary around `lib/auth.ts` imports — it is imported by
`app/api/auth/[...all]/route.ts` (the Better Auth handler) and `lib/session.ts`
(server components). A top-level throw there will surface as a server boot
failure in `next dev` / `next start`, which is the intended behavior. Do not
add any handler.

**Verify**:
- `rg -n "import.*from \"@/lib/auth\"|from \"./auth\"" app lib` — confirm the
  known importers (`app/api/auth/[...all]/route.ts`, `lib/session.ts`) are
  unchanged and there is no surrounding try/catch around the import.

## Test plan

This repo has **no unit-test runner** (`package.json` has no `test` script).
Do not add a test framework — that is plan 005's scope. Verification here is:

1. **Static gates** (must pass): `pnpm typecheck` exit 0; `pnpm check` shows no
   *new* errors in `lib/auth.ts` vs. before the edit.
2. **Behavioral check (manual, optional)**: if a dev server is available,
   temporarily unset `BETTER_AUTH_SECRET`, run `pnpm dev`, and confirm the
   server fails to start with the new error message. Restore the env var and
   confirm normal boot resumes. (If no dev server, note this as a reviewer
   task — the static gates + the fact that top-level `throw` halts module
   initialization is sufficient evidence.)

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `rg -n "eve-chat-template-unconfigured-secret" lib` returns no matches
      (the fallback string is gone from `lib/auth.ts`)
- [ ] `rg -n "throw new Error" lib/auth.ts` returns exactly one match (the new
      guard) — confirm it is the guard you added, not a pre-existing throw
- [ ] `git status` shows only `lib/auth.ts` modified (plus this `plans/` update)
- [ ] `plans/README.md` status row for plan 002 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `lib/auth.ts` changed since `d1daea6`, or the
  "Current state" excerpt (lines 11, 46) doesn't match the live file.
- `pnpm typecheck` reports errors in `lib/auth.ts` you cannot resolve by
  re-checking that the secret is no longer falsy at the point
  `vercelProviderConfigured` reads it (the throw guarantees it is a string,
  but only if the throw is ABOVE the `vercelProviderConfigured` line — if you
  placed it below by mistake, `Boolean(betterAuthSecret && ...)` still
  compiles because `betterAuthSecret` is `string | undefined`. If you hit a
  type error, restore the order shown in the target shape above.)
- You discover another importer of `lib/auth.ts` wraps the import in a
  try/catch that would swallow the boot error — that would defeat the fix and
  needs a human decision, not improvisation.
- The repo expects `lib/auth.ts` to be importable in a build/edge context that
  does NOT have env vars populated (e.g. `next build` reading types without
  env). If `pnpm build` fails because the throw fires at build time, STOP and
  report — the fix may need to defer the throw to request time instead of
  module load. (`pnpm build` is NOT in your verification gates for this plan
  precisely to avoid this ambiguity; if you choose to run it and it fails on
  the new throw, that is a STOP, not a failure to fix.)

## Maintenance notes

- **For the reviewer**: the right review technique is (1) confirm the
  `?? "eve-chat-template-unconfigured-secret"` fallback is gone; (2) confirm a
  top-level `throw` runs at module load and is not wrapped; (3) confirm
  `vercelProviderConfigured` still compiles and still gates `socialProviders`
  the same way (it must remain `Boolean(betterAuthSecret && vercelClientId &&
  vercelClientSecret)` — no behavior change there). The diff should be ~5
  lines.
- **Burned-secret note**: any deploy that ever ran with the public fallback
  must be treated as having had its session cookies forgeable. Plan 002 only
  fixes the code path; rotation of `BETTER_AUTH_SECRET` (and invalidation of
  existing sessions) is an operator task for those deploys — call this out in
  the PR description.
- **Future changes**: if a future PR wants to support a "dev-only default
  secret" (e.g. for `next dev` convenience), it must branch on `NODE_ENV` and
  STILL throw in production. The current plan intentionally has no dev escape
  hatch because the fallback string is publicly committed and unsafe in any
  environment.
- Deferred out of scope: documenting the new required-at-boot behavior in
  `README.md` and `docs/setup-and-deploy.md` (the README already lists
  `BETTER_AUTH_SECRET` as Required, so the docs are already consistent with
  the new behavior; no doc edit needed).
