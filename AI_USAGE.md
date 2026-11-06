# AI Prompt and Use Record

**Tool:** Claude Code (Anthropic), used as an agentic coding assistant inside VS Code.
**How it was used:** I (the candidate) directed the work step by step. The AI proposed plans, wrote
drafts of code and docs, and ran commands. After each step I reviewed the output before it was
committed. Each entry below records the prompt, what the AI suggested, my decision
(**accepted / edited / rejected**), the files or decisions it informed, and how it was verified.

Prompts are lightly condensed for readability. No credentials or personal data are included.

---

## Entry 1 — Requirements analysis and plan

**Activity:** Requirements analysis, task decomposition, planning.

**Prompt (condensed):**
> Read the assessment PDF. Check what it says about using AI tools to build the project. List the
> deliverables and the checklist we need to follow. Make a plan and tell me your approach.

**AI response (summary):**
- Summarised scope: one offering; enroll / drop / FIFO promotion; prerequisite rule; no frontend,
  catalog, payments, identity, database, or policy engine.
- Confirmed AI use is required (acceptance criterion 7), with conditions: record prompts, record
  accept/edit/reject decisions, verify independently, keep secrets out of prompts.
- Produced a deliverables table (code + tests, `DESIGN.md`, `AI_USAGE.md`, run instructions,
  limitations) and a test checklist mapped to acceptance criterion 6.
- Proposed a plan: assumptions and design first, then service, tests, concurrency test, CLI demo,
  review and docs.
- Proposed defaults and asked me to decide: Python + pytest; ineligible-at-front policy of
  "skip and keep their place".
- Noted that no starter project or rubric file was supplied.

**Decisions:**
| Suggestion | Decision | Notes |
|---|---|---|
| Python + pytest | **Rejected** | I chose TypeScript, which I use day to day and can review more confidently. |
| Policy: ineligible learner at the front is **skipped but keeps their place** | **Accepted** | Fairest option; no silent removal from the queue. |
| Ask the recruiter for the missing rubric before starting | **Rejected** | The rubric file could not be opened; proceeding against the PDF's acceptance criteria instead. |
| One big build, then docs | **Edited** | I required the work in separate, reviewable steps with one commit each, and my verification after every step. |
| Submit as a public GitHub repository | **Accepted** | No submission format was specified. |

**Files / decisions informed:** overall plan and step order; language choice; waitlist policy
(to be written into `DESIGN.md`).

**Verification:** I read the PDF myself and checked the AI's deliverables list and test checklist
against the "Acceptance Criteria" and "Deliverables" sections.

---

## Entry 2 — Project scaffold

**Activity:** Project setup and tooling.

**Prompt (condensed):**
> Build this in TypeScript. Split the work into small, separate steps (one concern per step) so the
> commit history shows how the problem was approached. Stop after each step and tell me exactly
> what I should check before we move on.

**AI response (summary):**
- Created `package.json` (ES modules, `test` and `build` scripts), a strict `tsconfig.json`,
  `.gitignore`, `src/` and `tests/` folders, a placeholder smoke test, a README skeleton, and this
  record.
- First installed Vitest 3. `npm audit` then reported 2 critical advisories in Vitest 3's
  `tinypool` dependency (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr).

