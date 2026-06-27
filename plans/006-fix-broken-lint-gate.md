# Plan 006: Repair the broken `pnpm check` lint gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d1daea6..HEAD -- app/_components/session-chat-page.tsx app/_components/home-chat-page.tsx app/_components/agent-chat-shell.tsx app/api/auth/[...all]/route.ts app/layout.tsx components/auth/ agent/tools/get_weather.ts`
> If any of these files changed since this plan was written, re-run the audit
> step (Step 1) to get the current error list before proceeding; treat a
> changed error list as a STOP condition requiring re-planning.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/005-add-test-runner.md` — the resume-effect lint
  fixes (the highest-risk subset) must not be auto-applied before the resume
  behavior is pinned by tests. Do NOT start this plan until 005 is DONE.
- **Category**: dx
- **Planned at**: commit `d1daea6`, 2026-06-27

## Why this matters

`pnpm check` (the repo's only lint command, `package.json:22` `ultracite
check`) exits 1 with ~21 errors, so it cannot be put in CI or a pre-commit
hook — it already fails. The errors concentrate on the most dangerous
untested code: five `useExhaustiveDependencies` violations and one
`noExcessiveCognitiveComplexity` (complexity 30) all live on the
resume-after-refresh path in `session-chat-page.tsx`. A broken gate means
those real maintainability hazards are not blocking anything and will
accumulate. Worse, `pnpm fix` would auto-apply those rules' "unsafe fixes" to
the resume hooks — removing `chatId`/`clientError`/`submitting` from
dependency arrays on code with no tests. That's why this plan is MED risk,
not LOW: the easy path is dangerous. This plan triages the violations into
buckets and fixes each in the safest order, with the test runner (plan 005)
in place as a safety net for the resume-effect changes.

## Current state

`pnpm check` (verified at `d1daea6`) reports ~21 errors across ~9 files. The
exact set (re-run Step 1 to confirm current counts — the brief said 60, my
audit measured 21; the count has drifted before, so DO trust Step 1's output
over the numbers below):

- `useExhaustiveDependencies` ×5 — `session-chat-page.tsx:73,277,308` (the
  resume effect), `home-chat-page.tsx:61,65` (home submit)
- `useAwait` ×3 — `app/api/auth/[...all]/route.ts:16,20`, `agent/tools/get_weather.ts:9`
- `noEmptyBlockStatements` ×2 — `home-chat-page.tsx:138`, `session-chat-page.tsx:139`
- `noDangerouslySetInnerHtml` ×2 — `app/layout.tsx:103`, `components/auth/auth-display.tsx:36`
- `noImgElement` ×1 — `components/auth/user-menu.tsx:92`
- `useImageSize` ×1 — (paired with the `<img>` above)
- `noUnusedVariables` ×1 — `app/api/auth/[...all]/route.ts:30` (`redirectToAuthError`)
- `useOptionalChain` ×1 — `app/api/auth/[...all]/route.ts`
- `noExcessiveCognitiveComplexity` ×1 — `session-chat-page.tsx:205` (complexity 30, max 20 — the `void (async () => {...})()` that drives pending-message resume)

Files in scope (do NOT touch any other file):
- `app/_components/session-chat-page.tsx` — resume effect + cognitive complexity
- `app/_components/home-chat-page.tsx` — submit hook deps + empty block
- `app/_components/agent-chat-shell.tsx` — (verify if it has errors at Step 1; audit found 3 there)
- `app/api/auth/[...all]/route.ts` — unused var, useAwait, optional chain
- `app/layout.tsx` — `dangerouslySetInnerHtml`
- `components/auth/auth-display.tsx` — `dangerouslySetInnerHtml`
- `components/auth/user-menu.tsx` — `<img>` + `useImageSize`
- `components/auth/sign-in-button.tsx` — (verify at Step 1)
- `agent/tools/get_weather.ts` — `useAwait`

### Repo conventions (match these)

- Biome/ultracite is the linter/formatter (`biome.jsonc` extends
  `ultracite/biome/{core,react,next}`). It auto-sorts imports and enforces
  `import type`. `agent/**` enforces snake_case filenames (rule in
  `biome.jsonc:38-54` — does NOT apply to `app/`/`components/`/`lib/`).
- `components/ui/` and `lib/db/migrations` are EXCLUDED from biome
  (`biome.jsonc:9-16`). Do not touch them.
- Several rules are already downgraded in `biome.jsonc:18-34` (e.g.
  `noNoninteractiveElementInteractions` "warn", `useKeyWithClickEvents` "warn",
  `noImgElement` "warn", `noSvgWithoutTitle` "off"). The lint errors you fix
  are at default ("error") level — do NOT downgrade a rule to make an error
  go away. If a rule genuinely shouldn't apply, the right fix is a targeted
  `biome-ignore` comment with a reason, and only after the reviewer agrees —
  prefer fixing the code first.
- Match existing commit message style (short imperative, capitalized, no
  scope prefix — see `git log`, e.g. `Fix streamdown styles`).
- No comments unless the existing code at the same site has them (it doesn't).

## Commands you will need

| Purpose        | Command                          | Expected on success                              |
|----------------|----------------------------------|-------------------------------------------------|
| List errors    | `pnpm check 2>&1 \| rg "━━━" -A2` | shows current error list                         |
| Autofix (CARE) | `pnpm fix`                       | see Step 2 — DO NOT run blindly                  |
| Typecheck      | `pnpm typecheck`                 | exit 0                                           |
| Tests          | `pnpm test:run`                  | exit 0 (the resume-effect safety net)            |
| Final lint     | `pnpm check`                     | exit 0 (this is the goal of the plan)            |

## Suggested executor toolkit

- The `useExhaustiveDependencies` rule's "unsafe fix" can silently change
  behavior on hooks whose deps were intentionally minimal. Do NOT trust
  `pnpm fix` for those — read each violation and decide manually whether the
  missing dep is a real bug or an intentional omission (e.g. an effect that
  uses a ref to avoid re-running on dep change).
- The repo has `.agents/skills/dashboard-chat-best-practices` and
  `.agents/skills/eve-chat-template-eve` — if available, consult the
  dashboard skill before touching the resume effect; it documents the
  intended resume-after-refresh semantics. (This is advisory, not required.)

## Scope

**In scope**: the ~9 files listed in "Current state" above. Re-confirm the
exact set at Step 1 — only touch files that Step 1 shows have errors.

**Out of scope** (do NOT touch):
- `components/ui/**`, `lib/db/migrations/**` (biome-excluded).
- `biome.jsonc` rule severity changes — do NOT weaken rules to clear errors.
  The only config change allowed is Step 6 (documenting the gate in
  `AGENTS.md` is out of this plan's scope; tracked elsewhere).
- Do NOT touch any file that Step 1 does NOT list as having an error. If a
  file you edit happens to have OTHER lint issues revealed after the first
  fix, fix only the originally-listed errors plus any that the SAME fix
  surfaces in the same file.
- Do NOT add `biome-ignore` comments except where Step 5 explicitly permits
  (the `dangerouslySetInnerHtml` review path).
- Do NOT run `pnpm fix` on the whole repo — it would auto-apply unsafe
  hook-dep rewrites. See Step 2.

## Git workflow

- Branch: `advisor/006-fix-broken-lint-gate`
- Commit per bucket (see Steps 3-5): one commit for the auto-fixable-safe
  bucket, one for the auth `<img>`/`useAwait` bucket, one for the
  resume-effect bucket, one for the `dangerouslySetInnerHtml` review bucket.
  Message style: `Fix unused var and useAwait in auth route`, etc.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Re-audit the current error list

Run and capture the full output. The count drifted between the brief (60)
and the audit (21); trust what you see NOW, not the numbers in this plan.

```bash
pnpm check 2>&1 | tee /tmp/check-before.txt
echo "EXIT: ${PIPESTATUS[0]}"
rg "━━━" -A4 /tmp/check-before.txt
```

Record: total error count, and per-file error counts. The buckets in Steps
3-5 map to specific files/rules — confirm each cited location still has the
cited error before fixing it. If the set changed substantially (different
files, different rules), STOP and report — the plan needs re-planning for
the new error set.

**Verify**: you have `/tmp/check-before.txt` with the full output and a
recorded per-file breakdown.

### Step 2: DO NOT run `pnpm fix` globally

`pnpm fix` = `ultracite fix`, which auto-applies biome's suggested fixes
INCLUDING the `useExhaustiveDependencies` "unsafe fixes" on the resume
effect. Removing `chatId`/`clientError`/`submitting` from those dependency
arrays without understanding why they're there can silently break
resume-after-refresh. Plan 005's tests are the safety net but they cover
`lib/chat/*` and `tool-status.ts`, NOT the resume effect itself — so the
resume-effect fixes (Step 5) MUST be manual, not auto-applied.

Instead, fix each bucket by hand (Steps 3-5). You MAY run `pnpm fix` on a
single file ONLY for files in the "safe auto-fixable" bucket (Step 3), and
ONLY after staging any other uncommitted work to avoid cross-file fixes.

### Step 3: Bucket A — safe auto-fixable & low-risk

Files whose violations are `useAwait`, `noEmptyBlockStatements`,
`noUnusedVariables`, `useOptionalChain` (the auth route + the empty blocks +
the unused `redirectToAuthError`). These are mechanical and safe.

For each violation in this bucket:
- `useAwait` (`app/api/auth/[...all]/route.ts:16,20`,
  `agent/tools/get_weather.ts:9`): add the missing `await`. Read the line
  first — the called function returns a promise that is currently fire-and-forget.
  Adding `await` changes timing but not behavior for these (they're either
  top-level in an async handler or already in an async function).
- `noUnusedVariables` (`app/api/auth/[...all]/route.ts:30`):
  `redirectToAuthError` is unused. Read the file to confirm it's truly dead
  (no callers); if so, delete the function. If it's referenced only in a
  commented-out path, delete it — commented-out code with no explanation is
  dead code the playbook flags. If you find it IS used (audit was wrong), do
  NOT delete — STOP and report.
- `useOptionalChain` (`app/api/auth/[...all]/route.ts`): convert
  `obj && obj.prop` to `obj?.prop` per biome's suggestion.
- `noEmptyBlockStatements` (`home-chat-page.tsx:138`,
  `session-chat-page.tsx:139`): read each — an empty `catch {}` or
  `finally {}` is usually either a swallowed error (bad) or intentional
  (then a comment is appropriate, but repo style has no comments). The safe
  fix biome wants: if it's a `catch` with a binding, either remove the
  binding (`catch {`) or add the no-op the audit might have intended. Read
  context and pick the minimal change. If an empty block is hiding a real
  swallowed error on a critical path, STOP and report (don't suppress
  silently).

Run `pnpm fix` on ONLY the files in this bucket (e.g.
`pnpm exec biome check --write app/api/auth/[...all]/route.ts
agent/tools/get_weather.ts`), or apply by hand. Then verify.

**Verify per file in this bucket**:
- `pnpm typecheck` → exit 0
- `pnpm test:run` → exit 0 (no regressions)
- `pnpm check 2>&1 | rg "<this file>"` → zero NEW errors for that file; the
  originally-listed ones are fixed.

### Step 4: Bucket B — `noImgElement` / `useImageSize` in `components/auth/user-menu.tsx`

The `<img>` at `user-menu.tsx:92` triggers both. biome wants either
`next/image` (its default suggestion) or `useImageSize` to add width/height.
For a small avatar in a user menu, `next/image` is the idiomatic Next fix
and matches the repo's Next 16 conventions. Convert the `<img>` to
`<Image>` from `next/image`, adding `width`/`height` (or `fill` with a
sized container — read the surrounding CSS to pick). Confirm the image
still renders at the same size.

If the `img` is rendering an external user avatar URL (likely, from the
auth session), `next/image` requires the host in `next.config.ts`
`images.remotePatterns` — which is a `next.config.ts` edit, technically
out of the cited file scope but a necessary follow-on. If so, STOP and
report; the plan did not anticipate the `remotePatterns` dependency and a
human should decide whether to (a) add the pattern, (b) keep `<img>` and
`biome-ignore noImgElement` for the avatar with a comment, or (c) use a
plain `<img>` with explicit width/height attributes to satisfy
`useImageSize` only. Recommend (c) as the minimal in-scope fix.

**Verify**: `pnpm typecheck` exit 0; `pnpm check 2>&1 | rg "user-menu.tsx"`
→ zero errors for this file.

### Step 5: Bucket C — the resume-effect hook deps + cognitive complexity (HIGHEST RISK)

This is why plan 005 was a dependency. Read the resume effect in
`session-chat-page.tsx` (around lines 73, 205, 277, 308 per audit — confirm
at Step 1) and the home submit in `home-chat-page.tsx` (lines 61, 65).

For EACH `useExhaustiveDependencies` violation here:
- Read the effect and its dep array.
- Decide: is the missing dep a BUG (the effect uses a value that changed
  but the dep array omits it, so the effect runs with a stale closure) or
  INTENTIONAL (the dep is deliberately omitted to avoid re-running — usually
  with a ref indirection)?
- If BUG: add the dep. The test runner (005) does not directly cover the
  resume effect, so this is a judgement call — read the
  `dashboard-chat-best-practices` skill if available for the intended
  semantics.
- If INTENTIONAL: you have two choices biome accepts:
  1. Add the dep AND wrap the value in a ref so the effect doesn't re-run on
     its changes (the React-idiomatic fix).
  2. Add a targeted `biome-ignore lint/correctness/useExhaustiveDependencies:
     "<reason>"` comment on that line with a one-line explanation.
  Prefer (1) where it's a clean refactor; use (2) only if the ref rewrite
  is risky or out of scope. Do NOT pick the silent "remove the dep" path
  biome's unsafe fix offers.

For the `noExcessiveCognitiveComplexity` on
`session-chat-page.tsx:205` (the `void (async () => {...})()` driving
pending-message resume, complexity 30 vs max 20): the cleanest fix is to
extract the inner async body into a named helper function in module scope
(or a `useCallback`), reducing the inline complexity. Do NOT split the
functionality — the effect must remain a single resume-on-ready trigger; just
extract the body so the inline expression's complexity drops. Confirm
`pnpm test:run` still passes (it doesn't cover this directly, but the type
gate + the extraction being behavior-preserving is the safety check).

**Verify per file in this bucket**:
- `pnpm typecheck` → exit 0
- `pnpm test:run` → exit 0
- `pnpm check 2>&1 | rg "<this file>"` → zero errors
- Manually diff the resume effect before/after — the control flow and the
  set of conditions that fire it must be identical. Read it twice.

### Step 6: Bucket D — `noDangerouslySetInnerHtml` (REVIEW-REQUIRED, do NOT auto-fix)

`app/layout.tsx:103` and `components/auth/auth-display.tsx:36` use
`dangerouslySetInnerHtml`. biome flags this by default.

DO NOT rewrite or remove these. Read each call site: what HTML is being
injected, and is it from a trusted/static source (e.g. a hardcoded SVG
string, a static theme script) or from user/runtime data (XSS risk)?

- If the source is a static string literal in the source code (no user
  data): add a targeted biome-ignore with a one-line reason, e.g.
  `// biome-ignore lint/security/noDangerouslySetInnerHtml: static SVG string, no user input`.
  This is the accepted pattern for legitimate uses.
- If the source is runtime/user data: that is a real XSS finding — STOP
  and report. Do not suppress the warning; the call site needs a real fix
  (sanitize or avoid `dangerouslySetInnerHtml`), which is beyond this plan.

**Verify**: `pnpm check 2>&1 | rg "layout.tsx|auth-display.tsx"` → zero
errors (either the ignore comment cleared it, or you stopped).

### Step 7: Run the full gate

**Verify**:
- `pnpm check` → exit 0 (THE GOAL)
- `pnpm typecheck` → exit 0
- `pnpm test:run` → exit 0
- `pnpm fix` → exit 0 (now that there are no unsafe-fix hook-dep issues, a
  full `pnpm fix` should be a no-op or pure formatting; confirm it doesn't
  change behavior-relevant code)

## Test plan

No new tests to write. The verification is the gate itself (`pnpm check`
exit 0) plus the existing tests (`pnpm test:run` exit 0) as the safety net
for the resume-effect changes (Bucket C).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test:run` exits 0
- [ ] `git status` shows only the in-scope files modified (the ~9 listed in
      "Current state", plus this `plans/` update) — no out-of-scope file was
      touched (especially NOT `biome.jsonc`, `components/ui/**`,
      `lib/db/migrations/**`)
- [ ] No `biome-ignore` comments added except in `app/layout.tsx` and/or
      `components/auth/auth-display.tsx` (Bucket D), each with a reason line
- [ ] `plans/README.md` status row for plan 006 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows any in-scope file changed since `d1daea6` — re-run
  Step 1; if the error set is substantially different (different files,
  different rules, much higher/lower count), the plan needs re-planning.
- Plan 005 (`add-test-runner`) is not DONE — do NOT proceed to Bucket C
  (Step 5). You may do Buckets A, B, D first, but Bucket C requires the test
  safety net as a dependency. If 005 is BLOCKED, report and either wait or
  propose doing Buckets A/B/D only.
- A `useExhaustiveDependencies` violation is NOT clearly bug or intentional
  — the resume effect's intent is subtle. If you cannot confidently
  classify a missing dep, STOP and report the specific line and your
  uncertainty; do not guess.
- A `noEmptyBlockStatements` empty `catch` is hiding a real swallowed error
  on a critical path (auth, persistence, rate limit). Report it; do not
  silently add a no-op body.
- A `dangerouslySetInnerHtml` site (Bucket D) turns out to take RUNTIME data,
  not static — that's an XSS finding, not a lint fix. STOP and report.
- `pnpm fix` on a Bucket-A file tries to ALSO rewrite hook deps in an
  out-of-scope file (cross-file fix). Do not let it — restrict to the single
  file; if biome can't be restricted, apply the fix by hand.
- `pnpm check` still fails after all buckets with errors you can't trace to
  a cited violation — report the remaining error list; do not add
  `biome-ignore` to make the exit code green.

## Maintenance notes

- **For the reviewer**: the highest-scrutiny diff is Bucket C
  (`session-chat-page.tsx` resume effect). Read the before/after of that
  effect line by line — the set of conditions that fire resume, and the
  dependency array, must be intentional. Buckets A/B/D are low-risk and
  mechanical.
- **CI gate follow-up**: once `pnpm check` exits 0, the natural next step is
  adding it to a pre-commit hook and/or CI. That is out of this plan's scope
  (no CI config exists in the repo to edit) but is the immediate value of
  fixing the gate — call it out in the PR description.
- **Rule drift**: `biome.jsonc` extends `ultracite/biome/{core,react,next}`;
  future ultracite/biome bumps may surface new errors. The triage-bucket
  pattern in this plan is reusable: auto-fixable+safe, review-required,
  highest-risk-last. The next time the gate breaks, re-derive the buckets
  rather than re-running `pnpm fix`.
- **`dangerouslySetInnerHtml` ignores**: the biome-ignore comments added in
  Bucket D should name what the trusted source IS ("static SVG string"), so
  a future reviewer who changes the source to runtime data sees the
  assumption and re-evaluates. If the source ever becomes dynamic, the
  ignore must be revisited — note this in the diff.
- Deferred out of scope: enriching `AGENTS.md` to document that `pnpm check`
  is a required gate (and that `pnpm fix` is unsafe on resume hooks). That's
  the AGENTS.md-thinness finding, tracked separately.
