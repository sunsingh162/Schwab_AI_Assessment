import { expect } from "vitest";
import {
  EnrollmentService,
  InMemoryLearnerDirectory,
  InMemoryOfferingStore,
  type OfferingState,
} from "../src/index.js";

export const PREREQ = "CS101";

/**
 * Builds a service for offering CS201 (prerequisite CS101) with the given learners.
 * `records` maps learner ID → completed courses. Returns the directory so tests can change
 * records over time (DESIGN.md A2).
 */
export async function setup(
  capacity: number,
  records: Record<string, readonly string[]>,
  prerequisites: readonly string[] = [PREREQ],
) {
  const directory = new InMemoryLearnerDirectory(records);
  const store = new InMemoryOfferingStore();
  const service = await EnrollmentService.create(store, directory, {
    offeringId: "CS201",
    capacity,
    prerequisites,
  });
  return { service, directory, store };
}

/** `count` eligible learners named prefix1..prefixN. */
export function eligibleLearners(prefix: string, count: number): Record<string, string[]> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`${prefix}${i + 1}`, [PREREQ]]),
  );
}

/**
 * Asserts the invariants from DESIGN.md §5 that can be checked from a snapshot.
 * I3 (FIFO order) and I6 (rejected requests change nothing) are asserted by individual tests.
 */
export async function expectInvariants(
  service: EnrollmentService,
  directory: InMemoryLearnerDirectory,
): Promise<OfferingState> {
  const state = await service.snapshot();

  // I1: never over capacity.
  expect(state.enrolled.length).toBeLessThanOrEqual(state.capacity);

  // I2: no duplicates within or across lists.
  const all = [...state.enrolled, ...state.waitlist];
  expect(new Set(all).size).toBe(all.length);

  // I5: no idle seat while a currently eligible learner waits.
  if (state.enrolled.length < state.capacity) {
    for (const learnerId of state.waitlist) {
      const completed = await directory.completedCourses(learnerId);
      const eligible =
        completed !== undefined && state.prerequisites.every((course) => completed.has(course));
      expect(eligible, `${learnerId} is eligible and waiting while a seat is open`).toBe(false);
    }
  }

  return state;
}
