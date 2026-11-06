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
> Use TypeScript. Do the project in separate parts, one at a time, so the approach is clear. After
> each step, tell me what to verify.

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
