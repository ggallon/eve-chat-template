# Plan 006: Repair the broken `pnpm check` lint gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first, updated 2026-07-08)**:
> `pnpm check --max-diagnostics=300 2>&1 | tail -5`
> The 2026-07-08 baseline (commit `eac0dad`) is **100 errors + 6 warnings + 6
> infos across 32 files**. If your count differs by more than a couple of
> diagnostics, re-run the full audit (Step 1) and reconcile against the
> "Drift note (2026-07-08)" section below before proceeding — do NOT trust
> the file list in the original 2026-06-27 drift-check command above this
> note or any bucket map dated before 2026-07-08; the codebase structure they
> describe (a monolithic `agent-chat.tsx`, no `lib/chat/*` module, no memory
> feature) no longer exists.

## Status

- **Priority**: P2
- **Effort**: **XL** (re-estimated 2026-07-08 — was L/60 errors at the
  2026-07-03 reconcile, now **100 errors across 32 files** after the
  `agent-chat.tsx` decomposition and the new memory feature; see "Drift note
  (2026-07-08)" below, which supersedes all earlier bucket maps)
- **Risk**: MED (Bucket C is real and touches the untested
  resume-after-refresh / chat-switch path; everything else is mechanical or
  review-only)
- **Depends on**: **005** — the test runner is the safety net for Bucket C's
  manual hook-dep rewrites. 005 is DONE.
- **Category**: dx
- **Planned at**: commit `d1daea6`, 2026-06-27; re-drifted against `ba0cd3a`
  (2026-07-01), re-confirmed unchanged against `971fd68` (2026-07-03), then
  **substantially re-drifted against `eac0dad` (2026-07-08)** — 18 commits
  landed between `971fd68` and `eac0dad` including a full decomposition of
  `app/_components/agent-chat.tsx` (2192→1175 lines, split into
  `agent-chat-shell.tsx`, `agent-chat-bootstrap-sync.tsx`,
  `agent-chat-route-sync.tsx`, `chat-shell-context.tsx`, `controller.ts`,
  `error-toast.tsx`, `composer-footer-controls.tsx`, `types.ts`), a new
  `lib/chat/*` module split (`connection.ts`, `error.ts`, `json-utils.ts`,
  `message.ts`, `session.ts`, `stream.ts` — all new files, none of which
  existed when this plan or its predecessors were written), and a new memory
  feature (`lib/memory/*`, `agent/tools/save_memory.ts`,
  `lib/db/schema/*` split from a single `lib/db/schema.ts`). **Read the
  2026-07-08 drift note below before executing; it is the only reliable
  bucket map — the 2026-07-01/07-03 notes and their line numbers describe a
  codebase structure that no longer exists.**

## Drift note (2026-07-01 re-reconciliation against `ba0cd3a`)

Re-ran `pnpm check --max-diagnostics=300` on current HEAD: **60 errors + 3
warnings + 7 infos across 20 files** (70 diagnostics total). To confirm this
isn't a between-commit drift, I checked out `d1daea6` and `1b9c9ac` in
disposable git worktrees, symlinked the current tree's `node_modules/ultracite`
and `node_modules/@biomejs/biome` (pinned `@biomejs/biome@2.5.1` +
`ultracite@7.8.3`, `biome.jsonc` unchanged, all in-scope files byte-identical
across the three commits), and ran `biome check` directly: **all three
commits yield the same 60/3/7 count.** Conclusion: the 2026-06-28 reconcile's
"18 errors / Bucket C empty / session-chat-page violations stopped firing"
narrative was wrong — most likely it ran `pnpm check` in an environment where
`ultracite/biome/{core,react,next}` didn't resolve (so biome silently linted
with a degraded rule set) and confabulated the 18 from there. The
`session-chat-page.tsx` resume-effect violations fire at `:73,:277,:308,:316`
plus `noEmptyBlockStatements` at `:139`. **Bucket C is real; Step 5 is
restored.**

The bucket map in "Current state" below is the authoritative current picture
(2026-07-01). **Step 1's "trust Step 1's `pnpm check` output over the
numbers" instruction is still correct** — re-run it at execution time and
reconcile against the list below; if the set changed substantially, STOP.

**Authoritative error set at `ba0cd3a` (70 diagnostics = 60 errors + 3 warn +
7 info), by file then rule.** Levels: `×` = error, `w` = warning, `i` = info.
"FIXABLE" means biome's unsafe-fix is available (do NOT trust it on
`useExhaustiveDependencies` — see Step 5).

