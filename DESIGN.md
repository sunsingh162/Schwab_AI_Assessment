# Design Specification — Course Waitlist

Scope: enrollment, drop, and FIFO waitlist promotion for **one course offering**. No starter project
was supplied, so this is the brief's fallback: a small TypeScript service with an in-memory store.
Out of scope: frontend, catalog, payments, identity, multi-term, deployment, database, policy engine.

## 1. Assumptions

| # | Assumption |
|---|---|
| A1 | **Prerequisite rule:** the offering lists zero or more prerequisite course codes. A learner is *eligible* if their record shows **all** of them completed. |
| A2 | Learner records (completed courses) are owned by another system and read through a `LearnerDirectory` interface. They **can change** while a learner waits, so eligibility is evaluated when a decision is made, not cached. |
| A3 | A learner not found in the directory is rejected (`LEARNER_NOT_FOUND`); they are never added to the offering. |
| A4 | An **ineligible** learner who calls `enroll` is rejected outright. They do not get a seat and do not join the waitlist. Only eligible learners join the waitlist. |
| A5 | **Waitlist policy — skip and retain.** When a seat opens, the waitlist is scanned in FIFO order and the first learner who is *currently* eligible is promoted. An ineligible learner at the front is **skipped but keeps their place**. If they become eligible later, they are promoted ahead of anyone who joined after them. |
| A6 | Capacity is a fixed positive integer for the offering. The waitlist has no length limit. |
| A7 | `drop` applies to enrolled **and** waitlisted learners (leaving the waitlist is a drop). Dropping someone who is in neither list returns `NOT_ENROLLED` and changes nothing; this covers repeated drops. |
| A8 | Learner IDs are opaque, non-empty strings (after trimming). Anything else is `INVALID_REQUEST`. |

## 2. Service boundary

```
 caller (tests / CLI)
        │  enroll(learnerId)  drop(learnerId)  snapshot()
        ▼
 ┌──────────────────────────┐      reads       ┌──────────────────┐
 │ EnrollmentService        │ ───────────────▶ │ LearnerDirectory │  (completed courses)
 │  - per-offering mutex    │                  └──────────────────┘
 │  - load → decide → save  │
 └──────────┬───────────────┘
            │ pure functions            async load/save
            ▼                                   ▼
 ┌──────────────────────────┐         ┌──────────────────────┐
 │ offering.ts (domain)     │         │ OfferingStore        │
 │  enroll / drop / promote │         │  (in-memory impl)    │
 └──────────────────────────┘         └──────────────────────┘
```

- **Domain (`offering.ts`)** — pure, synchronous functions: given the current state and an
  eligibility check, return a result and the next state. No I/O, so every rule is unit-testable.
- **Service (`enrollment-service.ts`)** — the public API. Serialises operations on the offering,
  loads state, **looks up eligibility for the requester and every waitlisted learner up front**
  (the directory is async, the domain is not), passes the domain a synchronous `isEligible`
  function, and saves only if the state changed. If a directory lookup fails, the operation fails
  and nothing is saved.
- **Store (`OfferingStore`)** — async interface, as a real database would be. The in-memory
  implementation returns copies so callers cannot mutate stored state by accident.

## 3. Data model

```ts
type LearnerId = string;

interface OfferingState {
  offeringId: string;
  capacity: number;                 // > 0
  prerequisites: readonly string[]; // course codes
  enrolled: readonly LearnerId[];   // seat holders, in enrollment order
  waitlist: readonly LearnerId[];   // FIFO; index 0 = earliest
}

interface LearnerDirectory {
  completedCourses(learnerId: LearnerId): Promise<ReadonlySet<string> | undefined>; // undefined = unknown
}
```

## 4. API and results

Business outcomes are **returned**, not thrown, so every request gets a clear, typed answer.
Exceptions are reserved for programmer errors (e.g. constructing an offering with capacity 0).