**Decisions:**
| Suggestion | Decision | Notes |
|---|---|---|
| Vitest 3 as test runner | **Edited** | Upgraded to Vitest 5.1.0 after the audit findings; `npm audit` now reports 0 vulnerabilities. |
| Strict compiler options (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | **Accepted** | Catches capacity/queue indexing mistakes at compile time. |
| No runtime dependencies | **Accepted** | Keeps the slice minimal, as the brief asks. |

**Files informed:** `package.json`, `tsconfig.json`, `.gitignore`, `README.md`, `tests/smoke.test.ts`.

**Verification:**
- `npm test`: smoke test passes.
- `npm run build`: type-check passes with no errors.
- `npm audit`: 0 vulnerabilities.
- Candidate check: I ran `npm test` (1 passed) and `npm run build` (no errors) in my own terminal,
  and read this record to confirm Entries 1–2 match what happened.

---

## Entry 3 — Design specification

**Activity:** Design (assumptions, invariants, API, concurrency approach) before writing code.

**Prompt (condensed):**
> Step 2: write `DESIGN.md` before any code. Cover the service boundary, data and API design,
> enrollment and capacity invariants, the waitlist-promotion rule, the concurrency/persistence
> approach, and key assumptions and tradeoffs. Use the "skip and keep their place" policy. Keep it
> proportionate to one offering.

**AI response (summary):**
- Stated 8 assumptions, including: prerequisites = "all listed course codes completed";
  eligibility re-checked at promotion because records can change; ineligible learners are rejected
  at `enroll` (they never join the waitlist); `drop` also lets a waitlisted learner leave.
- Proposed a pure domain layer (`offering.ts`) plus a thin async service with a per-offering mutex
  around load → decide → save, over an async `OfferingStore` interface.
- Defined typed result codes (returned, not thrown) and 6 invariants, including I5: "no idle seat
  while an eligible learner waits".
- Identified an edge case of the skip-and-retain policy: a seat can open while every waiter is
  ineligible. Proposed running promotion on **every** operation (not only on drop) so a waiter who
  later becomes eligible gets the seat before a newcomer.

**Decisions:**
| Suggestion | Decision | Notes |
|---|---|---|
| Pure domain + async service with mutex | **Accepted** | Separating business logic from storage and locking keeps it clean and easier to test. |
| Promotion runs on every operation (I5) | **Accepted** | A waiting learner may become eligible later and should get the seat before a newcomer. |
| `drop` also removes a learner from the waitlist (A7) | **Accepted** | Otherwise a learner would remain waiting even after asking to leave. |
| Return result codes instead of throwing | **Accepted** | Callers can handle each outcome clearly without relying on exceptions. |
| AI self-review fixes (three issues below) | **Accepted** | Reviewed the edited sections. |

**AI self-review (second prompt):**
> Review `DESIGN.md` critically as a reviewer would. Look for contradictions, gaps, and anything
> that would be ambiguous when writing the code. Fix what you find and list the changes.

The AI found three issues in its own first draft and edited `DESIGN.md`:
| Issue found | Change made |
|---|---|
| §6 said promotion runs on "every operation", but I6 said rejected requests change nothing. Contradictory when a waiter has become eligible and the next call is rejected. | Promotion now explicitly runs at the start of every `enroll`/`drop` call and after a successful drop. I6 reworded: a rejected request makes no change *of its own*; the start-of-call promotion is the one stated exception. |
| The domain was described as pure and synchronous, but eligibility comes from an async directory. The draft didn't say how the two connect. | §2: the service looks up eligibility for the requester and all waiters first, then passes the domain a synchronous `isEligible`. A failed lookup fails the operation with nothing saved. |
| Undefined result when a waitlisted learner calls `enroll` after becoming eligible while a seat is open. | §6: start-of-call promotion seats them and the call returns `ALREADY_ENROLLED`. Stated so it gets a test. |

**Process change:** from this step on, I commit and push each step myself after reviewing it.

**Files informed:** `DESIGN.md`.

**Verification:**
- AI self-review: three issues found and fixed (table above).
- Candidate check: I read `DESIGN.md` in full, focusing on the assumptions (A4, A5, A7), the
  service boundary, the promotion rule and its example, the API results table, and the tradeoffs,
  and decided each design choice above. No code exists yet; these rules become test cases in Step 4.

---

## Entry 4 — Core service implementation

**Activity:** Code generation from the accepted design.

**Prompt (condensed):**
> Step 3: implement the core service exactly as `DESIGN.md` specifies. Pure, synchronous domain
> functions for enroll, drop, and promotion; a thin async service that serialises calls with a
> per-offering mutex and saves only on change; in-memory store and learner directory behind async
> interfaces. Typed result codes, no thrown business errors. No tests yet (Step 4), but show a
> manual run of the main flows.

**AI response (summary):**
- `src/types.ts`: state, eligibility, and result types as TypeScript discriminated unions.
- `src/offering.ts`: `createOfferingState`, `normalizeLearnerId`, `promote`, `enroll`, `drop`.
  Pure functions; input state is never mutated; each returns `{ result, state, changed }`.
- `src/mutex.ts`: promise-chain mutex; a failed task does not block later ones.
- `src/store.ts`: `OfferingStore` and `LearnerDirectory` interfaces with in-memory
  implementations. Both yield to the event loop (`setImmediate`) like real I/O and return deep
  copies.
- `src/enrollment-service.ts`: `create`, `enroll`, `drop`, `snapshot`. Each call runs under the
  mutex as load → prefetch eligibility → domain → save-if-changed.
- Small choices made while coding, beyond what `DESIGN.md` states:
  - `enroll`/`drop` accept `unknown` so non-string IDs from untrusted callers become
    `INVALID_REQUEST` instead of a crash.
  - `DROPPED.promoted` lists everyone promoted during the call, including any start-of-call promotion.
  - Duplicate prerequisite codes in the configuration are de-duplicated.
  - The lock lives on the service instance, so the code assumes one instance per offering
    (stated in a code comment; to be listed under limitations).

**Decisions:**
| Suggestion | Decision | Notes |
|---|---|---|
| Implementation as described | **Accepted** | `promote` matches the skip-and-keep policy: it scans the waitlist in FIFO order, promotes eligible learners until seats are filled, and skips ineligible learners without removing them. Their relative order is preserved, so they can still get a seat when they become eligible later. |
| a. Non-string IDs return `INVALID_REQUEST` | **Accepted** | Handled safely by `normalizeLearnerId` instead of crashing. |
| b. `DROPPED.promoted` lists all promotions in the call | **Accepted** | Includes promotions both before and after the seat is released. |
| c. Duplicate prerequisite codes de-duplicated | **Accepted** | Done with a `Set`; avoids redundant checks. |
| d. One service instance per offering | **Accepted, with follow-up** | Reasonable because the mutex is instance-level. Must be stated explicitly in `README.md` limitations (Step 6). |

**Files informed:** `src/types.ts`, `src/offering.ts`, `src/mutex.ts`, `src/store.ts`,
`src/enrollment-service.ts`, `src/index.ts`.

**Verification:**
- `npm run build`: type-check passes under strict settings.
- Manual walkthrough (capacity 2, prerequisite CS101), output checked line by line against `DESIGN.md`:
  ```
  enroll alice               ENROLLED                                 enrolled=alice
  enroll alice again         ALREADY_ENROLLED                         enrolled=alice
  enroll cara (no prereq)    PREREQUISITE_NOT_MET missing=[CS101]     enrolled=alice
  enroll bob                 ENROLLED                                 enrolled=alice,bob
  enroll dan (full)          WAITLISTED position=1                    waitlist=dan
  enroll eve (full)          WAITLISTED position=2                    waitlist=dan,eve
  -- dan's record loses CS101 --
  drop alice                 DROPPED promoted=[eve]                   enrolled=bob,eve  waitlist=dan
  drop alice again           NOT_ENROLLED                             (unchanged)
  drop "   "                 INVALID_REQUEST                          (unchanged)
  enroll ghost               LEARNER_NOT_FOUND                        (unchanged)
  -- dan's record regains CS101 --
  drop bob                   DROPPED promoted=[dan]                   enrolled=eve,dan  waitlist=
  ```
  Dan was skipped while ineligible but kept their place, then was promoted when eligible (policy A5).
- The AI's first walkthrough attempt failed for a tooling reason (`tsx -e` does not support
  top-level `await`). It was re-run inside an async function, with no code change.
