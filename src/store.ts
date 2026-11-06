import type { LearnerId, OfferingState } from "./types.js";

/** Persistence boundary for offering state. Async, as a real database would be. */
export interface OfferingStore {
  load(offeringId: string): Promise<OfferingState | undefined>;
  save(state: OfferingState): Promise<void>;
}

/** Source of learner records, owned by another system (DESIGN.md A2). */
export interface LearnerDirectory {
  /** Completed course codes, or undefined if the learner is unknown. */
  completedCourses(learnerId: LearnerId): Promise<ReadonlySet<string> | undefined>;
}

/** Yields to the event loop so callers interleave the way they would with real I/O. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * In-memory store. Returns and keeps deep copies so neither callers nor the store can change
 * each other's data by reference.
 */
export class InMemoryOfferingStore implements OfferingStore {
  private readonly states = new Map<string, OfferingState>();

  async load(offeringId: string): Promise<OfferingState | undefined> {
    await tick();
    const state = this.states.get(offeringId);
    return state === undefined ? undefined : structuredClone(state);
  }

  async save(state: OfferingState): Promise<void> {
    await tick();
    this.states.set(state.offeringId, structuredClone(state));
  }
}

/** In-memory learner directory. `setCompletedCourses` lets tests change records over time. */
export class InMemoryLearnerDirectory implements LearnerDirectory {
  private readonly records = new Map<LearnerId, Set<string>>();

  constructor(initial: Record<LearnerId, readonly string[]> = {}) {
    for (const [learnerId, courses] of Object.entries(initial)) {
      this.setCompletedCourses(learnerId, courses);
    }
  }

  setCompletedCourses(learnerId: LearnerId, courses: readonly string[]): void {
    this.records.set(learnerId, new Set(courses));
  }

  async completedCourses(learnerId: LearnerId): Promise<ReadonlySet<string> | undefined> {
    await tick();
    const courses = this.records.get(learnerId);
    return courses === undefined ? undefined : new Set(courses);
  }
}
