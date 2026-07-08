# Plan 010: Extract the duplicated "restore draft from sessionStorage" effect into a shared hook

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7a51867..HEAD -- app/_components/home-chat-page.tsx app/_components/session-chat-page.tsx app/_components/agent-chat-shell.tsx`
> If any of these three files changed since this plan was written, compare
> the "Current state" excerpts below against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `7a51867`, 2026-07-08

## Why this matters

The exact same 12-line `useEffect` — "if there's a signed-in viewer, read the
`eve-chat-draft` key from `sessionStorage`, put it into the draft state, and
clear the key" — is copy-pasted verbatim in two components:
`app/_components/home-chat-page.tsx:40-51` and
`app/_components/session-chat-page.tsx:256-267`. The same
`"eve-chat-draft"` string literal is *also* hand-typed at two more call
sites that write the key (`session-chat-page.tsx:130` and
`agent-chat-shell.tsx:392`) with no shared constant tying the four sites
together. Because the key is a bare string repeated four times across three
files, a future rename or format change (e.g. adding a version suffix) is
one typo away from silently breaking draft restoration — the failure mode
is a user's typed message quietly vanishing after a redirect, which is hard
to notice and hard to debug from a bug report. Consolidating the read+clear
logic into one hook and the key into one module removes both the duplication
and that class of bug.

## Current state

- `app/_components/home-chat-page.tsx` — the chat composer shown at `/`.
  Restores a draft after the viewer becomes available (e.g. after signing
  in). Relevant block, lines 40-51:

  ```tsx
    useEffect(() => {
      if (!viewer) {
        return;
      }

      const restoredDraft = window.sessionStorage.getItem("eve-chat-draft");

      if (restoredDraft) {
        setDraft(restoredDraft);
        window.sessionStorage.removeItem("eve-chat-draft");
      }
    }, [viewer]);
  ```

- `app/_components/session-chat-page.tsx` — the composer shown at
  `/chat/[id]`. Same restoration logic, lines 256-267 (byte-identical to the
  block above except indentation):

  ```tsx
    useEffect(() => {
      if (!viewer) {
        return;
      }

      const restoredDraft = window.sessionStorage.getItem("eve-chat-draft");

      if (restoredDraft) {
        setDraft(restoredDraft);
        window.sessionStorage.removeItem("eve-chat-draft");
      }
    }, [viewer]);
  ```

  The same file also *writes* the key by hand, lines 129-131 (inside the
  `catch` block of the provisional-chat-creation effect, when chat creation
  fails and the user is bounced back to `/`):

  ```tsx
        try {
          window.sessionStorage.setItem("eve-chat-draft", pendingMessage);
        } catch {}
  ```

- `app/_components/agent-chat-shell.tsx` — the third and last hand-written
  use of the same literal, lines 387-399 (stashes the draft right before a
  sign-in redirect so `home-chat-page.tsx`/`session-chat-page.tsx` can
  restore it afterwards):

  ```tsx
          <SignInModal
            callbackPath={signInCallbackPath}
            onBeforeSignIn={() => {
              if (draftBeforeSignIn) {
                window.sessionStorage.setItem(
                  "eve-chat-draft",
                  draftBeforeSignIn
                );
              }
            }}
            onOpenChange={setAuthDialogOpen}
            open={authDialogOpen}
          />
  ```

- `viewer` in both `home-chat-page.tsx` and `session-chat-page.tsx` comes
  from `const { viewer } = useChatShell();` (`app/_components/chat-shell-context.tsx:42-50`)
  and is typed `Viewer | null` (`lib/chat/types.ts:3-8`).

- **Repo convention for small storage helpers**: `lib/chat/provisional-chat.ts`
  already holds pure, defensively-written sessionStorage helpers for a
  *different* key (`eve-chat-pending:<chatId>`, used for the pending
  first-message-of-a-new-chat flow — a related but distinct concept from the
  composer draft). Follow its shape: guard on `typeof window === "undefined"`,
  wrap `sessionStorage` calls in `try {} catch {}` (per the
  `vercel-react-best-practices` skill's `client-localstorage-schema` rule —
  `getItem`/`setItem` throw in private browsing, when the quota is exceeded,
  or when storage is disabled), and export small named functions instead of
  inlining `window.sessionStorage` calls at call sites. Do **not** merge this
  new module into `provisional-chat.ts` — the two keys serve different
  purposes and have different lifecycles; keep them in separate files the
  same way the codebase already keeps `lib/chat/limits.ts` and
  `lib/chat/title.ts` separate.

- **Repo convention for colocated hooks**: `components/chat/message/use-streaming-text.ts`
  is the one other custom hook file in the codebase. It starts with
  `"use client";`, lives next to the component(s) that consume it (not in a
  central `hooks/` directory — note the repo root does have an empty,
  unused `hooks/` directory; do not put anything in it, nothing else in the
  codebase imports from it), and has no dedicated test file. Follow the same
  placement pattern: put the new hook directly in `app/_components/`, next
  to its two consumers.

- **Suggested executor toolkit**:
  - The `vercel-react-best-practices` skill, rule `client-localstorage-schema`
    (wrap storage access in try/catch; this plan's code already does it —
    use the rule to sanity-check you haven't dropped it while editing) and
    rule `rerender-dependencies` (effect dependency arrays should list every
    value the effect reads — the hook below already does this correctly with
    `[viewer, setDraft]`; preserve it).
  - The Next.js `use client` directive doc, vendored at
    `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`:
    explains that the directive marks a client entry boundary and belongs at
    the top of the file before imports. This hook is only consumed by Client
    Components, so the directive is conservative rather than strictly needed
    by that doc; keep it because the repo's existing custom hook file
    (`components/chat/message/use-streaming-text.ts`) uses the same pragma and
    this hook uses `useEffect`.

## Commands you will need

| Purpose               | Command                                                                 | Expected on success |
|------------------------|--------------------------------------------------------------------------|----------------------|
| Typecheck              | `pnpm typecheck`                                                        | exit 0, no errors |
| Run one test file      | `pnpm exec vitest run lib/chat/draft-storage.test.ts`                   | all tests pass |
| Run full test suite    | `pnpm test:run`                                                         | see note below |
| Scoped lint check      | `pnpm exec biome check <file> [<file> ...]`                             | see note below |

**Known pre-existing failures — do not try to fix these, they are unrelated
and already tracked:**
- `pnpm test:run` currently exits 1 with **34 passed, 1 failed** —
  `lib/chat/limits.test.ts` fails on a locale-formatting mismatch. This is a
  pre-existing regression tracked by `plans/009-fix-locale-fragile-limits-test.md`
  and has nothing to do with this plan. After this plan's changes, expect
  the **same** 1 failure and 7 new passing tests from
  `lib/chat/draft-storage.test.ts` (so **41 passed, 1 failed** if run before
  009 lands, or **42 passed, 0 failed** if 009 has already landed).
- `pnpm exec biome check` on the whole repo currently fails with **100+
  pre-existing errors** across 32+ files, tracked by
  `plans/006-fix-broken-lint-gate.md`. Do not run bare `pnpm check` as a
  gate for this plan — it will fail for reasons unrelated to your changes.
  Use the **scoped** `pnpm exec biome check <file>` form shown in each step
  below instead, and compare against the baseline counts given in each step.

## Scope

**In scope** (the only files you should create or modify):
- `lib/chat/draft-storage.ts` (create)
- `lib/chat/draft-storage.test.ts` (create)
- `app/_components/use-restored-draft.ts` (create)
- `app/_components/home-chat-page.tsx` (modify)
- `app/_components/session-chat-page.tsx` (modify)
- `app/_components/agent-chat-shell.tsx` (modify)

**Out of scope** (do NOT touch, even though they look related):
- `lib/chat/provisional-chat.ts` — a different sessionStorage key
  (`eve-chat-pending:<chatId>`) for a different concept (the pending
  first-message-of-a-new-chat flow). Do not merge it with the new
  `draft-storage.ts` module.
- `vitest.config.ts` — do NOT add a jsdom/browser test environment or widen
  the `include` pattern. The plan below tests the pure storage functions
  using `vi.stubGlobal`, which works fine under the existing
  `environment: "node"` config. Adding DOM-test infrastructure is a larger,
  separate decision and is not needed here (the codebase's one existing
  custom hook, `use-streaming-text.ts`, also has no dedicated test file —
  match that convention for the hook itself).
- Any other lint finding `pnpm exec biome check` reports in
  `home-chat-page.tsx`, `session-chat-page.tsx`, or `agent-chat-shell.tsx`
  besides the exact lines you are editing. These are pre-existing and
  tracked by `plans/006-fix-broken-lint-gate.md`. In particular, do **not**
  refactor the `onBeforeSignIn={() => {...}}` arrow function in
  `agent-chat-shell.tsx` into a `useCallback` even though
  `lint/performance/noJsxPropsBind` flags it — that's 006's job, not this
  plan's.
- `plans/009-fix-locale-fragile-limits-test.md`'s failing test
  (`lib/chat/limits.test.ts`) — pre-existing, unrelated, do not touch.
- The sessionStorage key name or format (no versioning suffix, no JSON
  wrapping). The key stays a plain string, matching today's behavior exactly
  — this plan is a pure refactor, not a behavior or schema change.

## Git workflow

- Branch: `advisor/010-extract-restored-draft-hook` (matches the
  `advisor/NNN-<slug>` pattern used by prior plans in this repo, e.g.
  `advisor/007-test-lib-chat-helpers`).
- Commit per step or per logical unit. This repo's commit style is a short
  imperative summary with no prefix/scope (see `git log --oneline -5`, e.g.
  "Update dependencies", "Reconcile plans", "Replace the `areEqualJsonValues`
  function by `isDeepEqualData`").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the storage module

Create `lib/chat/draft-storage.ts` with this exact content:

```ts
const CHAT_DRAFT_STORAGE_KEY = "eve-chat-draft";

