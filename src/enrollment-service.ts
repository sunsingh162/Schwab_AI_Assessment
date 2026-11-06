/**
 * Public API for one course offering (DESIGN.md §2, §4, §7).
 *
 * Each call runs under a mutex as one load → decide → save sequence, so concurrent requests
 * cannot interleave and overbook. State is saved only when the domain reports a change.
 *
 * Use one EnrollmentService instance per offering: the lock lives on the instance.
 */
import { Mutex } from "./mutex.js";
import { createOfferingState, drop, enroll, normalizeLearnerId } from "./offering.js";
import type { LearnerDirectory, OfferingStore } from "./store.js";
import type {
  DropResult,
  Eligibility,
  EligibilityLookup,
  EnrollResult,
  LearnerId,
  OfferingConfig,
  OfferingState,
  Outcome,
} from "./types.js";

export class EnrollmentService {
  private readonly mutex = new Mutex();

  private constructor(
    private readonly store: OfferingStore,
    private readonly directory: LearnerDirectory,
    readonly offeringId: string,
  ) {}

  /** Creates the offering in the store (if absent) and returns a service for it. */
  static async create(
    store: OfferingStore,
    directory: LearnerDirectory,
    config: OfferingConfig,
  ): Promise<EnrollmentService> {
    const initial = createOfferingState(config);
    if ((await store.load(initial.offeringId)) === undefined) {
      await store.save(initial);
    }
    return new EnrollmentService(store, directory, initial.offeringId);
  }

  enroll(learnerId: unknown): Promise<EnrollResult> {
    return this.run(learnerId, enroll);
  }

  drop(learnerId: unknown): Promise<DropResult> {
    return this.run(learnerId, drop);
  }

  /** Consistent read-only copy of the offering, taken after any in-flight operations. */
  snapshot(): Promise<OfferingState> {
    return this.mutex.runExclusive(() => this.load());
  }

  private run<R>(
    rawLearnerId: unknown,
    operation: (state: OfferingState, id: unknown, eligibility: EligibilityLookup) => Outcome<R>,
  ): Promise<R> {
    return this.mutex.runExclusive(async () => {
      const state = await this.load();
      const eligibility = await this.lookupEligibility(state, normalizeLearnerId(rawLearnerId));
      const outcome = operation(state, rawLearnerId, eligibility);
      if (outcome.changed) {
        await this.store.save(outcome.state);
      }
      return outcome.result;
    });
  }

  private async load(): Promise<OfferingState> {
    const state = await this.store.load(this.offeringId);
    if (state === undefined) {
      throw new Error(`Offering ${this.offeringId} not found in store`);
    }
    return state;
  }

  /**
   * Fetches eligibility for the requester and every waitlisted learner before the domain runs,
   * because the directory is async and the domain is not (DESIGN.md §2). If any lookup throws,
   * the whole operation fails before anything is saved.
   */
  private async lookupEligibility(
    state: OfferingState,
    requester: LearnerId | undefined,
  ): Promise<EligibilityLookup> {
    const ids = new Set<LearnerId>(state.waitlist);
    if (requester !== undefined) ids.add(requester);

    const entries = await Promise.all(
      [...ids].map(async (id): Promise<[LearnerId, Eligibility]> => {
        const completed = await this.directory.completedCourses(id);
        return [id, evaluate(state.prerequisites, completed)];
      }),
    );
    const table = new Map(entries);

    return (learnerId) => {
      const result = table.get(learnerId);
      if (result === undefined) {
        // Only reachable through a bug: the domain asked about someone we did not look up.
        throw new Error(`Eligibility for ${learnerId} was not prefetched`);
      }
      return result;
    };
  }
}

/** Prerequisite rule (DESIGN.md A1): eligible when every prerequisite has been completed. */
function evaluate(
  prerequisites: readonly string[],
  completed: ReadonlySet<string> | undefined,
): Eligibility {
  if (completed === undefined) return { kind: "unknown" };
  const missing = prerequisites.filter((course) => !completed.has(course));
  return missing.length === 0 ? { kind: "eligible" } : { kind: "ineligible", missing };
}
