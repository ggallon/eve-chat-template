# Plan 004: Re-point stale `components/chat/message.tsx` references in the docs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat d1daea6..HEAD -- docs/how-the-chatbot-works.md`
> If the docs file changed since this plan was written, compare the "Current
> state" line numbers against the live file before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `d1daea6`, 2026-06-27

## Why this matters

PR #1 deleted `components/chat/message.tsx` and split it into a
`components/chat/message/` directory of 9 focused files. The docs
(`docs/how-the-chatbot-works.md`) still point at the old single-file path in
three places — including the "Adding A New Tool" recipe, which tells a reader
to edit a file that no longer exists. A reader following that recipe will
either grep in confusion or re-create `message.tsx` and undo the split. Stale
docs that give confident, specific, wrong instructions are worse than missing
docs. This plan re-points the three references at the actual files so the docs
match reality.

## Current state

`docs/how-the-chatbot-works.md` has three stale references to
`components/chat/message.tsx`. Confirm they still exist before editing:

- **Line 41** — in the "Main Pieces" file table:
  ```
  | `components/chat/message.tsx` | Renders eve messages, markdown, reasoning, tools, and input requests. |
  ```
- **Line 714** — in the "Message Rendering" section:
  ```
  `useEveAgent` reduces stream events into message data. The template renders that
  data through `components/chat/message.tsx`.
  ```
- **Line 831** — in the "Adding A New Tool" recipe (step 5):
  ```
  5. If the UI should render a special tool state, update
     `components/chat/message.tsx`.
  ```

The new structure (verified by `ls components/chat/message/`):
```
format.ts
index.tsx          ← public entry; exports AgentMessage, re-exports AgentInputResponse
reasoning-part.tsx
text-part.tsx
tool-group.tsx     ← renders a grouped tool-call row + expansion
tool-parts.tsx     ← renders tool status icon, name label, payload, input-request UI
tool-status.ts
types.ts
use-streaming-text.ts
```

Mapping for the re-points (based on `plans/001-split-message-component.md`):
- Line 41 (file-table description) → `components/chat/message/index.tsx` (the
  public entry; same one-sentence description applies).
- Line 714 (renders via…) → `components/chat/message/index.tsx`.
- Line 831 (tool-state UI recipe) → `components/chat/message/tool-parts.tsx`
  (the file that renders tool status icon, name label, payload, and the
  input-request actions) AND mention `tool-group.tsx` (the grouped row) — a
  tool that needs special *rendering* touches `tool-parts.tsx`; a tool that
  needs special *grouping* touches `tool-group.tsx`. Name both so the reader
  knows where each concern lives.

### Repo conventions (match these)

- **Prose style of the docs**: lowercase `eve` everywhere (see `AGENTS.md:5-6`
  — do not title-case). The existing doc already follows this; match it.
- **Code-fence vs inline**: the file-table row uses backticks around the path;
  the prose sections use backticks around the path inline. Keep both styles.
- No comments in docs (markdown prose only).

## Commands you will need

