/**
 * Public API for one course offering (DESIGN.md §2, §4, §7).
 *
 * Each call runs under a per-offering mutex as one load → decide → save sequence, so concurrent
 * requests cannot interleave and overbook. State is saved only when the domain reports a change.
 *
 * The mutex is shared by every service instance for the same store and offering ID, so creating
 * two instances is safe within one process. It does not protect across processes (DESIGN.md §7).
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

/** One mutex per (store, offering ID), shared by all service instances. */
const locks = new WeakMap<OfferingStore, Map<string, Mutex>>();

function lockFor(store: OfferingStore, offeringId: string): Mutex {
  let byOffering = locks.get(store);
  if (byOffering === undefined) {
    byOffering = new Map();
    locks.set(store, byOffering);
  }
  let mutex = byOffering.get(offeringId);
  if (mutex === undefined) {
    mutex = new Mutex();
    byOffering.set(offeringId, mutex);
  }
  return mutex;
}

export class EnrollmentService {
  private readonly mutex: Mutex;

  private constructor(
    private readonly store: OfferingStore,
    private readonly directory: LearnerDirectory,
    readonly offeringId: string,
  ) {
    this.mutex = lockFor(store, offeringId);
  }

  /**
   * Creates the offering in the store if absent and returns a service for it.
   * If the offering already exists, its stored capacity and prerequisites are kept and `config`
   * is not applied (see README limitations). Runs under the offering's lock, so concurrent
   * `create` calls cannot overwrite each other or an in-flight operation.
   */
  static async create(
    store: OfferingStore,
    directory: LearnerDirectory,
    config: OfferingConfig,
  ): Promise<EnrollmentService> {
    const initial = createOfferingState(config);
    await lockFor(store, initial.offeringId).runExclusive(async () => {
      if ((await store.load(initial.offeringId)) === undefined) {
        await store.save(initial);
      }
    });
    return new EnrollmentService(store, directory, initial.offeringId);
  }

  enroll(learnerId: unknown): Promise<EnrollResult> {
    return this.run(learnerId, enroll, { requesterEligibility: true, releasesSeat: false });
  }

  drop(learnerId: unknown): Promise<DropResult> {
    return this.run(learnerId, drop, { requesterEligibility: false, releasesSeat: true });
  }

  /** Consistent read-only copy of the offering, taken after any in-flight operations. */
  snapshot(): Promise<OfferingState> {
    return this.mutex.runExclusive(() => this.load());
  }

  private run<R>(
    rawLearnerId: unknown,
    operation: (state: OfferingState, id: unknown, eligibility: EligibilityLookup) => Outcome<R>,
    options: { requesterEligibility: boolean; releasesSeat: boolean },
  ): Promise<R> {
    return this.mutex.runExclusive(async () => {
      const state = await this.load();
      const requester = normalizeLearnerId(rawLearnerId);
      const eligibility = await this.lookupEligibility(
        state,
        options.requesterEligibility ? requester : undefined,
        mayOpenSeat(state, requester, options.releasesSeat),
      );
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
   * Fetches eligibility before the domain runs, because the directory is async and the domain is
   * not (DESIGN.md §2). Looks up the requester (for `enroll`) and, only when a seat is open or this
   * call may open one, every waitlisted learner. If any lookup throws, the whole operation fails
   * before anything is saved.
   */
  private async lookupEligibility(
    state: OfferingState,
    requester: LearnerId | undefined,
    includeWaitlist: boolean,
  ): Promise<EligibilityLookup> {
    const ids = new Set<LearnerId>(includeWaitlist ? state.waitlist : []);
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

/**
 * True when promotion could run during this call: a seat is already open, or this is a drop by a
 * learner who holds a seat (releasing it). Otherwise the offering is full and stays full, so
 * waitlisted learners' eligibility is not needed.
 */
function mayOpenSeat(
  state: OfferingState,
  requester: LearnerId | undefined,
  releasesSeat: boolean,
): boolean {
  return (
    state.enrolled.length < state.capacity ||
    (releasesSeat && requester !== undefined && state.enrolled.includes(requester))
  );
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