```
app/_components/agent-chat.tsx  (17)
  :349    noExcessiveCognitiveComplexity          i  (complexity 24)
  :653    useTopLevelRegex                         ×
  :671    noEmptyBlockStatements                   ×  (catch {})
  :683    noExcessiveCognitiveComplexity          i  (complexity 39, AgentChatSession)
  :753    noEmptyBlockStatements                   ×  (useRef(() => {}))
  :994    noNestedTernary                          ×
  :1069   useExhaustiveDependencies        FIXABLE ×  (missing localPendingUserMessageRef.current)
  :1070   noExcessiveCognitiveComplexity          i  (complexity 35, sendMessage)
  :1349   useExhaustiveDependencies        FIXABLE ×  (missing activeChat?.events)  [×3 captures + 2 "more specific than captures"]
  :1349   useExhaustiveDependencies               ×  (more specific than captures: activeChat?.title / activeChat?.events.length / activeChat)
  :1424   noExcessiveCognitiveComplexity          i  (complexity 34)
  :1529   useExhaustiveDependencies        FIXABLE ×  (extra dep: displayError)
  :1895   noNonNullAssertion                       ×

app/_components/session-chat-page.tsx  (5)   [BUCKET C — resume effect]
  :73     useExhaustiveDependencies        FIXABLE ×  (extra dep: chatId)
  :139    noEmptyBlockStatements                   ×  (catch {})
  :205    noExcessiveCognitiveComplexity          i  (complexity 30, the resume void async IIFE)
  :277    useExhaustiveDependencies        FIXABLE ×  (extra dep: chatId)
  :308    useExhaustiveDependencies        FIXABLE ×  (extra dep: chatId)
  :316    useExhaustiveDependencies        FIXABLE ×  (extra dep: clientError)

app/_components/home-chat-page.tsx  (3)
  :61     useExhaustiveDependencies        FIXABLE ×  (extra dep: clientError)
  :65     useExhaustiveDependencies        FIXABLE ×  (extra dep: submitting)
  :138    noEmptyBlockStatements                   ×  (onStop={() => {}})

app/_components/agent-chat-shell.tsx  (5)
  :100    noDocumentCookie                         ×
  :355    noStaticElementInteractions              w
  :355    noNoninteractiveElementInteractions      w
  :355    useKeyWithClickEvents                    w
  :404    noDangerouslySetInnerHtml                 ×  [BUCKET D]

app/api/auth/[...all]/route.ts  (3)
  :16     useAwait                                  ×  (GET)
  :20     useAwait                                  ×  (POST)
  :30     noUnusedVariables                 FIXABLE ×  (redirectToAuthError)

app/layout.tsx  (1)                              [BUCKET D]
  :103    noDangerouslySetInnerHtml                 ×

components/auth/auth-display.tsx  (1)            [BUCKET D]
  :36     noDangerouslySetInnerHtml                 ×

components/auth/user-menu.tsx  (2)
  :92     noImgElement                             w
  :92     useImageSize                              ×

components/auth/sign-in-button.tsx  (1)
  :65     useOptionalChain                 FIXABLE ×

components/chat/composer.tsx  (3)
  :145    noNestedTernary                           ×
  :180    useAriaPropsSupportedByRole               ×
  :180    noNoninteractiveTabindex          FIXABLE ×

components/chat/message/index.tsx  (3)
  :127    noUnusedFunctionParameters                ×  (canRespond)
  :129    noUnusedFunctionParameters                ×  (onInputResponses)
  :141    useDefaultSwitchClause                    ×

components/chat/message/tool-group.tsx  (2)
  :49     noNonNullAssertion                        ×
  :90     noNonNullAssertion                        ×

components/chat/message/tool-status.ts  (9)  [plan 008's target module — DO NOT touch here unless 008 has landed]
  :46     useDefaultSwitchClause                    ×
  :89     useDefaultSwitchClause                    ×
  :106    noNonNullAssertion                        ×
  :153    noExcessiveCognitiveComplexity           i  (complexity 26)
  :239    useTopLevelRegex                          ×
  :250    useTopLevelRegex                          ×
  :251    useTopLevelRegex                          ×
  :255    useTopLevelRegex                          ×
  :269    useTopLevelRegex                          ×

components/chat/message/use-streaming-text.ts  (8)
  :111    noExcessiveCognitiveComplexity           i  (complexity 31)
  :122,:124,:126,:128,:133,:135,:137  noNestedTernary  ×  (7 nested-ternary diagnostics in nextStreamingText)

components/chat/sidebar.tsx  (1)
  :208    noNestedTernary                           ×

drizzle.config.ts  (1)
  :8      noNonNullAssertion                        ×

lib/auth-url.ts  (2)
  :29     useTopLevelRegex                          ×
  :39     useTopLevelRegex                          ×

lib/db/client.ts  (1)
  :3      noNamespaceImport                         ×

lib/db/queries.ts  (1)
  :70     useAtIndex                       FIXABLE ×

agent/tools/get_weather.ts  (1)
  :9      useAwait                                  ×
```

**Revised bucket map for execution (supersedes the 2026-06-28 bucket map):**

