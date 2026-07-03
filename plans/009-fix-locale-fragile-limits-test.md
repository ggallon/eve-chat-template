# Plan 009: Fix locale-fragile `limits.test.ts` assertion (007 regression)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 971fd68..HEAD -- lib/chat/limits.ts lib/chat/limits.test.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 007 (the test file must exist — it landed on `canary` as
  commit `4868aea`)
- **Category**: bug
- **Planned at**: commit `971fd68`, 2026-07-03

## Why this matters

Plan 007's characterization tests landed on `canary` (commit `4868aea`), but
`pnpm test:run` currently exits 1 — one test fails:

```
FAIL  lib/chat/limits.test.ts > assertChatMessageLength > throws an error whose message names the formatted limit and the character budget
AssertionError: expected [Function] to throw error including 'Messages must be 8\u202f000 character…' but got 'Messages must be 8,000 characters or …'
```

The root cause: `lib/chat/limits.ts:12` calls
`MAX_CHAT_MESSAGE_CHARS.toLocaleString()` with **no locale argument**, so the
formatted number depends on the runtime's default locale
(`"8,000"` under `en-US`; `"8 000"` / `"8\u202f000"` under `fr-FR` or other
ICU data variants). The executor that wrote the test verified it in an
environment whose default locale produced a narrow no-break space (`\u202f`),
then hardcoded that exact string in `limits.test.ts:49`. On the current
`canary` HEAD the same call produces a comma, so the test fails.

This has two consequences: (1) the test gate (`pnpm test:run`) is red on
`canary`, blocking any CI that runs tests; (2) the production error message
shown to users is itself locale-dependent — users in different server locales
see different number formatting in the same English error string. Both are
fixed by pinning the locale to `"en-US"` in the source (the app is entirely
in English) and updating the test to assert the deterministic output.

## Current state

### `lib/chat/limits.ts` (full file, 21 lines)

```ts
export const MAX_CHAT_MESSAGE_CHARS = 8000;

export function getChatMessageLength(message: string) {
  return Array.from(message).length;
}

export function getChatMessageLengthError(message: string) {
  if (getChatMessageLength(message.trim()) <= MAX_CHAT_MESSAGE_CHARS) {
    return null;
  }

  return `Messages must be ${MAX_CHAT_MESSAGE_CHARS.toLocaleString()} characters or fewer.`;
}

export function assertChatMessageLength(message: string) {
  const error = getChatMessageLengthError(message);

  if (error) {
    throw new Error(error);
  }
}
```

The fix is on line 12: change `MAX_CHAT_MESSAGE_CHARS.toLocaleString()` to
`MAX_CHAT_MESSAGE_CHARS.toLocaleString("en-US")` so the output is always
`"8,000"` regardless of the runtime locale.

### `lib/chat/limits.test.ts` (lines 46–51, the failing test)

```ts
  it("throws an error whose message names the formatted limit and the character budget", () => {
    expect(() =>
      assertChatMessageLength("a".repeat(MAX_CHAT_MESSAGE_CHARS + 1))
    ).toThrow("Messages must be 8 000 characters or fewer.");
  });
```

Line 49 expects `"Messages must be 8 000 characters or fewer."` (with a
narrow no-break space `\u202f` between `8` and `000`). After pinning the
locale to `"en-US"` in the source, the actual output will be
`"Messages must be 8,000 characters or fewer."` (comma separator). Update
the expected string on line 49 to match.