- Candidate check: I read `src/offering.ts`, comparing `promote` against the pseudocode in
  `DESIGN.md` §6, and ran `npm run build` myself (no errors). Decided each choice above.

---

## Entry 5 — Automated tests

**Activity:** Test design and generation; test-quality check with deliberately planted bugs.

**Prompt (condensed):**
> Step 4: write focused tests for every item in acceptance criterion 6 (available capacity, full
> capacity, duplicate requests, FIFO promotion, prerequisite failure, invalid and repeated drops),
> grouped by acceptance criterion. Cover the edge cases `DESIGN.md` calls out for the
> skip-and-retain policy. Check the §5 invariants after every operation, not only the return
> values. Then prove the tests can fail: plant realistic bugs one at a time and confirm each is
> caught. (The concurrency test is Step 5.)

**AI response (summary):**
- `tests/helpers.ts`: `setup()` builds a service with an in-memory directory whose records tests
  can change. `expectInvariants()` asserts I1 (capacity), I2 (no duplicates), and I5 (no idle
  seat while an eligible learner waits) against a snapshot. It runs inside tests and again
  automatically after every service test.
- `tests/enrollment-service.test.ts`: 30 acceptance tests grouped AC1–AC5.
- `tests/offering.test.ts`: 12 unit tests for the pure domain: configuration validation,
  `promote` order, and purity (inputs are deep-frozen, so any mutation throws).
