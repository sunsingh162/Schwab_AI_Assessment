/** Opaque learner identifier (non-empty after trimming). See DESIGN.md A8. */
export type LearnerId = string;

/** Persisted state of one course offering. See DESIGN.md §3. */
export interface OfferingState {
  readonly offeringId: string;
  readonly capacity: number;
  readonly prerequisites: readonly string[];
  /** Seat holders, in enrollment order. */
  readonly enrolled: readonly LearnerId[];
  /** FIFO queue; index 0 is the earliest joiner. */
  readonly waitlist: readonly LearnerId[];
}

/** Eligibility of a learner for this offering at the moment of a decision (DESIGN.md A1–A3). */
export type Eligibility =
  | { readonly kind: "eligible" }
  | { readonly kind: "ineligible"; readonly missing: readonly string[] }
  | { readonly kind: "unknown" };

/** Synchronous eligibility lookup handed to the pure domain functions. */
export type EligibilityLookup = (learnerId: LearnerId) => Eligibility;

export type EnrollResult =
  | { readonly status: "ENROLLED" }
  | { readonly status: "WAITLISTED"; readonly position: number }
  | { readonly status: "ALREADY_ENROLLED" }
  | { readonly status: "ALREADY_WAITLISTED"; readonly position: number }
  | { readonly status: "PREREQUISITE_NOT_MET"; readonly missing: readonly string[] }
  | { readonly status: "LEARNER_NOT_FOUND" }
  | { readonly status: "INVALID_REQUEST"; readonly reason: string };

export type DropResult =
  /** `promoted` lists every learner promoted during this call, in promotion order. */
  | { readonly status: "DROPPED"; readonly promoted: readonly LearnerId[] }
  | { readonly status: "LEFT_WAITLIST" }
  | { readonly status: "NOT_ENROLLED" }
  | { readonly status: "INVALID_REQUEST"; readonly reason: string };

/** Output of a domain operation: the result for the caller and the next state. */
export interface Outcome<R> {
  readonly result: R;
  readonly state: OfferingState;
  /** False when `state` is the input state, unchanged, so nothing needs saving. */
  readonly changed: boolean;
}

/** Configuration used to create an offering. */
export interface OfferingConfig {
  readonly offeringId: string;
  readonly capacity: number;
  readonly prerequisites?: readonly string[];
}
