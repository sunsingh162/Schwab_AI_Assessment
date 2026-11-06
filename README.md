# Course Waitlist — AI-Assisted Engineering Assessment

Enrollment, dropping, and FIFO waitlist promotion for **one course offering**, built as a small
in-memory TypeScript service with a CLI. No starter project was supplied, so this follows the
brief's fallback: a minimal service with an in-memory store, no frontend and no database.

| Deliverable | Where |
|---|---|
| Runnable code | [`src/`](src/) |
| Focused automated tests | [`tests/`](tests/) (56 tests) |
| Design specification | [`DESIGN.md`](DESIGN.md) |
| AI prompt and use record, with verification evidence | [`AI_USAGE.md`](AI_USAGE.md) |
| Setup and run instructions | [below](#setup-and-run) |
| Limitations and follow-up risks | [below](#limitations-and-follow-up-risks) |

## Key assumptions

Full list in [`DESIGN.md` §1](DESIGN.md#1-assumptions).

- **Prerequisite rule:** a learner is eligible if their record shows **all** of the offering's
  prerequisite courses completed. Records can change, so eligibility is checked at decision time.
- **Ineligible learners are rejected at `enroll`.** They get no seat and do not join the waitlist.
- **Waitlist policy: skip and retain.** When a seat opens, the first *currently* eligible waiter
  is promoted. An ineligible waiter at the front is skipped but **keeps their place**, and is
  promoted ahead of later joiners once eligible again.
- **Promotion runs at the start of every `enroll`/`drop` call**, and after a seat is released.
  This is deliberate: under skip-and-retain, a seat can open while every waiter is ineligible. If
  a waiter later becomes eligible, the next call of any kind, even one that is rejected, promotes
  them before anything else happens. That keeps the invariant "no idle seat while an eligible
  learner waits" and stops a newcomer from jumping the queue. The promotion is saved and visible
  in `snapshot()`; the rejected request itself changes nothing.
- `drop` works for enrolled learners (frees a seat) and waitlisted learners (leaves the queue).

## Setup and run

Requires **Node.js 20+** (developed on Node 22). No runtime dependencies.

```bash
npm install

npm test          # run all 56 tests
npm run typecheck # strict TypeScript check (tsc --noEmit)

npm run demo      # scripted walkthrough of the main rules
npm run cli       # interactive shell: enroll <id>, drop <id>, learner <id> [courses], show, quit
```

To see each test by name: `npx vitest run --reporter=verbose`.

### Tests

| File | What it covers |
|---|---|
| [`tests/enrollment-service.test.ts`](tests/enrollment-service.test.ts) | Acceptance tests grouped by criteria AC1–AC5: capacity, full offering, duplicates, FIFO promotion, prerequisite failure and the skip-and-retain policy, invalid and repeated drops, directory failure. |
| [`tests/offering.test.ts`](tests/offering.test.ts) | Unit tests of the pure domain rules: configuration validation, promotion order, no mutation of inputs. |
| [`tests/concurrency.test.ts`](tests/concurrency.test.ts) | Concurrent requests: 50 learners racing for 5 seats, duplicate concurrent enrolls and drops, FIFO by arrival, a mixed load checked result by result, and several service instances racing on one offering. |

After every operation, the tests also check the design's invariants (no overbooking, no
duplicates, no idle seat while an eligible learner waits).

The tests were checked for their ability to fail: six deliberately planted bugs were each caught,
and disabling the lock makes all five concurrency tests fail (50 learners enrolled into 5 seats).
An independent review found two bugs, now fixed with regression tests that fail on the old code.
See [`AI_USAGE.md`](AI_USAGE.md) Entries 5–7.

## Code layout

| File | Role |
|---|---|
| [`src/offering.ts`](src/offering.ts) | Domain rules: `enroll`, `drop`, `promote`. Pure functions, no I/O. |
| [`src/enrollment-service.ts`](src/enrollment-service.ts) | Public API. Runs each call under a lock as load → check eligibility → decide → save. |
| [`src/mutex.ts`](src/mutex.ts) | Promise-chain lock; calls run one at a time in arrival order. |
| [`src/store.ts`](src/store.ts) | Async store and learner-directory interfaces, with in-memory implementations. |
| [`src/types.ts`](src/types.ts) | State and result types. Every outcome is a typed result code. |
| [`src/cli.ts`](src/cli.ts) | Demo script and interactive shell. |

## Limitations and follow-up risks

- **Single process only.** The lock is shared by every service instance in one Node process
  (keyed by store and offering), but not across processes or servers. A real deployment needs a
  database transaction with a row lock or a version check on the offering
  ([`DESIGN.md` §7](DESIGN.md#7-concurrency-and-persistence)). The service boundary would not change.
- **No persistence.** State lives in memory and is lost when the process exits.
- **Directory outages.** When a seat is open or being released, the service looks up every
  waiter's record. If one lookup fails, that request fails and nothing is saved, so one broken
  record can block drops and enrollments until the directory recovers. A full offering does not
  depend on waiters' records, so requests that cannot open a seat still work.
- **`create()` does not update an existing offering.** If the offering already exists, its stored
  capacity and prerequisites are kept and a different configuration is silently ignored.
  Changing capacity is out of scope.
- **Waiters who stay ineligible stay on the list indefinitely** (skip-and-retain). There is no
  expiry or clean-up; a long list is scanned on each promotion (fine at course scale).
- **No notifications.** A learner promoted because of someone else's request is not told; the
  change is only visible in `snapshot()`.
- **Prerequisite codes are matched exactly** (case- and whitespace-sensitive). They come from
  configuration, not user input, so they are not normalised.

## Why these layers, for one offering

The independent review asked whether this is too much structure for the brief. Each piece earns
its place:

- **Pure domain functions** keep every rule unit-testable without timing or I/O.
- **The async store** (it yields to the event loop like real I/O) is what makes the race
  condition real. Without it, the concurrency tests would pass even without a lock.
- **The mutex** is the smallest correct answer to that race with an in-memory store.
- **The CLI** is the brief's suggested prototype, so a reviewer can try the rules by hand.

## How this was built

The work was done in six reviewable steps, one commit each: scaffold → design → implementation →
tests → concurrency and CLI → review and docs. AI (Claude Code) drafted code and documents. I
directed each step, reviewed the output, ran the checks myself, and made the accept/edit/reject
decisions recorded in [`AI_USAGE.md`](AI_USAGE.md).