- Removed the Step 1 placeholder test.

**Coverage map (acceptance criterion 6 → tests):**
| Required by brief | Tests |
|---|---|
| Available capacity | AC1 (2 tests) |
| Full capacity | AC2 "waitlists an eligible learner when full…"; AC4 "also rejects an ineligible learner when the offering is full" |
| Duplicate requests | AC2 enrolled/waitlisted duplicates, including a whitespace-padded ID |
| FIFO promotion | AC3 (4 tests); `promote` unit tests |
| Prerequisite failure | AC4 (10 tests), covering both sides of the skip-and-retain policy |
| Invalid or repeated drops | AC5 repeated drop, never-enrolled drop, 6 kinds of invalid ID, directory failure |

**Decisions:**
| Suggestion | Decision | Notes |
|---|---|---|
| Tests as described | **Accepted** | Reviewed the two key skip-and-retain tests. (1) "skips a waiter who became ineligible…": l2 becomes ineligible, l3 is promoted when l1 drops, and l2 stays at the front, so both the skip and the retained position are tested. (2) "gives an open seat to a waiter who became eligible before a newcomer": l2 becomes eligible again and is promoted during the newcomer's enroll call, and the newcomer is waitlisted, proving promotion runs before a new enrollment is handled. |
| Planting bugs to check the tests can fail | **Accepted** | Repeated it myself with a bug of my own (below). |

**Files informed:** `tests/helpers.ts`, `tests/enrollment-service.test.ts`, `tests/offering.test.ts`.

**Verification:**
- `npm test`: 42 passed (2 files). `npm run build`: no type errors.
- All 42 passed on the first run, so passing alone did not prove much. Six realistic bugs were
  planted in `src/offering.ts` one at a time, the suite was run, and the file was restored with
  `git checkout`:

  | Planted bug | Result |
  |---|---|
  | 1. `promote` ignores eligibility | caught: 5 failed |
  | 2. Skip-and-**remove** instead of skip-and-retain | caught: 3 failed |
  | 3. No duplicate-waitlist check | caught: 3 failed |
  | 4. No promotion after a drop | caught: 4 failed |
  | 5. No start-of-call promotion in `enroll` | caught: 2 failed |
  | 6. Capacity off-by-one (`<=` instead of `<`) | caught: 18 failed |

  After restoring: 42 passed; `git status` shows `src/` unchanged.
- The AI tidied one of its own drafts before running: a test used a dynamic `import()` where a
  normal import was correct.
- Candidate check:
  - Ran `npx vitest run --reporter=verbose` myself: 42 passed, grouped AC1–AC5.
  - Read the AC4 skip-and-retain tests and confirmed they test what their names say (see Decisions).
  - Planted my own bug: commented out `remaining.push(learnerId)` in `promote`, which silently drops
    skipped waiters from the queue. Tests failed as expected. Restored the line; 42 passed again.
    (The AI reproduced the same edit afterwards for the record: 6 failed, 36 passed; restored,
    42 passed, `src/` unchanged.)

---

## Entry 6 — Concurrency test and command-line demo

**Activity:** Concurrency testing (with proof the test detects races), CLI prototype.

**Prompt (condensed):**
> Step 5: add a focused concurrency test that fires many requests at once and proves the mutex
> prevents overbooking, duplicate records, and double promotion. Then temporarily disable the lock
> and show the same tests fail, so we know they detect the race. Also add a small CLI: a scripted
> demo of the main rules and an interactive shell a reviewer can try. No frontend.

**AI response (summary):**
- `tests/concurrency.test.ts`, 5 tests using `Promise.all`:
  - 50 learners race for 5 seats: exactly 5 `ENROLLED`, 45 `WAITLISTED`, positions 1–45 each issued once.
  - Concurrent calls are served in arrival order, so the waitlist is FIFO by call order.
  - Same learner sends 10 concurrent enrolls: 1 record.
  - Same drop sent 10 times concurrently: 1 `DROPPED`, 1 promotion.
  - Mixed concurrent enrolls and drops: every learner accounted for; invariants hold.
- `src/cli.ts` with `npm run demo` (scripted walkthrough) and `npm run cli` (interactive:
  `enroll`, `drop`, `learner <id> [courses]`, `show`, `help`, `quit`).

