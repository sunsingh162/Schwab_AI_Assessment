/**
 * Domain rules for one course offering (DESIGN.md §2, §6).
 *
 * Every function here is pure and synchronous: it takes a state and returns a new state.
 * Input states are never mutated. Storage, locking, and async eligibility lookups live in
 * the service layer.
 */
import type {
  DropResult,
  EligibilityLookup,
  EnrollResult,
  LearnerId,
  OfferingConfig,
  OfferingState,
  Outcome,
} from "./types.js";

/** Builds the initial state. Throws on invalid configuration (a programmer error, not a request). */
export function createOfferingState(config: OfferingConfig): OfferingState {
  const offeringId = config.offeringId.trim();
  if (offeringId === "") {
    throw new RangeError("offeringId must be a non-empty string");
  }
  if (!Number.isInteger(config.capacity) || config.capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${String(config.capacity)}`);
  }
  return {
    offeringId,
    capacity: config.capacity,
    prerequisites: [...new Set(config.prerequisites ?? [])],
    enrolled: [],
    waitlist: [],
  };
}

/**
 * Normalises a learner ID from an untrusted caller (DESIGN.md A8).
 * Returns the trimmed ID, or undefined if it is not a non-empty string.
 */
export function normalizeLearnerId(raw: unknown): LearnerId | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Fills open seats from the waitlist (DESIGN.md §6).
 * Scans in FIFO order and promotes the first currently-eligible learner, repeatedly, until the
 * offering is full or no waiter is eligible. Ineligible waiters are skipped and keep their place.
 */
export function promote(
  state: OfferingState,
  eligibility: EligibilityLookup,
): { state: OfferingState; promoted: LearnerId[] } {
  const promoted: LearnerId[] = [];
  let openSeats = state.capacity - state.enrolled.length;
  if (openSeats <= 0 || state.waitlist.length === 0) {
    return { state, promoted };
  }

  const remaining: LearnerId[] = [];
  for (const learnerId of state.waitlist) {
    if (openSeats > 0 && eligibility(learnerId).kind === "eligible") {
      promoted.push(learnerId);
      openSeats -= 1;
    } else {
      remaining.push(learnerId); // skipped (ineligible) or no seat left: keeps relative order
    }
  }

  if (promoted.length === 0) {
    return { state, promoted };
  }
  return {
    state: { ...state, enrolled: [...state.enrolled, ...promoted], waitlist: remaining },
    promoted,
  };
}

/** Handles an enroll request (DESIGN.md §4). Runs a promotion pass first (§6). */
export function enroll(
  state: OfferingState,
  rawLearnerId: unknown,
  eligibility: EligibilityLookup,
): Outcome<EnrollResult> {
  const before = promote(state, eligibility);
  const current = before.state;
  const changedByPromotion = before.promoted.length > 0;
  const reply = (result: EnrollResult): Outcome<EnrollResult> => ({
    result,
    state: current,
    changed: changedByPromotion,
  });

  const learnerId = normalizeLearnerId(rawLearnerId);
  if (learnerId === undefined) {
    return reply({ status: "INVALID_REQUEST", reason: "learnerId must be a non-empty string" });
  }
  if (current.enrolled.includes(learnerId)) {
    return reply({ status: "ALREADY_ENROLLED" });
  }
  const waitIndex = current.waitlist.indexOf(learnerId);
  if (waitIndex !== -1) {
    return reply({ status: "ALREADY_WAITLISTED", position: waitIndex + 1 });
  }

  const check = eligibility(learnerId);
  if (check.kind === "unknown") {
    return reply({ status: "LEARNER_NOT_FOUND" });
  }
  if (check.kind === "ineligible") {
    return reply({ status: "PREREQUISITE_NOT_MET", missing: [...check.missing] });
  }

  if (current.enrolled.length < current.capacity) {
    return {
      result: { status: "ENROLLED" },
      state: { ...current, enrolled: [...current.enrolled, learnerId] },
      changed: true,
    };
  }
  const waitlist = [...current.waitlist, learnerId];
  return {
    result: { status: "WAITLISTED", position: waitlist.length },
    state: { ...current, waitlist },
    changed: true,
  };
}

/**
 * Handles a drop request (DESIGN.md §4, A7). Runs a promotion pass first, and again after an
 * enrolled learner's seat is released.
 */
export function drop(
  state: OfferingState,
  rawLearnerId: unknown,
  eligibility: EligibilityLookup,
): Outcome<DropResult> {
  const before = promote(state, eligibility);
  const current = before.state;
  const changedByPromotion = before.promoted.length > 0;
  const reply = (result: DropResult): Outcome<DropResult> => ({
    result,
    state: current,
    changed: changedByPromotion,
  });

  const learnerId = normalizeLearnerId(rawLearnerId);
  if (learnerId === undefined) {
    return reply({ status: "INVALID_REQUEST", reason: "learnerId must be a non-empty string" });
  }

  if (current.enrolled.includes(learnerId)) {
    const released: OfferingState = {
      ...current,
      enrolled: current.enrolled.filter((id) => id !== learnerId),
    };
    const after = promote(released, eligibility);
    return {
      result: { status: "DROPPED", promoted: [...before.promoted, ...after.promoted] },
      state: after.state,
      changed: true,
    };
  }

  if (current.waitlist.includes(learnerId)) {
    // Leaving the waitlist opens no seat, so no second promotion pass is needed.
    return {
      result: { status: "LEFT_WAITLIST" },
      state: { ...current, waitlist: current.waitlist.filter((id) => id !== learnerId) },
      changed: true,
    };
  }

  return reply({ status: "NOT_ENROLLED" });
}