> **Note**: plan 007's Step 3 originally told the executor to use
> `toMatch(/.../)` with a loose pattern ("do not assert exact wording, since
> it may be tweaked"). The executor used `.toThrow(exactString)` instead,
> which is what made the assertion locale-fragile. This plan pins the locale
> so an exact assertion is safe and deterministic.

### Repo conventions (match these)

- No comments in source or test files unless explanatory of a non-obvious
  case — match the surrounding style (neither `limits.ts` nor
  `limits.test.ts` has any).
- Run `pnpm fix` after editing to let biome format/sort; confirm with
  `pnpm check` that no NEW errors appear in these two files.
- Biome/ultracite enforces `import type` for type-only imports — not relevant
  here since no imports change.

## Commands you will need

| Purpose     | Command              | Expected on success                                         |
|-------------|----------------------|-------------------------------------------------------------|
| Tests       | `pnpm test:run`      | exit 0, 35/35 tests pass (0 failures)                      |
| Typecheck   | `pnpm typecheck`     | exit 0, no errors                                           |
| Autofix     | `pnpm fix`           | exit 0 (formats the two edited files)                      |
| Lint check  | `pnpm check`         | exit non-zero expected repo-wide (60 pre-existing errors); confirm zero NEW errors in `lib/chat/limits.ts` or `lib/chat/limits.test.ts` |

## Scope

**In scope** (the only files you should modify):
- `lib/chat/limits.ts` — one-line change on line 12
- `lib/chat/limits.test.ts` — one-line change on line 49

**Out of scope** (do NOT touch):
- `lib/chat/events.test.ts` and `lib/chat/title.test.ts` — they pass and have
  no locale dependency.
- Any other source or test file.
- Plan 006's lint errors — do NOT fix lint errors you happen to see; 006
  owns the lint gate.

## Git workflow

- Branch: `advisor/009-fix-locale-fragile-limits-test`
- Commit message style (match `git log`): short imperative, capitalized —
  e.g. `Pin locale in limits error message and fix test assertion`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Pin the locale in `lib/chat/limits.ts`

On line 12, change:

```ts
  return `Messages must be ${MAX_CHAT_MESSAGE_CHARS.toLocaleString()} characters or fewer.`;
```

to:

```ts
  return `Messages must be ${MAX_CHAT_MESSAGE_CHARS.toLocaleString("en-US")} characters or fewer.`;
```

**Verify**: `node -e "console.log((8000).toLocaleString('en-US'))"` → prints
`8,000`.

### Step 2: Update the test assertion in `lib/chat/limits.test.ts`

On line 49, change:

```ts
    ).toThrow("Messages must be 8 000 characters or fewer.");
```

to:

```ts
    ).toThrow("Messages must be 8,000 characters or fewer.");
```

**Verify**: read the file back and confirm line 49 now contains `8,000`
(with a comma), not `8 000` (with a space).

### Step 3: Run the gate

Run all four commands in order:

1. `pnpm fix` → formats the two edited files; exit 0.
2. `pnpm test:run` → **exit 0**, 35/35 tests pass, 0 failures.
3. `pnpm typecheck` → exit 0.
4. `pnpm check 2>&1 | grep "limits"` → confirm no NEW errors in
   `lib/chat/limits.ts` or `lib/chat/limits.test.ts` (the 60 pre-existing
   repo-wide errors are plan 006's scope, not this plan's concern).

## Test plan

This plan fixes an existing failing test — no new tests to write. The test
plan is the verification in Step 3: `pnpm test:run` exits 0 with 35/35.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test:run` exits 0 with 35/35 tests passing (0 failures)
- [ ] `pnpm typecheck` exits 0
- [ ] `git status` shows only: `lib/chat/limits.ts`,
      `lib/chat/limits.test.ts` (plus this `plans/` update)
- [ ] `lib/chat/limits.ts:12` contains `toLocaleString("en-US")` (with the
      locale argument)
- [ ] `lib/chat/limits.test.ts:49` contains `8,000` (comma, not space)
- [ ] `plans/README.md` status row for plan 009 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `lib/chat/limits.ts` or `lib/chat/limits.test.ts`
  changed since `971fd68` in a way that contradicts the "Current state"
  excerpts above (e.g. the `toLocaleString()` call is gone, or the test
  already expects `8,000`).
- `pnpm test:run` still fails after both edits — the failure may have a
  different root cause than the one diagnosed here. Report the actual
  failure output.
- `(8000).toLocaleString("en-US")` does NOT produce `"8,000"` in the
  executor's environment — this would mean the Node.js ICU data is
  non-standard; report it and do NOT improvise a workaround.
- Fixing the test appears to require touching a file outside the in-scope
  list.

## Maintenance notes

- **For the reviewer**: confirm (1) the locale argument `"en-US"` is on
  `limits.ts:12`, (2) the test on `limits.test.ts:49` expects `8,000` with a
  comma, (3) `pnpm test:run` is green (35/35), (4) no other file was
  modified.
- **Future changes**: if the app ever localizes error messages (i18n),
  `limits.ts` should switch from `toLocaleString("en-US")` to the active
  locale's formatter; the test would then need to use the same locale. Until
  then, the pinned `"en-US"` keeps the error deterministic.
- **Why not a loose regex (`toMatch`)**: plan 007's original guidance
  suggested `toMatch(/.../)` to avoid exact-wording assertions. Pinning the
  locale makes the output deterministic, so an exact `toThrow(string)`
  assertion is safe and more precise than a regex — it catches any change to
  the message wording, not just the number format.