**Decisions:**
| Suggestion | Decision | Notes |
|---|---|---|
| Concurrency tests as described | **Accepted** | Based on my own lock-disabled run (see Verification). |
| CLI demo and interactive shell | **Accepted** | Based on running both myself (see Verification). |

**Files informed:** `tests/concurrency.test.ts`, `src/cli.ts`, `package.json` (`demo`, `cli` scripts).

**Verification:**
- With the lock: 5/5 concurrency tests pass; full suite 47 passed; type-check clean.
- **Lock disabled** (`src/mutex.ts` changed to run each task immediately, then restored with
  `git checkout`): **all 5 concurrency tests fail**. Key failures:
  ```
  expected [ { status: 'ENROLLED' }, …(49) ] to have a length of 5 but got 50   ← 50 enrolled in 5 seats
  expected [ { status: 'ENROLLED' }, …(9) ] to have a length of 1 but got 10    ← duplicate records
  expected [ { status: 'DROPPED', …(1) }, …(9) ] to deeply equal [ …one… ]       ← double drop
  ```
  After restoring: 47 passed, `src/` unchanged. This shows the async store really does interleave
  operations, and that the mutex is what prevents it.
- **AI bug found in its own CLI and fixed:** the first interactive version used `rl.question()`,
  which crashed with `ERR_USE_AFTER_CLOSE` when commands were piped in (buffered lines were lost).
  Rewritten to iterate input lines with `for await`; re-tested with piped commands, including an
  unknown command and a repeated drop, and `quit` stops input processing.
- `npm run demo` output matches the Step 3 walkthrough and `DESIGN.md`.
- Candidate check:
  - Ran `npm test` myself: 3 files, 47 passed.
  - Disabled the lock myself (`const run = task();` in `src/mutex.ts`) and ran the concurrency
    tests: all 5 failed. Reverted the line: all tests passed again.
  - Ran `npm run demo` and read the output: skip-and-retain behaves as designed (dan skipped while
    ineligible, kept first place, promoted after regaining CS101).
  - Ran `npm run cli` interactively: `enroll slice` (a typo) correctly returned `LEARNER_NOT_FOUND`
    with no state change; cara was rejected for a missing prerequisite, enrolled after
    `learner cara CS101`; dropping a non-enrolled learner returned `NOT_ENROLLED`; `show` and
    `quit` worked.

---

## Entry 7 — Independent review, fixes, and final documentation

**Activity:** Code review by a separate AI reviewer, bug fixing, regression tests, documentation.

**Prompt to the reviewer (condensed):**
> You are a skeptical senior reviewer. Read-only. Here is the brief and its acceptance criteria.
> Read `DESIGN.md`, `src/`, and `tests/`, and run the tests and type-check. Find correctness bugs
> (overbooking, duplicates, broken FIFO, promoting an ineligible learner, state corrupted by a
> rejected or failed request), with a script that reproduces each one. Also find code/design
> mismatches, missing tests, over-engineering, and limitations worth stating. No praise.

The reviewer was a fresh AI agent that saw the brief and the code, but none of the earlier
conversation, so its review was not anchored on the original author's reasoning.

**Reviewer findings and decisions:**
| # | Finding | AI recommendation | My decision |
|---|---|---|---|
| 1 | **Bug:** the lock belonged to each service instance, not to the offering. Two instances on one store both returned `ENROLLED` for 1 seat; one learner silently had no seat. `DESIGN.md` said "per-offering". | Share one lock per offering; add a two-instance test. | **Accepted.** The mutex is instance-level, so two services can race on the same store and overbook. Use a shared lock keyed by offering ID and add a two-instance concurrency test. |
| 2 | **Misleading result:** a waiter who dropped at a moment when a promotion pass would seat them got `DROPPED, promoted: [self]`. | Remove the waiter before the promotion pass. | **Edited:** handle waitlist removal before promotion, **but only after validating the ID**, so a waiter is never promoted and then given a confusing result. |
| 3 | Every request looked up every waiter, even when full; one failing waiter lookup blocked everything. | Skip waiter lookups when no seat can open; document the rest. | **Accepted.** Avoid prefetching waiter eligibility when no seat is open. Document that a directory outage during promotion can block operations that need eligibility checks. |
| 4 | `create()` silently ignores a different config for an existing offering. | Document only. | **Accepted.** Document that `create()` does not update an existing offering's capacity or prerequisites. |
| 5 | A rejected request can still save a pending promotion. | Keep; explain in README. | **Accepted.** Keep start-of-call promotions even when the request is rejected. Explain it in the README as deliberate, invariant-preserving behaviour. |
| 6 | Test gaps (two instances, waiter drop, lookup failure during drop, unknown waiter, ineligible waiter leaving, exact order in the mixed concurrency test, combined promotions). | Add them. | **Accepted.** They cover meaningful edge cases, especially directory failures and ordering under concurrency. |
| 7 | A lot of layers for one offering. | Keep; justify in README. | **Accepted.** Keep the layers: the async store and service boundary make the concurrency behaviour realistic and testable. |
| 8 | Nits: I3 wording, `build` is only a type-check, prerequisite codes not trimmed. | Fix wording, rename script, skip trimming. | **Accepted.** Clarify I3, rename `build` to `typecheck`, and leave prerequisite trimming out of scope because codes are configuration data. |

