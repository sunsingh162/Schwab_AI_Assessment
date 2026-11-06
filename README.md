# Course Waitlist — AI-Assisted Engineering Assessment

Enrollment, dropping, and FIFO waitlist promotion for **one course offering**, built as a small
in-memory TypeScript service (no starter project was supplied, so this uses the minimal-service
fallback described in the brief).

> Work in progress. This README is completed in the final step with full run instructions and a
> limitations section.

## Repository layout

| Path | Purpose |
|---|---|
| `src/` | Service code |
| `tests/` | Automated tests (Vitest) |
| `DESIGN.md` | Design specification *(Step 2)* |
| `AI_USAGE.md` | AI prompt and use record, with verification evidence |

## Quick start

Requires Node.js 20+.

```bash
npm install
npm test        # run the test suite
npm run build   # type-check
```

## How this was built

The work was done in small, reviewable steps — one commit per step — so the history shows the
approach: scaffold → design → implementation → tests → concurrency & CLI → review and docs.
See `AI_USAGE.md` for what AI contributed at each step and how it was verified.