- **Bucket A — mechanical & safe (auto-fixable or trivial, no behavior risk):**
  `app/api/auth/[...all]/route.ts:16,20` (`useAwait`×2 — add `await`),
  `:30` (`noUnusedVariables` — delete dead `redirectToAuthError` after
  confirming no callers),
  `components/auth/sign-in-button.tsx:65` (`useOptionalChain`),
  `agent/tools/get_weather.ts:9` (`useAwait`),
  `lib/db/queries.ts:70` (`useAtIndex` → `.at(-1)`),
  `home-chat-page.tsx:138` + `session-chat-page.tsx:139` + `agent-chat.tsx:671`
  + `agent-chat.tsx:753` (`noEmptyBlockStatements`×4 — read each; see Step 3).
- **Bucket B — `<img>` in `components/auth/user-menu.tsx:92`** (`noImgElement`
  warn + `useImageSize` error). See Step 4.
- **Bucket C — resume-effect hook deps (HIGHEST RISK, manual judgement, 005
  safety net required):** `session-chat-page.tsx:73,277,308,316` +
  `home-chat-page.tsx:61,65` + `agent-chat.tsx:1069,1349,1529`
  (`useExhaustiveDependencies`×9, all "extra dep" or "missing dep" or "more
  specific than captures"). Plus `session-chat-page.tsx:205` and
  `agent-chat.tsx:1424` `noExcessiveCognitiveComplexity` (info-level, NOT
  errors — do NOT fix these for the gate; they're infos and don't fail
  `pnpm check`. Leave them.). See Step 5.
- **Bucket D — `noDangerouslySetInnerHtml` (REVIEW-REQUIRED, do NOT
  auto-fix):** `app/layout.tsx:103`, `components/auth/auth-display.tsx:36`,
  `app/_components/agent-chat-shell.tsx:404`. See Step 6.
- **Bucket E — a11y / style / perf (low-risk, mostly mechanical):**
  `agent-chat-shell.tsx:355`×3 (a11y warnings: `noStaticElementInteractions`,
  `noNoninteractiveElementInteractions`, `useKeyWithClickEvents`),
  `agent-chat-shell.tsx:100` (`noDocumentCookie`),
  `composer.tsx:145` (`noNestedTernary`), `:180`×2
  (`useAriaPropsSupportedByRole`, `noNoninteractiveTabindex`),
  `sidebar.tsx:208` (`noNestedTernary`),
  `use-streaming-text.ts` `noNestedTernary`×7 (the `nextStreamingText` step
  table — refactor to a lookup or if-else chain),
  `message/index.tsx:141` + `tool-status.ts:46,89` (`useDefaultSwitchClause`
  — add `default: return …` / `default: break`),
  `message/index.tsx:127,129` (`noUnusedFunctionParameters` — `canRespond`/
  `onInputResponses` unused in `AgentMessagePart`; read before removing —
  they may be props forwarded for future use, in which case prefix `_` or
  `biome-ignore` with reason),
  `tool-group.tsx:49,90` + `tool-status.ts:106` + `agent-chat.tsx:1895` +
  `drizzle.config.ts:8` (`noNonNullAssertion`×5 — replace `arr[i]!` with a
  guarded `arr[i] ?? …` or `.at(i)` with a fallback; `drizzle.config.ts:8`
  `process.env.DATABASE_URL!` → a real `throw if unset` guard or `biome-ignore`
  with reason),
  `agent-chat.tsx:653` + `lib/auth-url.ts:29,39` + `tool-status.ts:239,250,
  251,255,269` (`useTopLevelRegex`×8 — hoist regex literals to module-scope
  consts),
  `lib/db/client.ts:3` (`noNamespaceImport` — `import * as schema` → named
  imports; verify `drizzle-orm/neon-http` typing still works with named).
- **`tool-status.ts` has 9 diagnostics but is plan 008's target module.**
  If 008 has NOT landed, you may still fix these lint errors here (they're
  real), but be careful not to change exported signatures that 008's tests
  will pin. If 008 HAS landed, its tests are the safety net — run
  `pnpm test:run components/chat/message/tool-status.test.ts` after each
  change to that file.

**Everything above this line (the 2026-07-01/07-03 bucket map, "Current
state" list, and file scope list further down) describes a codebase
structure that no longer exists as of `eac0dad` — `agent-chat.tsx` was cut
from 2192 to 1175 lines and split into 8 new sibling files, and several
brand-new modules (`lib/chat/{connection,error,json-utils,message,session,
stream}.ts`, `lib/memory/*`, `lib/db/schema/*`) were added. Do NOT use the
line numbers or file list above. The section immediately below (2026-07-08)
is the only authoritative bucket map. It is kept in the plan as historical
context only, per the reconcile skill's "don't delete plan history" rule.**

## Drift note (2026-07-08 reconciliation against `eac0dad`) — SUPERSEDES ALL EARLIER BUCKET MAPS

Re-ran `pnpm check --max-diagnostics=300` on `eac0dad`: **100 errors + 6
warnings + 6 infos across 32 files** (112 diagnostics total, up from 60/3/7
across 18 files at `971fd68`). This is a real drift, not a measurement
artifact — 18 commits landed since the last reconcile, including "Refactor
the agent-chat.tsx file into several files" and "Add memory tool feature".
Confirmed via `git diff --stat 971fd68..eac0dad -- app/ components/ lib/
agent/`: 98 files changed, +7628/−3281 lines.

**Authoritative error set at `eac0dad`, by file then line.** `E` = error
(blocks `pnpm check`), `W` = warning, `i` = info (does NOT block the exit
code — informational only, same as the historical
`noExcessiveCognitiveComplexity` items). `FIX` = biome unsafe-fix available
(do NOT trust it blindly on `useExhaustiveDependencies`, per Step 2/5 below).

```
app/_components/agent-chat.tsx  (21)
  :85     noExcessiveCognitiveComplexity            i
  :155    noEmptyBlockStatements                    E
  :192    noShadow                                  E
  :289    noShadow                                  E
  :315    noShadow                                  E
  :396    noNestedTernary                            E
  :471    useExhaustiveDependencies          FIX     E  (missing dep: localPendingUserMessageRef.current, in sendMessage's useCallback)
  :472    noExcessiveCognitiveComplexity            i
  :531    noShadow                                  E
  :540    noShadow                                  E
  :649    noShadow                                  E
  :751    useExhaustiveDependencies                 E  ×6 sub-diagnostics — the chat-switch/resume effect (successor to the historical
                                                         Bucket C effect that lived at :1349 before the refactor). Diagnostics:
                                                         "more specific than captures: activeChat?.title", "more specific than
                                                         captures: activeChat?.events.length", "missing dep: activeChat?.events" (FIX),
                                                         "missing dep: activeChat.events" (FIX), "more specific than captures:
                                                         activeChat?.events.length" (dup w/ different capture site), "missing dep:
                                                         activeChat" (FIX). Effect body starts `const nextChatId = activeChat?.id ??
                                                         chatId ?? null;` — reads activeChat.title/events in multiple branches, dep
                                                         array only lists activeChat?.events.length/id/title + 4 others.
  :826    noExcessiveCognitiveComplexity            i
  :931    useExhaustiveDependencies          FIX     E  (extra dep: displayError)
  :982    noJsxPropsBind                             E
  :1074   noJsxPropsBind                             E

app/_components/agent-chat-shell.tsx  (14)  [NEW FILE — did not exist at 971fd68]
  :102    noDocumentCookie                           E  (document.cookie = ... for sidebar-open persistence)
  :290    noJsxPropsBind                             E
  :291    noJsxPropsBind                             E
  :297    noJsxPropsBind                             E
  :300    noJsxPropsBind                             E
  :307    noLeakedRender                              E
  :331    noJsxPropsBind                             E
  :342    noJsxPropsBind                             E
  :357    useKeyWithClickEvents                       W
  :364    noJsxPropsBind                             E
  :365    useSemanticElements                         E  (role="button" on a div — suggests <button>)
  :381    noJsxPropsBind                             E
  :389    noJsxPropsBind                             E
  :408    noDangerouslySetInnerHtml                   W  [BUCKET D] — <script> reading document.cookie via a regex built from a
                                                          static template literal (SIDEBAR_COOKIE_NAME is a module const, no user
                                                          input interpolated) to set a dataset attribute before hydration.

app/_components/session-chat-page.tsx  (6)   [BUCKET C — resume/chat-switch effect, successor to the file audited at d1daea6/ba0cd3a]
  :65     useExhaustiveDependencies          FIX     E  (extra dep: chatId)
  :131    noEmptyBlockStatements                    E  (catch {})
  :197    noExcessiveCognitiveComplexity            i  (the resume-driving async IIFE, successor to the old :205)
  :269    useExhaustiveDependencies          FIX     E  (extra dep: chatId; dep array also lists controllerReady,
                                                          controllerStatus.isBusy, controllerStatus.isDisabled, isLoadingChat,
                                                          pendingUserMessage)
  :308    useExhaustiveDependencies          FIX     E  (extra dep: clientError)
  :397    noJsxPropsBind                             E  (onDismiss={() => setDismissedError(toastError)})

app/_components/home-chat-page.tsx  (5)
  :53     useExhaustiveDependencies          FIX     E  (extra dep: clientError)
  :57     useExhaustiveDependencies          FIX     E  (extra dep: submitting)
  :116    noJsxPropsBind                             E
  :130    noEmptyBlockStatements                    E  (onStop={() => {}})
  :130    noJsxPropsBind                             E  (same line, second diagnostic)

app/api/auth/[...all]/route.ts  (3)
  :16     useAwait                                   E  (GET)
  :20     useAwait                                   E  (POST)
  :30     noUnusedVariables                  FIX     E  (redirectToAuthError — re-verify still dead before deleting)

app/layout.tsx  (1)                              [BUCKET D]
  :102    noDangerouslySetInnerHtml                   W  (theme-init script, static)

components/auth/auth-display.tsx  (1)            [BUCKET D]
  :36     noDangerouslySetInnerHtml                   W  (auth-display-init script, static)

components/auth/sign-in-button.tsx  (2)
  :33     noJsxPropsBind                             E
  :65     useOptionalChain                   FIX     E

components/auth/user-menu.tsx  (2)
  :99     noImgElement                                W
  :99     useImageSize                                E  (same <img>, moved from :92 to :99 — same finding as before)

components/chat/composer.tsx  (4)
  :123    noJsxPropsBind                             E
  :145    noNestedTernary                            E
  :181    useAriaPropsSupportedByRole                E
  :181    noNoninteractiveTabindex           FIX     E

components/chat/integrations-menu.tsx  (1)
  :65     noJsxPropsBind                             E

components/chat/markdown.tsx  (1)
  :139    noShadow                                   E  (Markdown function shadows const Markdown)

components/chat/message/index.tsx  (2)
  :125    noUnusedFunctionParameters                 E  (canRespond)
  :127    noUnusedFunctionParameters                 E  (onInputResponses)

components/chat/message/tool-group.tsx  (2)
  :49     noNonNullAssertion                         E
  :90     noNonNullAssertion                         E

components/chat/message/tool-parts.tsx  (4)
  :133    noJsxPropsBind                             E
  :154    noJsxPropsBind                             E
  :155    noJsxPropsBind                             E
  :166    noJsxPropsBind                             E

components/chat/message/tool-status.ts  (11)  [plan 008's target module — same caveat as before applies]
  :47     noUnnecessaryConditions                    E  (case "output-available" in getToolStatus's switch)
  :49     noUnnecessaryConditions                    E  (case "output-denied")
  :51     noUnnecessaryConditions                    E  (case "output-error")
  :90     useDefaultSwitchClause                     E
  :107    noNonNullAssertion                         E
  :154    noExcessiveCognitiveComplexity             i
  :240    useTopLevelRegex                           E
  :251    useTopLevelRegex                           E
  :252    useTopLevelRegex                           E
  :256    useTopLevelRegex                           E
  :270    useTopLevelRegex                           E
  NOTE: getToolStatus's switch was refactored between 971fd68 and eac0dad —
  the explicit "input-streaming"/"input-available"/"approval-requested"/
  "approval-responded" cases were commented out and replaced with a
  `default: return "running"` (source at lines 45-60; the 4 states are still
  commented above the default, not deleted). Functionally equivalent for
  every EveDynamicToolPart.state value, which is presumably why biome now
  calls the 3 remaining explicit cases (output-available/denied/error)
  "unreachable" — verify this at Step 1 by reading the current function
  before fixing; if the switch's behavior actually changed (not just its
  shape), STOP and report instead of "fixing" a real bug as a lint error.

components/chat/message/use-streaming-text.ts  (1)
  :24     useDestructuring                            E

components/chat/sidebar.tsx  (7)
  :98     noJsxPropsBind                             E
  :124    noJsxPropsBind                             E
  :151    noJsxPropsBind                             E
  :175    noJsxPropsBind                             E
  :199    noJsxPropsBind                             E
  :212    noNestedTernary                            E
  :242    noJsxPropsBind                             E

drizzle.config.ts  (1)
  :8      noNonNullAssertion                         E

lib/auth-url.ts  (3)
  :29     useTopLevelRegex                           E
  :39     useTopLevelRegex                           E
  :40     noEmptyBlockStatements                     E  (catch {})

lib/chat/connection.ts  (1)  [NEW FILE]
  :83     noUnnecessaryConditions                    E  (challenge?.instructions ?? event.data.description ?? ... — biome says the
                                                          right-hand fallback after `??` is unreachable; read before "fixing", the
                                                          nullish-chain intent may be real defense-in-depth)

lib/chat/error.ts  (1)  [NEW FILE]
  :13     noEmptyBlockStatements                     E  (catch {})

lib/chat/events.ts  (1)
  :32     noNonNullAssertion                         E

lib/chat/json-utils.ts  (3)  [NEW FILE]
  :22     noUnnecessaryConditions                    E  (while (true))
  :23     noAwaitInLoops                              E  (NDJSON stream reader loop — legitimate sequential read, likely a
                                                          biome-ignore candidate rather than a rewrite)
  :59     noEmptyBlockStatements                     E  (reader.cancel().catch(() => {}) — has an explanatory comment above it
                                                          already; likely a biome-ignore candidate)

lib/chat/session.ts  (1)  [NEW FILE]
  :263    useDestructuring                            E

lib/chat/stream.ts  (5)  [NEW FILE]
  :30     useTopLevelRegex                           E
  :54     noAwaitInLoops                              E  (retry-loop fetch — likely a biome-ignore candidate, same reasoning as
                                                          json-utils.ts:23)
  :66     useDestructuring                            E
  :117    noExcessiveCognitiveComplexity              i
  :139    noAwaitInLoops                              E  (same retry-loop pattern)

lib/db/queries.ts  (1)
  :70     useAtIndex                          FIX     E

lib/db/relations.ts  (1)  [NEW FILE — see Bucket F note below]
  :2      noNamespaceImport                          W  (import * as schema from "./schema")

lib/db/schema.ts  (1)  [NEW FILE — barrel, see Bucket F note below]
  :1      noBarrelFile                                E

lib/memory/queries.ts  (2)  [NEW FILE]
  :36     noUnusedVariables                  FIX     E  (saveMemorySchema — verify dead before deleting; it may be intended for a
                                                          future validation call)
  :182    noAwaitInLoops                              E  (sequential per-category save loop — likely intentional serialization)

agent/tools/get_weather.ts  (1)
  :9      useAwait                                    E

agent/tools/save_memory.ts  (1)  [NEW FILE]
  :64     noAwaitInLoops                              E  (calls saveMemory per update in a for-loop — same pattern as
                                                          lib/memory/queries.ts:182)
```

**Revised bucket map for execution (2026-07-08, supersedes every earlier bucket map in this file):**

- **Bucket A — mechanical & safe (auto-fixable or trivial, no behavior risk):**
  `app/api/auth/[...all]/route.ts:16,20` (`useAwait`×2), `:30`
  (`noUnusedVariables` — re-confirm `redirectToAuthError` is still dead),
  `components/auth/sign-in-button.tsx:65` (`useOptionalChain`),
  `agent/tools/get_weather.ts:9` (`useAwait`),
  `lib/db/queries.ts:70` (`useAtIndex` → `.at(-1)`),
  `lib/memory/queries.ts:36` (`noUnusedVariables` — re-confirm dead first),
  `components/chat/composer.tsx:181` (`noNoninteractiveTabindex`, FIXABLE),
  `home-chat-page.tsx:130` + `session-chat-page.tsx:131` + `agent-chat.tsx:155`
  + `lib/auth-url.ts:40` + `lib/chat/error.ts:13` (`noEmptyBlockStatements`×5
  — read each `catch {}`/empty block; most are swallowed-error patterns, see
  Step 3's guidance, now applied to 2 new `lib/chat/` files too).
- **Bucket B — `<img>` in `components/auth/user-menu.tsx:99`**
  (`noImgElement` warn + `useImageSize` error, same finding as before, new
  line number). See Step 4.
- **Bucket C — resume/chat-switch effect hook deps + cognitive complexity
  (HIGHEST RISK, manual judgement, 005 safety net required):**
  `app/_components/agent-chat.tsx:471,751(×6 sub-diagnostics),931` +
  `session-chat-page.tsx:65,269,308` + `home-chat-page.tsx:53,57`
  (`useExhaustiveDependencies`, 12 diagnostics across 3 files — this is the
  direct successor to every earlier "Bucket C"; `agent-chat.tsx:751`'s effect
  is the same chat-switch/resume logic that lived at `:1349` in the
  pre-refactor file). The `noExcessiveCognitiveComplexity` infos
  (`agent-chat.tsx:85,472,826`, `session-chat-page.tsx:197`,
  `lib/chat/stream.ts:117`, `tool-status.ts:154`) are INFO level and do NOT
  fail `pnpm check` — leave them, same rule as before. See Step 5.
- **Bucket D — `noDangerouslySetInnerHtml` (REVIEW-REQUIRED, do NOT
  auto-fix):** `app/layout.tsx:102`, `components/auth/auth-display.tsx:36`
  (both same as before), PLUS the new
  `app/_components/agent-chat-shell.tsx:408` (a `<script>` that reads
  `document.cookie` via a regex built from the static `SIDEBAR_COOKIE_NAME`
  const — no runtime/user data is interpolated into the injected HTML
  itself, only into a client-side regex; read it yourself and confirm before
  ignoring). See Step 6.
- **Bucket E — a11y / style / perf, mechanical, low-risk (the bulk of the
  count):** everything else in the table above — `noJsxPropsBind` (the
  largest single rule by count: `agent-chat.tsx`×2, `agent-chat-shell.tsx`×9,
  `home-chat-page.tsx`×2, `session-chat-page.tsx`×1, `sign-in-button.tsx`×1,
  `user-menu.tsx`×1, `composer.tsx`×1, `integrations-menu.tsx`×1,
  `tool-parts.tsx`×4, `sidebar.tsx`×6 — wrap each in `useCallback` or hoist
  to a stable reference, following the pattern already used elsewhere in the
  same file for callbacks that ARE memoized), `noShadow`×7
  (`agent-chat.tsx`×6, `markdown.tsx`×1 — rename the inner binding),
  `noNestedTernary`×3 (`agent-chat.tsx:396`, `composer.tsx:145`,
  `sidebar.tsx:212` — convert to if/else or a lookup), `useDefaultSwitchClause`
  (`tool-status.ts:90`), `noNonNullAssertion`×5 (`tool-group.tsx`×2,
  `tool-status.ts:107`, `events.ts:32`, `drizzle.config.ts:8`),
  `useTopLevelRegex`×8 (`tool-status.ts`×5, `auth-url.ts`×2, `stream.ts:30`
  — hoist to module-scope consts), `useDestructuring`×3
  (`use-streaming-text.ts:24`, `session.ts:263`, `stream.ts:66`),
  `noUnusedFunctionParameters`×2 (`message/index.tsx:125,127` — read before
  removing, may be forwarded props), `useSemanticElements` +
  `useKeyWithClickEvents` + `noLeakedRender` + `noDocumentCookie`
  (`agent-chat-shell.tsx` — a11y/cookie cluster, read each before fixing;
  `noDocumentCookie` in particular is used for sidebar-state persistence and
  the "fix" (Cookie Store API) is not universally supported, so a
  `biome-ignore` with reason may be more appropriate than a rewrite — use
  judgement, this is not a security issue).
- **Bucket F — NEW judgement-call cluster: `lib/db/schema.ts` barrel +
  `lib/db/relations.ts` namespace import.** These two diagnostics are
  linked: `lib/db/schema.ts` (`noBarrelFile`) re-exports 4 sub-modules
  (`schema/auth.ts`, `schema/chat.ts`, `schema/memory.ts`,
  `schema/profile.ts`); grep confirms it has exactly ONE consumer,
  `lib/db/relations.ts:2` (`import * as schema from "./schema"`), because
  every other call site already imports directly from the sub-modules
  (`@/lib/db/schema/auth`, `@/lib/db/schema/memory`, etc. — verify this with
  `rg "from \"@/lib/db/schema\"" --include='*.ts' --include='*.tsx'` before
  touching anything; it should return zero matches outside
  `lib/db/relations.ts` and `lib/db/schema.ts` itself). `defineRelations()`
  needs one merged object of every table across all 4 sub-modules, so simply
  swapping to named imports means importing every individual table export
  (not just a namespace) and either spreading them into one object or
  passing named imports directly — read `lib/db/relations.ts` first to see
  exactly which table names it references (`user`, `session`, `account`,
  `chat`, `userMemory`, `userProfiles`). Two acceptable outcomes: (a) rewrite
  `relations.ts` to import the specific tables by name from each
  `schema/*.ts` file and pass an object literal to `defineRelations`, then
  delete `lib/db/schema.ts` entirely (it becomes unused) — the more thorough
  fix; or (b) leave both as-is and add matched `biome-ignore` comments on
  both lines explaining `defineRelations` needs the full merged schema
  object. Prefer (a) if it's a clean 10-minute rewrite; fall back to (b) and
  report the tradeoff if the table list is large or relations.ts's typing
  gets fragile with named imports. Do NOT touch `schema/auth.ts`,
  `schema/chat.ts`, `schema/memory.ts`, or `schema/profile.ts` themselves —
  only `relations.ts` and, if outcome (a), the deletion of `schema.ts`.
- **`lib/chat/json-utils.ts:23`, `lib/chat/stream.ts:54,139`,
  `lib/memory/queries.ts:182`, `agent/tools/save_memory.ts:64`
  (`noAwaitInLoops`×5, all NEW code):** read each before deciding. Three of
  these (`json-utils.ts:23`'s NDJSON reader loop, `stream.ts:54,139`'s retry
  loop) are structurally sequential by necessity (you cannot parallelize
  "read the next chunk of a single stream" or "retry the same request N
  times") — a `biome-ignore lint/performance/noAwaitInLoops: sequential by
  design` is the right call for those three, not a `Promise.all` rewrite
  (which would change behavior). `lib/memory/queries.ts:182` and
  `agent/tools/save_memory.ts:64` save one category/update at a time in a
  loop — check whether concurrent saves would race (same user, same
  category?) before deciding between `biome-ignore` and `Promise.all`; if
  they can safely run concurrently, `Promise.all` is a real, small
  perf win; if not (e.g. they write to the same row and ordering matters),
  `biome-ignore` with a reason is correct. Do not guess — read both
  functions' bodies.
- **`lib/chat/connection.ts:83`, `lib/chat/json-utils.ts:22`
  (`noUnnecessaryConditions`×2, NEW code):** read each — `connection.ts:83`'s
  nullish-chain (`challenge?.instructions ?? event.data.description ?? ...`)
  and `json-utils.ts:22`'s `while (true)` both look like biome
  over-narrowing on runtime data whose type is wider than what TS inferred
  at that point (e.g. `event.data.description` may be typed as always
  non-nullish now but was written defensively against a runtime shape TS
  doesn't fully capture). Do NOT delete the fallback/condition without
  understanding why it was added — if removing it is correct, fine; if you're
  not sure it's dead, STOP and report rather than deleting defensive code.
- **`tool-status.ts` has 11 diagnostics but is plan 008's target module** —
  same caveat as the original note above: if 008 has landed, its tests are
  the safety net; if not, be careful not to change exported signatures.

The plan body below (Steps 1-7) is left UNEDITED from planning time; its
PROCESS is still sound (re-audit first, bucket by risk, resume-effect
manual-only, no global `pnpm fix`) but every specific file list, line
number, and bucket membership it cites is STALE. Use the 2026-07-08 bucket
map above as the source of truth for what to fix and where; use the Steps
below only for HOW to fix each bucket category and what to verify.



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

**In scope (per the 2026-07-08 drift note, NOT the ~9-file 2026-06-27
list above)**: the 32 files listed in the "Drift note (2026-07-08)"
authoritative error table — `app/_components/agent-chat.tsx`,
`app/_components/agent-chat-shell.tsx`, `app/_components/session-chat-page.tsx`,
`app/_components/home-chat-page.tsx`, `app/api/auth/[...all]/route.ts`,
`app/layout.tsx`, `components/auth/{auth-display,sign-in-button,user-menu}.tsx`,
`components/chat/{composer,integrations-menu,markdown,sidebar}.tsx`,
`components/chat/message/{index,tool-group,tool-parts,tool-status,use-streaming-text}.{ts,tsx}`,
`drizzle.config.ts`, `lib/auth-url.ts`,
`lib/chat/{connection,error,events,json-utils,session,stream}.ts`,
`lib/db/{queries,relations,schema}.ts`, `lib/memory/queries.ts`,
`agent/tools/{get_weather,save_memory}.ts`. Re-confirm the exact set at
Step 1 — only touch files that Step 1 shows have errors.

**Out of scope** (do NOT touch):
- `components/ui/**`, `lib/db/migrations/**` (biome-excluded).
- `lib/db/schema/{auth,chat,memory,profile}.ts` — the individual schema
  sub-modules. Bucket F only permits touching `lib/db/relations.ts` and,
  optionally, deleting the barrel `lib/db/schema.ts`; the sub-modules
  themselves are not in scope.
- `biome.jsonc` rule severity changes — do NOT weaken rules to clear errors.
  The only config change allowed is Step 6 (documenting the gate in
  `AGENTS.md` is out of this plan's scope; tracked elsewhere).
- Do NOT touch any file that Step 1 does NOT list as having an error. If a
  file you edit happens to have OTHER lint issues revealed after the first
  fix, fix only the originally-listed errors plus any that the SAME fix
  surfaces in the same file.
- Do NOT add `biome-ignore` comments except where Step 5/6 or the Bucket
  E/F/`noAwaitInLoops` guidance above explicitly permits it, and always with
  a one-line reason.
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
- [ ] `git status` shows only the in-scope files modified (the 32 files
      listed in the "Drift note (2026-07-08)" / Scope section, plus this
      `plans/` update) — no out-of-scope file was touched (especially NOT
      `biome.jsonc`, `components/ui/**`, `lib/db/migrations/**`,
      `lib/db/schema/{auth,chat,memory,profile}.ts`)
- [ ] No `biome-ignore` comments added except where Bucket D, F, or the
      `noAwaitInLoops`/`noUnnecessaryConditions` guidance in the 2026-07-08
      drift note explicitly permits, each with a reason line
- [ ] `plans/README.md` status row for plan 006 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check (`pnpm check --max-diagnostics=300`) shows a diagnostic
  count that differs substantially from the 2026-07-08 baseline (100 errors
  / 6 warnings / 6 infos / 32 files) — re-run Step 1 and reconcile against
  the drift note; if the set is substantially different again, the plan
  needs re-planning rather than blind execution.
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

- **For the reviewer**: the highest-scrutiny diffs are Bucket C
  (`session-chat-page.tsx`'s resume effect AND `agent-chat.tsx:751`'s
  chat-switch/title/known-events effect — both drive what the UI shows
  across a chat-ID or refresh transition) and Bucket F (`lib/db/relations.ts`
  / `lib/db/schema.ts`, only if outcome (a) was chosen — deleting a schema
  barrel touches how every table relation is wired). Read the before/after
  of each line by line. Buckets A/B/D/E are low-risk and mechanical.
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