**Before fixing, the AI reproduced findings 1 and 2 itself** rather than trusting the report:
```
F1 two instances, capacity 1:  [{"status":"ENROLLED"},{"status":"ENROLLED"}]  enrolled: ['b']
F2 waiter drops:               {"status":"DROPPED","promoted":["b"]}            state: enrolled [], waitlist []
```

**Changes made:**
- `src/enrollment-service.ts`: the mutex now comes from a registry keyed by store and offering ID,
  shared by all instances; `create()` runs under that lock (this also closes a race between two
  concurrent `create()` calls). Waiter eligibility is fetched only when a seat is open or the call
  is a drop releasing a seat. `drop` no longer looks up the requester's own record.
- `src/offering.ts`: `drop` validates the ID, then removes a waitlisted requester **before** the
  promotion pass (finding 2, with my edit).
- `src/store.ts`: `removeLearner()` on the in-memory directory, for the unknown-waiter test.
- `package.json`: `build` renamed to `typecheck`. (Earlier entries mention `npm run build`; that is
  the same command under its old name.)
- `tests/`: 9 new tests (8 edge cases in `enrollment-service.test.ts`, the two-instance race in
  `concurrency.test.ts`), and the mixed concurrency test now asserts every result and the exact
  final order.
- `DESIGN.md`: §2 lookup rule, I3 wording, §6 drop ordering and its consequence, §7 shared lock,
  §8 tradeoff row. `README.md`: completed, with a limitations section and the scope justification.

**Mistakes the AI made during this step, caught by the tests or by itself:**
- **Its first fix for finding 3 was wrong.** It treated "the requester holds a seat" as "a seat may
  open", which is only true for `drop`. The new test *"does not need waiters' records while the
  offering is full"* failed (`lookup failed for l2` on `enroll("l1")`). Fixed by passing whether
  the operation releases a seat.
- **Its own earlier test had a wrong comment.** The mixed concurrency test said `drop("l5")` makes
  l5 leave the waitlist, but l5 has already been promoted by then, so it is a normal drop. The
  count-only assertion passed by coincidence, which is exactly the weakness the reviewer flagged.
  Now every result and the exact final order are asserted.

**Verification:**
- `npm test`: 56 passed (3 files). `npm run typecheck`: clean.
- **Regression tests fail on the old code** (each fix temporarily reverted, then restored):
  ```
  old per-instance lock → "shares one lock across service instances": 4 ENROLLED for 1 seat (1 failed)
  old drop() from commit 505e5ac → both LEFT_WAITLIST tests fail: got DROPPED (2 failed)
  restored → 56 passed
  ```
- A clean copy (no `node_modules`) was set up with `npm ci` to check the README instructions:
  56 passed, type-check clean, demo runs, `npm audit` 0 vulnerabilities.
- Candidate check:
  - Ran `npm test` (56 passed) and `npm run typecheck` (no errors) myself.
  - Reverted the shared lock myself (`this.mutex = new Mutex();`): the two-instance test failed as
    expected. Restored the line; all tests passed.
  - Read `README.md` end to end. The limitations section honestly covers the single-process lock
    boundary, directory outage risk, `create()` configuration behaviour, indefinite waiters, and
    lack of notifications; the architecture section explains why the layers are needed despite
    the small scope. No changes needed.
  - Read this entry. The decision table accurately records my decisions on all eight findings,
    including my edit to finding 2, and matches our discussion. The AI's implementation and
    verification claims above are its own and are backed by the evidence shown and by my two
    runs; my confirmation here covers the decision record.