| Call | Outcome | State change |
|---|---|---|
| `enroll(id)` | `ENROLLED` | added to `enrolled` |
| | `WAITLISTED` (with 1-based `position`) | appended to `waitlist` |
| | `ALREADY_ENROLLED` | none |
| | `ALREADY_WAITLISTED` (with `position`) | none |
| | `PREREQUISITE_NOT_MET` (with `missing` courses) | none |
| | `LEARNER_NOT_FOUND` | none |
| | `INVALID_REQUEST` | none |
| `drop(id)` | `DROPPED` (with `promoted` learner IDs, possibly empty) | removed from `enrolled`; promotion runs |
| | `LEFT_WAITLIST` | removed from `waitlist` |
| | `NOT_ENROLLED` | none |
| | `INVALID_REQUEST` | none |
| `snapshot()` | read-only copy of `OfferingState` | none |

## 5. Invariants

Checked after every operation (tests assert these explicitly):

| # | Invariant |
|---|---|
| I1 | `enrolled.length ≤ capacity` |
| I2 | No learner appears twice in `enrolled`, twice in `waitlist`, or in both. |
| I3 | Waitlist order is join order. Entries are only removed, never reordered or re-inserted. |
| I4 | Every enrolled learner was eligible at the moment they were enrolled or promoted. |
| I5 | **No idle seat while an eligible learner waits:** after an operation completes, if `enrolled.length < capacity`, nobody on the waitlist is currently eligible. |
| I6 | A rejected request (`ALREADY_*`, `PREREQUISITE_NOT_MET`, `LEARNER_NOT_FOUND`, `INVALID_REQUEST`, `NOT_ENROLLED`) makes **no change of its own**. The only change that can accompany it is the pending promotion described in §6. |

## 6. Waitlist promotion rule

`promote(state)` runs **at the start of every `enroll` and `drop` call** (before the request is
handled) and again **after a successful drop**:

```
while enrolled.length < capacity:
    candidate = first learner in waitlist (FIFO) who is currently eligible
    if none: stop               # ineligible learners stay where they are (A5)
    move candidate from waitlist to enrolled
```

Running promotion on **every** operation, not only on drop, is what upholds I5 under the
skip-and-retain policy. Example: seat opens, the only waiter is ineligible, so the seat stays open.
Later that waiter completes the prerequisite. On the next operation, promotion runs first, so they
get the seat before any newcomer. A newcomer calling `enroll` only gets a seat directly if one is
still free after promotion.

Consequences, stated so they are tested rather than accidental:
- If a waitlisted learner calls `enroll` after becoming eligible while a seat is open, the
  start-of-call promotion moves them into the seat, and they receive `ALREADY_ENROLLED`.
  (The seat was granted by promotion, not by this request.)
- Promotions caused by a start-of-call pass are saved even if the request itself is rejected.
  This is the only exception to I6, and the promoted learners are visible in `snapshot()`.

## 7. Concurrency and persistence

- Node runs JavaScript on one thread, but an async store means two requests can interleave across
  `await` points (both read "1 seat left", both enroll → overbooking).
- The service therefore holds a **per-offering mutex** (a promise chain) around the whole
  *load → decide → save* sequence. Operations on the offering run one at a time, in arrival order.
- The domain step is pure and the save happens only on success, so a failed operation cannot leave
  partial state (I6).
- A real database would replace the mutex with a transaction plus a row lock or optimistic version
  check on the offering row. The service boundary stays the same.

## 8. Tradeoffs

| Choice | Why | Cost |
|---|---|---|
| Skip and retain (A5) | Fair: nobody loses their place because of a temporary record issue. | A long-ineligible learner stays on the list; promotion scans past them each time (O(n), fine at course scale). |
| Re-check eligibility at promotion (A2) | Records can change while waiting. | One directory lookup per waiter scanned. |
| Return results, don't throw | Clear, exhaustive outcomes; callers can't forget a case (TypeScript discriminated union). | Slightly more verbose types. |
| Pure domain + thin async service | Rules are testable without timing; concurrency is isolated in one place. | Two layers instead of one class. |
| In-process mutex | Simplest correct option with an in-memory store. | Doesn't protect multiple processes; a database transaction would be needed then (see §7). |