export function readAndClearChatDraft(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const draft = window.sessionStorage.getItem(CHAT_DRAFT_STORAGE_KEY);

    if (draft) {
      window.sessionStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
    }

    return draft;
  } catch {
    return null;
  }
}

export function writeChatDraft(draft: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(CHAT_DRAFT_STORAGE_KEY, draft);
  } catch {}
}
```

This is a direct, behavior-preserving extraction: `readAndClearChatDraft`
does exactly what the two duplicated `useEffect` bodies did (read, then
remove-if-present), and `writeChatDraft` does exactly what the two
hand-written `setItem` call sites did. The `typeof window === "undefined"`
guard and `try/catch` match `lib/chat/provisional-chat.ts`'s existing
defensive style (see `readPendingChatMessage`/`writePendingChatMessage` in
that file).

**Verify**: `grep -n "export function readAndClearChatDraft\|export function writeChatDraft" lib/chat/draft-storage.ts`
→ prints both lines.

### Step 2: Add tests for the storage module

Create `lib/chat/draft-storage.test.ts` with this exact content:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { readAndClearChatDraft, writeChatDraft } from "./draft-storage";

function createFakeSessionStorage() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;
}

function createThrowingSessionStorage() {
  return {
    getItem: () => {
      throw new Error("storage unavailable");
    },
    removeItem: () => {
      throw new Error("storage unavailable");
    },
    setItem: () => {
      throw new Error("storage unavailable");
    },
  } as Storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readAndClearChatDraft", () => {
  it("returns null when no draft was stored", () => {
    vi.stubGlobal("window", { sessionStorage: createFakeSessionStorage() });

    expect(readAndClearChatDraft()).toBeNull();
  });

  it("returns the stored draft and clears it", () => {
    const sessionStorage = createFakeSessionStorage();
    sessionStorage.setItem("eve-chat-draft", "hello world");
    vi.stubGlobal("window", { sessionStorage });

    expect(readAndClearChatDraft()).toBe("hello world");
    expect(sessionStorage.getItem("eve-chat-draft")).toBeNull();
  });

  it("returns null when window is unavailable (server context)", () => {
    expect(readAndClearChatDraft()).toBeNull();
  });

  it("returns null when sessionStorage throws", () => {
    vi.stubGlobal("window", { sessionStorage: createThrowingSessionStorage() });

    expect(readAndClearChatDraft()).toBeNull();
  });
});

describe("writeChatDraft", () => {
  it("stores the draft under the shared key", () => {
    const sessionStorage = createFakeSessionStorage();
    vi.stubGlobal("window", { sessionStorage });

    writeChatDraft("draft text");

    expect(sessionStorage.getItem("eve-chat-draft")).toBe("draft text");
  });

  it("does not throw when window is unavailable (server context)", () => {
    expect(() => writeChatDraft("draft text")).not.toThrow();
  });

  it("does not throw when sessionStorage throws", () => {
    vi.stubGlobal("window", { sessionStorage: createThrowingSessionStorage() });

    expect(() => writeChatDraft("draft text")).not.toThrow();
  });
});
```

