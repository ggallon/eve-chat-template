# Plan 003: Fail loud when rate-limit Redis is unconfigured

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d1daea6..HEAD -- lib/rate-limit.ts app/actions/chat.ts`
> If either file changed since this plan was written, compare the "Current
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

`lib/rate-limit.ts:enforceRateLimit` silently returns (no-op) when the Upstash
/KV Redis env vars are missing (`lib/rate-limit.ts:51-53`), so a deploy
without Redis has **zero** rate limit on `chat:create` and `chat:send`. The
README (`README.md:127`) advertises "Mandatory Upstash Redis rate limiting
for authenticated chat sends" and the docs
(`docs/how-the-chatbot-works.md:700-709`) document 25/hour limits — but the
implementation makes the limit advisory-only on misconfiguration, with no
operator signal. A missing or misconfigured Redis therefore removes the abuse
ceiling on model-call cost and the DoS bound, silently. The fix is to throw
when Redis is unconfigured so misconfigured deploys fail the request loud
rather than serving unlimited traffic.

## Current state

Relevant files:

- `lib/rate-limit.ts` — the rate limiter. Current state, the two key spots:
  ```ts
  // lines 32-46
  function getRedis() {
    if (redis !== undefined) {
      return redis;
    }
    const env = getRedisEnv();
    if (!env) {
      redis = null;
      return redis;
    }
    redis = new Redis(env);
    return redis;
  }

  // lines 48-67
  export async function enforceRateLimit(options: LimitOptions) {
    const client = getRedis();

    if (!client) {
      return;   // <-- the silent no-op
    }
    // ... incr / expire / throw RateLimitError
  }
  ```
  `RateLimitError` is already defined (lines 10-17) with a `retryAfter`
  field and a user-facing message. The pattern "throw a typed error that
  callers can handle" is already established.
- `app/actions/chat.ts` — the two callers:
  - `createChatAction` (lines 31-36) calls `enforceRateLimit` unguarded; an
    unhandled throw from it surfaces to the client as the server-action error
    (Better Auth wraps server actions). The `requireViewer()` call above it
    already throws (`app/actions/chat.ts:176`), so throwing from rate limit is
    consistent with the existing control flow.
  - `checkSendLimitAction` (lines 53-58) wraps `enforceRateLimit` in a
    try/catch (lines 48-71) that catches `RateLimitError` specifically and
    rethrows everything else. So an unknown error type would surface to the
    client action caller; a `RateLimitError` is reported as
    `{ allowed: false, message, retryAfter }`. **You must reuse
    `RateLimitError` for the "Redis unconfigured" case so this catch still
    works** — see Step 2. Alternatively add a distinct SetupError class; the
    plan picks the simpler "reuse RateLimitError" path with a distinct message.

### Repo conventions (match these)

- **No new dependencies.** Reuse the existing `RateLimitError` class.
- **Throw style**: short, human-readable messages (see
  `lib/rate-limit.ts:14` `"Too many requests. Please wait a moment and try again."`,
  `app/actions/chat.ts:176` `"Sign in with Vercel to continue."`). Match.
- **`readonly` on params**: this file uses `readonly` on object fields (see
  `LimitOptions` lines 3-8). Keep any new fields `readonly`.
- Imports: biome/ultracite auto-sorts. Run `pnpm fix` after editing.
- No comments unless asked — match the surrounding file (it has none).

## Commands you will need

| Purpose   | Command            | Expected on success                          |
|-----------|--------------------|---------------------------------------------|
| Typecheck | `pnpm typecheck`   | exit 0, no errors                            |
| Autofix   | `pnpm fix`         | exit 0 (formats/sorts files)                 |
| Lint      | `pnpm check`       | exit non-zero is expected repo-wide; for THIS plan, only confirm `lib/rate-limit.ts` produces zero NEW errors vs. before (compare `pnpm check 2>&1 \| rg "lib/rate-limit.ts"` before and after) |

## Scope

**In scope**:
- `lib/rate-limit.ts`

**Out of scope** (do NOT touch):
- `app/actions/chat.ts` — the callers already handle `RateLimitError` and
  already rethrow unknown errors. The fix is entirely inside the rate limiter.
  If you think a caller needs editing, that is a STOP.
- `README.md`/`.env.example`/`docs/*` — the documentation already calls Redis
  "Required"; no doc change needed for the code fix.
- Do NOT add a fallback "allow by default" path. The whole point is to fail.
- Do NOT change the `incr`/`expire`-only-on-first-call logic at lines 58-62 —
  that is a separate concern out of scope for this plan.

## Git workflow

- Branch: `advisor/003-fail-loud-rate-limit`
- Commit message style (match `git log`, e.g. `Fix streamdown styles`): short
  imperative, capitalized — e.g. `Fail loud when rate-limit Redis is missing`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Throw `RateLimitError` instead of returning when Redis is null

In `lib/rate-limit.ts`, replace the `if (!client) { return; }` block in
`enforceRateLimit` with a throw. Use the existing `RateLimitError` class so
the `checkSendLimitAction` catch (`app/actions/chat.ts:62`) keeps working
unchanged.

Target shape (the only changed block is lines 51-53):

```ts
export async function enforceRateLimit(options: LimitOptions) {
  const client = getRedis();

  if (!client) {
    throw new Error(
      "Rate limiting is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL / KV_REST_API_TOKEN) and restart."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  // ... rest unchanged
}
```

Notes on the choice of `Error` vs `RateLimitError`:
- `RateLimitError` carries a `retryAfter` number. The "not configured" case
  has no meaningful retry-after (the operator must fix config, not wait), so a
  plain `Error` is the more honest type.
- `checkSendLimitAction` (`app/actions/chat.ts:61-71`) catches
  `RateLimitError` and rethrows everything else. A plain `Error` therefore
  surfaces as an unhandled server-action error to that caller — which is the
  intended "fail loud" behavior. (`createChatAction` has no try/catch and
  would surface any error to the client, also intended.)
- If you prefer a distinct `SetupError` class for clarity, that is acceptable
  but adds a class definition — the simplest fix that fails loud is the plain
  `Error`. Do not over-engineer; pick the plain `Error`.

Do NOT touch `getRedis()`, `getRedisEnv()`, or the `incr`/`expire` logic.

**Verify**:
- `pnpm typecheck` → exit 0.
- `pnpm check 2>&1 | rg "lib/rate-limit.ts"` → zero lines, or same count as
  before the edit (no NEW errors in this file).

## Test plan

No unit-test runner (plan 005 adds one). Verification is:

1. **Static gates**: `pnpm typecheck` exit 0; no NEW lint errors in
   `lib/rate-limit.ts`.
2. **Behavioral check (manual, optional)**: with Redis env vars unset, the
   first chat send should now error loudly instead of silently succeeding. If
   a dev server is available, confirm `createChatAction` surfaces the new
   message. If not, note as a reviewer task — the logic change is small enough
   that the static gates + the visible diff are sufficient.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `rg -n "if \(!client\)" lib/rate-limit.ts` returns no matches (the
      silent-return guard is gone) OR returns a match that is immediately
      followed by a `throw` (NOT a `return`). Confirm by reading the line.
- [ ] `rg -n "throw new Error" lib/rate-limit.ts` shows the new throw in
      `enforceRateLimit`
- [ ] `git status` shows only `lib/rate-limit.ts` modified
- [ ] `plans/README.md` status row for plan 003 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `lib/rate-limit.ts` or `app/actions/chat.ts` changed
  since `d1daea6`, or the "Current state" excerpts don't match the live file.
- `checkSendLimitAction` (`app/actions/chat.ts:43-72`) does NOT actually
  rethrow non-`RateLimitError` errors — re-read it; if it swallows them, a
  plain `Error` would be silently lost there and you should use a
  `RateLimitError` instead (with `retryAfter: 0`). Report which you chose and
  why.
- `pnpm typecheck` reports errors you cannot resolve by re-reading the file.
- You find a second, unmentioned caller of `enforceRateLimit` that would
  mishandle the new throw (e.g. it wraps in try/catch and ignores).

## Maintenance notes

- **For the reviewer**: confirm (1) the `return` is replaced by a `throw`,
  (2) the throw runs before any Redis call so no half-state, (3)
  `checkSendLimitAction`'s catch handles the new error type correctly (a
  plain `Error` is rethrown by the `catch` → surfaces to the client action
  caller; this is intended fail-loud behavior).
- **Operator impact**: deploys that previously ran without Redis were
  silently allowing unlimited traffic; they will now 500 on the first chat
  send. That is the intended behavior — call it out in the PR description so
  operators add Redis before merging.
- **Future changes**: if a future PR wants to support a local-dev "no rate
  limit in dev" mode, it must branch on `NODE_ENV` and STILL throw in
  production. The current plan has no dev escape hatch because silent
  downgrade-to-unlimited is exactly the class of bug this fixes.
- Deferred out of scope: the `incr`/`expire` race where a crash between
  `incr` and `expire` leaves a key with no TTL (rate limit stuck forever).
  That is a real but separate bug — file it, don't fix it here.