| Purpose   | Command                                                              | Expected on success |
|-----------|---------------------------------------------------------------------|---------------------|
| Verify    | `rg -n "components/chat/message\.tsx" docs/`                        | zero matches after edit |
| Typecheck | `pnpm typecheck`                                                     | exit 0 (docs don't affect it; sanity only) |

`docs/` is excluded from biome (`biome.jsonc` does not list it, and biome
defaults exclude `.md`), so `pnpm check`/`pnpm fix` are NOT needed for this
plan — markdown is not linted. Do not run them as a gate (they touch source
files only and would be a no-op here, but the gate's pre-existing exit-1
status is unrelated — see plan 006).

## Scope

**In scope** (the only file you should modify):
- `docs/how-the-chatbot-works.md`

**Out of scope** (do NOT touch):
- Any other doc — `docs/setup-and-deploy.md`, `README.md`, `AGENTS.md`. Those
  have separate findings (README env vars, AGENTS.md thinness) tracked
  elsewhere; do not fix them in this plan.
- The actual `components/chat/message/*` source — the split is already done.
- Do NOT rewrite the "Message Rendering" or "Adding A New Tool" sections
  wholesale. Only the three cited lines change — keep the surrounding prose
  intact.

## Git workflow

- Branch: `advisor/004-fix-stale-message-docs`
- Commit message style (match `git log`, e.g. `Fix streamdown styles`): short
  imperative, capitalized — e.g. `Point docs at new message component path`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Fix line 41 (file table)

Change the table row from:
```
| `components/chat/message.tsx` | Renders eve messages, markdown, reasoning, tools, and input requests. |
```
to:
```
| `components/chat/message/index.tsx` | Renders eve messages, markdown, reasoning, tools, and input requests (split across `components/chat/message/`). |
```

The trailing parenthetical helps a reader who greps for "where is tool UI"
know the directory is a module.

**Verify**: `rg -n "components/chat/message\.tsx" docs/how-the-chatbot-works.md`
→ line 41 should no longer match (lines 714 and 831 still will; that's fine
for this step).

### Step 2: Fix line 714 (Message Rendering section)

Change:
```
data through `components/chat/message.tsx`.
```
to:
```
data through `components/chat/message/index.tsx`.
```

**Verify**: `rg -n "components/chat/message\.tsx" docs/how-the-chatbot-works.md`
→ only line 831 should still match.

### Step 3: Fix line 831 (Adding A New Tool recipe, step 5)

Change:
```
5. If the UI should render a special tool state, update
   `components/chat/message.tsx`.
```
to:
```
5. If the UI should render a special tool state, update the relevant file in
   `components/chat/message/`: `tool-parts.tsx` for tool status icon, name
   label, payload, and input-request actions; `tool-group.tsx` for how tool
   calls are grouped into rows.
```

**Verify**:
- `rg -n "components/chat/message\.tsx" docs/how-the-chatbot-works.md` → zero
  matches.
- `rg -n "components/chat/message/" docs/how-the-chatbot-works.md` → shows
  the three updated references (lines ~41, ~714, ~831) plus any pre-existing
  `components/chat/message/` references elsewhere (do not worry about those;
  they were not in scope and should be unchanged).

## Test plan

This is a docs-only change. Verification:

1. `rg -n "components/chat/message\.tsx" docs/` → zero matches (the stale
   path is fully removed from docs).
2. `rg -n "components/chat/message/" docs/how-the-chatbot-works.md` → at
   least three matches at the updated lines, naming real files that exist.
   Cross-check each named file (`tool-parts.tsx`, `tool-group.tsx`,
   `index.tsx`) actually exists: `ls components/chat/message/`.
3. (Optional) Eyeball the three updated sections in a markdown preview to
   confirm the table row formats and the recipe step reads naturally. A
   reviewer task, not a gate.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `rg -n "components/chat/message\.tsx" docs/` returns no matches
- [ ] `ls components/chat/message/tool-parts.tsx components/chat/message/tool-group.tsx components/chat/message/index.tsx` all succeed (the doc references real files)
- [ ] `git status` shows only `docs/how-the-chatbot-works.md` modified
- [ ] `plans/README.md` status row for plan 004 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `docs/how-the-chatbot-works.md` changed since
  `d1daea6`, or lines 41/714/831 don't say what the "Current state" says.
- Any of the three target files in `components/chat/message/`
  (`index.tsx`, `tool-parts.tsx`, `tool-group.tsx`) does not exist — the split
  may have been done differently than `plans/001` specified. Use
  `ls components/chat/message/` to list the real files and re-point the refs
  at the closest matches, but STOP and report what you found.
- A grep for the stale path turns up matches in OTHER docs (`README.md`,
  `docs/setup-and-deploy.md`) — those are out of scope for this plan but
  should be reported so a follow-up can fix them; do not edit those files
  here.

## Maintenance notes

- **For the reviewer**: diff is three small edits in one markdown file. The
  right review is to confirm each new path names a file that exists
  (`ls components/chat/message/`) and the prose reads naturally.
- **Future splits**: if `components/chat/message/` is split again, the file
  table at line 41 and the tool-recipe at line 831 are the two places most
  likely to drift. Worth a note in whoever owns the next split.
- Deferred out of scope: the broader `docs/how-the-chatbot-works.md` drift —
  the "Connections Menu" section says "only Notion" but the code toggles
  Linear and Sentry too, and the "Setup Readiness" section describes a
  `lib/setup.ts` subsystem that does not exist. Those are separate docs
  findings tracked elsewhere; do not fix them here.