This follows the existing pattern in `lib/chat/limits.test.ts` (plain
`describe`/`it`/`expect` from `vitest`, no test framework beyond that). The
test's `environment: "node"` (set in `vitest.config.ts`) means `window` is
genuinely `undefined` unless a test stubs it with `vi.stubGlobal` — this is
intentional and lets the tests exercise both the real read/write logic (via
the stub) and the server-context guard (without the stub), with no jsdom
dependency.

**Verify**: `pnpm exec vitest run lib/chat/draft-storage.test.ts` → `Test Files  1 passed (1)`, `Tests  7 passed (7)`.

### Step 3: Create the hook

Create `app/_components/use-restored-draft.ts` with this exact content:

```ts
"use client";

import { useEffect } from "react";

import { readAndClearChatDraft } from "@/lib/chat/draft-storage";
import type { Viewer } from "@/lib/chat/types";

/**
 * Restores a chat draft that was stashed in sessionStorage — e.g. right
 * before a sign-in redirect, or after a failed chat-creation attempt — once
 * a viewer is available, then clears it so it isn't restored twice.
 */
export function useRestoredDraft(
  viewer: Viewer | null,
  setDraft: (draft: string) => void
) {
  useEffect(() => {
    if (!viewer) {
      return;
    }

    const restoredDraft = readAndClearChatDraft();

    if (restoredDraft) {
      setDraft(restoredDraft);
    }
  }, [viewer, setDraft]);
}
```

