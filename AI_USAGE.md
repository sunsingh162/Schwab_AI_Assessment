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
