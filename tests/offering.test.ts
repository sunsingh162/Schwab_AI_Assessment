/**
 * Unit tests for the pure domain functions in src/offering.ts.
 * No store, no async: these pin down the rules themselves.
 */
import { describe, expect, it } from "vitest";
import { createOfferingState, drop, enroll, promote } from "../src/offering.js";
import type { Eligibility, EligibilityLookup, OfferingState } from "../src/types.js";

const eligible: Eligibility = { kind: "eligible" };
const ineligible: Eligibility = { kind: "ineligible", missing: ["CS101"] };

/** Lookup where the listed IDs are ineligible and everyone else is eligible. */
function lookup(ineligibleIds: string[] = []): EligibilityLookup {
  return (id) => (ineligibleIds.includes(id) ? ineligible : eligible);
}

function state(overrides: Partial<OfferingState>): OfferingState {
  return { ...createOfferingState({ offeringId: "CS201", capacity: 1 }), ...overrides };
}

/** Deep-freezes a state so any mutation inside the domain throws in strict mode. */
function frozen(s: OfferingState): OfferingState {
  Object.freeze(s.enrolled);
  Object.freeze(s.waitlist);
  Object.freeze(s.prerequisites);
  return Object.freeze(s);
}

describe("createOfferingState", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects capacity %s",
    (capacity) => {
      expect(() => createOfferingState({ offeringId: "CS201", capacity })).toThrow(RangeError);
    },
  );

  it("rejects an empty offering ID", () => {
    expect(() => createOfferingState({ offeringId: "  ", capacity: 1 })).toThrow(RangeError);
  });

  it("de-duplicates prerequisite codes and starts empty", () => {
    const s = createOfferingState({
      offeringId: "CS201",
      capacity: 3,
      prerequisites: ["CS101", "CS101", "MATH101"],
    });
    expect(s).toEqual({
      offeringId: "CS201",
      capacity: 3,
      prerequisites: ["CS101", "MATH101"],
      enrolled: [],
      waitlist: [],
    });
  });
});

describe("promote", () => {
  it("fills every open seat from the front of the queue", () => {
    const s = state({ capacity: 3, enrolled: ["a"], waitlist: ["b", "c", "d"] });
    const out = promote(s, lookup());
    expect(out.promoted).toEqual(["b", "c"]);
    expect(out.state.enrolled).toEqual(["a", "b", "c"]);
    expect(out.state.waitlist).toEqual(["d"]);
  });

  it("skips ineligible waiters and keeps them in their original relative order", () => {
    const s = state({ capacity: 2, enrolled: [], waitlist: ["x", "b", "y", "c", "d"] });
    const out = promote(s, lookup(["x", "y"]));
    expect(out.promoted).toEqual(["b", "c"]);
    expect(out.state.waitlist).toEqual(["x", "y", "d"]);
  });

  it("returns the same state object when nothing changes", () => {
    const full = state({ capacity: 1, enrolled: ["a"], waitlist: ["b"] });
    expect(promote(full, lookup()).state).toBe(full);

    const allIneligible = state({ capacity: 1, enrolled: [], waitlist: ["x"] });
    expect(promote(allIneligible, lookup(["x"])).state).toBe(allIneligible);
  });
});

describe("purity", () => {
  it("never mutates the input state", () => {
    const s = frozen(state({ capacity: 1, enrolled: ["a"], waitlist: ["b", "c"] }));
    expect(() => enroll(s, "d", lookup())).not.toThrow();
    expect(() => drop(s, "a", lookup())).not.toThrow();
    expect(() => drop(s, "c", lookup())).not.toThrow();
    expect(s).toEqual(state({ capacity: 1, enrolled: ["a"], waitlist: ["b", "c"] }));
  });

  it("reports changed=false for rejected requests", () => {
    const s = state({ capacity: 1, enrolled: ["a"] });
    expect(enroll(s, "a", lookup()).changed).toBe(false);
    expect(enroll(s, "z", lookup(["z"])).changed).toBe(false);
    expect(drop(s, "nobody", lookup()).changed).toBe(false);
    expect(drop(s, "", lookup()).changed).toBe(false);
  });
});