**Verify**: `pnpm typecheck` → exit 0, no errors (the hook is not imported
anywhere yet, so this only confirms the new file itself is valid TypeScript).

### Step 4: Use the hook in `home-chat-page.tsx`

In `app/_components/home-chat-page.tsx`:

1. Add the import. Insert it as the last line of the local (`"./..."`)
   import group, after `import { ErrorToast } from "./error-toast";`:

   ```ts
   import { useRestoredDraft } from "./use-restored-draft";
   ```

2. Replace the effect at lines 40-51:

   ```tsx
     useEffect(() => {
       if (!viewer) {
         return;
       }

       const restoredDraft = window.sessionStorage.getItem("eve-chat-draft");

       if (restoredDraft) {
         setDraft(restoredDraft);
         window.sessionStorage.removeItem("eve-chat-draft");
       }
     }, [viewer]);
   ```

   with:

   ```tsx
     useRestoredDraft(viewer, setDraft);
   ```

   Leave the `useEffect` import at the top of the file in place — it's still
   used by the other two effects in this component.

**Verify**:
- `pnpm typecheck` → exit 0.
- `grep -n "eve-chat-draft" app/_components/home-chat-page.tsx` → no output
  (the literal is gone from this file).

### Step 5: Use the hook in `session-chat-page.tsx`, and reuse `writeChatDraft`

In `app/_components/session-chat-page.tsx`:

1. Add the import for `writeChatDraft`. Insert it alphabetically among the
   `@/...` imports, immediately after
   `import { ChatComposer } from "@/components/chat/composer";` and before
   the `@/lib/chat/provisional-chat` import block:

   ```ts
   import { writeChatDraft } from "@/lib/chat/draft-storage";
   ```

2. Add the hook import. Insert it as the last line of the local (`"./..."`)
   import group, after `import type { AgentChatController, AgentChatControllerStatus } from "./types";`:

   ```ts
   import { useRestoredDraft } from "./use-restored-draft";
   ```

3. Replace the hand-written write at lines 129-131:

   ```tsx
         try {
           window.sessionStorage.setItem("eve-chat-draft", pendingMessage);
         } catch {}
   ```

   with:

   ```tsx
         writeChatDraft(pendingMessage);
   ```

4. Replace the effect at lines 256-267:

   ```tsx
     useEffect(() => {
       if (!viewer) {
         return;
       }

       const restoredDraft = window.sessionStorage.getItem("eve-chat-draft");

       if (restoredDraft) {
         setDraft(restoredDraft);
         window.sessionStorage.removeItem("eve-chat-draft");
       }
     }, [viewer]);
   ```

   with:

   ```tsx
     useRestoredDraft(viewer, setDraft);
   ```

   Leave the `useEffect` import in place — it's still used by several other
   effects in this component.

**Verify**:
- `pnpm typecheck` → exit 0.
- `grep -n "eve-chat-draft" app/_components/session-chat-page.tsx` → no
  output.

### Step 6: Reuse `writeChatDraft` in `agent-chat-shell.tsx`

In `app/_components/agent-chat-shell.tsx`:

1. Add the import. Insert it alphabetically among the `@/...` imports,
   immediately before `import { mergeChatHistory } from "@/lib/chat/message";`:

   ```ts
   import { writeChatDraft } from "@/lib/chat/draft-storage";
   ```

2. Replace lines 389-395:

   ```tsx
             onBeforeSignIn={() => {
               if (draftBeforeSignIn) {
                 window.sessionStorage.setItem(
                   "eve-chat-draft",
                   draftBeforeSignIn
                 );
               }
             }}
   ```

   with:

   ```tsx
             onBeforeSignIn={() => {
               if (draftBeforeSignIn) {
                 writeChatDraft(draftBeforeSignIn);
               }
             }}
   ```

   Do not touch anything else in this component, including the surrounding
   `<SignInModal>` props — the `onBeforeSignIn={() => {...}}` arrow function
   itself is a pre-existing `lint/performance/noJsxPropsBind` finding
   (tracked by plan 006); only change what's inside its body.

**Verify**:
- `pnpm typecheck` → exit 0.
- `grep -rn --exclude='*.test.ts' "eve-chat-draft" app/ components/ lib/` →
  the **only** remaining non-test match is the definition inside
  `lib/chat/draft-storage.ts`.

## Test plan

- New tests live in `lib/chat/draft-storage.test.ts` (Step 2 above), modeled
  directly on `lib/chat/limits.test.ts`'s `describe`/`it`/`expect` style.
  They cover: reading with no draft present, reading-and-clearing an
  existing draft, reading when `window` is unavailable, reading when
  `sessionStorage` throws, writing a draft, writing when `window` is
  unavailable, and writing when `sessionStorage` throws.
- The hook itself (`use-restored-draft.ts`) is intentionally left without a
  dedicated test file, matching the repo's only other custom hook
  (`components/chat/message/use-streaming-text.ts`), which also has none —
  there is no jsdom/React-rendering test harness configured in this repo
  (`vitest.config.ts` sets `environment: "node"` and
  `include: ["lib/**/*.test.ts"]` only). Setting one up is a separate,
  larger decision (see "Out of scope").
- Verification: `pnpm exec vitest run lib/chat/draft-storage.test.ts` → all
  7 new tests pass. Then `pnpm test:run` → see the "Known pre-existing
  failures" note in "Commands you will need" for the exact expected count.
