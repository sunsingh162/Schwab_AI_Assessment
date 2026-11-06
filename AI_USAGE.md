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