- **Manual QA** (no automated harness covers this end-to-end flow — do this
  in a local `pnpm dev` session before considering the plan done):
  1. On `/`, type a message into the composer but don't submit.
  2. Trigger a sign-in redirect (e.g. click the sign-in control) — this
     calls `writeChatDraft` via `agent-chat-shell.tsx`'s `onBeforeSignIn`.
  3. Complete sign-in and land back on `/`. The composer should show the
     same draft text you typed in step 1 (restored via `useRestoredDraft` in
     `home-chat-page.tsx`), and the `eve-chat-draft` sessionStorage key
     should be gone (check DevTools → Application → Session Storage).
  4. Separately, on an existing `/chat/[id]` route, force a chat-creation
     failure if feasible (or read the code path at
     `session-chat-page.tsx:106-138`) and confirm the same restore-and-clear
     behavior on redirect back to `/`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm exec vitest run lib/chat/draft-storage.test.ts` exits 0, 7 tests pass
- [ ] `pnpm test:run` shows no failures beyond the single pre-existing
      `lib/chat/limits.test.ts` failure (41 passed / 1 failed, or 42 passed /
      0 failed if plan 009 has already landed) — no new failures
- [ ] `grep -rn --exclude='*.test.ts' "eve-chat-draft" app/ components/ lib/`
      returns exactly one non-test match, in `lib/chat/draft-storage.ts`
- [ ] `pnpm exec biome check lib/chat/draft-storage.ts lib/chat/draft-storage.test.ts app/_components/use-restored-draft.ts`
      reports 0 errors (these are brand-new files with no pre-existing
      baseline to compare against)
- [ ] `git status --short` shows changes only in the six files listed under
      "Scope" → "In scope"
- [ ] `plans/README.md` status row for plan 010 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited line ranges in "Current state" doesn't match what's
  in the repo (drift since this plan was written) — re-read the drift-check
  instruction at the top of this file.
- `useChatShell()` no longer exposes a `viewer` field typed `Viewer | null`
  (check `app/_components/chat-shell-context.tsx` and `lib/chat/types.ts`) —
  the hook's signature depends on this.
- `pnpm exec vitest run lib/chat/draft-storage.test.ts` fails after one
  reasonable fix attempt.
- `pnpm typecheck` reports errors that don't obviously trace to a typo in
  one of the steps above.
- You find yourself wanting to fix a `pnpm exec biome check` finding that
  isn't on a line you just added or changed — that's pre-existing debt
  tracked by plan 006, not this plan's job.
- You discover another production code path that reads or writes the
  `"eve-chat-draft"` string that this plan's grep in Step 6 didn't catch —
  re-run `rg -n "eve-chat-draft" app components lib --glob '!**/*.test.ts'`
  and report any additional non-test site before proceeding, rather than
  silently leaving it un-migrated. The new `lib/chat/draft-storage.test.ts`
  file is allowed to contain the literal because it asserts the key name.

## Maintenance notes

- Any future feature that needs to stash something in sessionStorage across
  a redirect (e.g. restoring composer attachments, not just text) should
  extend `lib/chat/draft-storage.ts` with its own key and functions, or
  generalize this module — not add another ad hoc `window.sessionStorage`
  call site.
- `plans/006-fix-broken-lint-gate.md` will re-scan the whole repo for lint
  errors after this lands. The line numbers for any pre-existing findings in
  `home-chat-page.tsx`, `session-chat-page.tsx`, and `agent-chat-shell.tsx`
  will shift (this plan removes 11 lines from `home-chat-page.tsx`, ~11 net
  lines from `session-chat-page.tsx`, and ~4 lines from
  `agent-chat-shell.tsx`) — whoever executes 006 after this should expect
  that drift and re-locate findings by rule name, not by the line numbers in
  006's current text.
- A reviewer should scrutinize: that `readAndClearChatDraft`/`writeChatDraft`
  preserve the exact original behavior (read-then-conditionally-clear;
  write-with-silent-failure), and that no call site was left using the raw
  `window.sessionStorage` + `"eve-chat-draft"` literal in production code
  (the Step 6 grep is the check for this; the test file is intentionally
  exempt).
