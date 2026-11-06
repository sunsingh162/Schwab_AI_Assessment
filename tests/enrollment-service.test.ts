/**
 * Acceptance tests, grouped by the brief's acceptance criteria (AC1–AC6).
 * Every test checks the DESIGN.md §5 invariants after each state-changing step.
 */
import { afterEach, describe, expect, it } from "vitest";
import { PREREQ, eligibleLearners, expectInvariants, setup } from "./helpers.js";
import { EnrollmentService, type InMemoryLearnerDirectory } from "../src/index.js";

let current: { service: EnrollmentService; directory: InMemoryLearnerDirectory } | undefined;

/** Registers the service so invariants are also checked once more at the end of every test. */
async function track(capacity: number, records: Record<string, readonly string[]>) {
  const ctx = await setup(capacity, records);
  current = ctx;
  return ctx;
}

afterEach(async () => {
  if (current) await expectInvariants(current.service, current.directory);
  current = undefined;
});

describe("AC1: enrollment with available capacity", () => {
  it("enrolls an eligible learner while seats remain", async () => {
    const { service, directory } = await track(2, eligibleLearners("l", 2));

    expect(await service.enroll("l1")).toEqual({ status: "ENROLLED" });
    expect(await service.enroll("l2")).toEqual({ status: "ENROLLED" });

    const state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual(["l1", "l2"]);
    expect(state.waitlist).toEqual([]);
  });

  it("enrolls anyone known when the offering has no prerequisites", async () => {
    const { service } = await setup(1, { newbie: [] }, []);
    expect(await service.enroll("newbie")).toEqual({ status: "ENROLLED" });
  });
});

describe("AC2: full capacity and duplicate requests", () => {
  it("waitlists an eligible learner when full, in arrival order with positions", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 3));
    await service.enroll("l1");

    expect(await service.enroll("l2")).toEqual({ status: "WAITLISTED", position: 1 });
    expect(await service.enroll("l3")).toEqual({ status: "WAITLISTED", position: 2 });

    const state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual(["l1"]);
    expect(state.waitlist).toEqual(["l2", "l3"]);
  });

  it("does not create a second record when an enrolled learner enrolls again", async () => {
    const { service, directory } = await track(2, eligibleLearners("l", 1));
    await service.enroll("l1");

    expect(await service.enroll("l1")).toEqual({ status: "ALREADY_ENROLLED" });
    expect(await service.enroll(" l1 ")).toEqual({ status: "ALREADY_ENROLLED" }); // same ID after trim

    expect((await expectInvariants(service, directory)).enrolled).toEqual(["l1"]);
  });

  it("does not re-queue a waitlisted learner who enrolls again; position is unchanged", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 3));
    await service.enroll("l1");
    await service.enroll("l2");
    await service.enroll("l3");

    expect(await service.enroll("l2")).toEqual({ status: "ALREADY_WAITLISTED", position: 1 });

    expect((await expectInvariants(service, directory)).waitlist).toEqual(["l2", "l3"]);
  });
});

describe("AC3: drop opens a seat and promotes in FIFO order", () => {
  it("promotes the earliest waitlisted learner, then the next one", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 3));
    await service.enroll("l1");
    await service.enroll("l2");
    await service.enroll("l3");

    expect(await service.drop("l1")).toEqual({ status: "DROPPED", promoted: ["l2"] });
    let state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual(["l2"]);
    expect(state.waitlist).toEqual(["l3"]);

    expect(await service.drop("l2")).toEqual({ status: "DROPPED", promoted: ["l3"] });
    state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual(["l3"]);
    expect(state.waitlist).toEqual([]);
  });

  it("just opens a seat when nobody is waiting", async () => {
    const { service, directory } = await track(2, eligibleLearners("l", 2));
    await service.enroll("l1");

    expect(await service.drop("l1")).toEqual({ status: "DROPPED", promoted: [] });
    expect((await expectInvariants(service, directory)).enrolled).toEqual([]);
  });

  it("lets a waitlisted learner leave without promoting anyone or reordering the rest", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 4));
    for (const id of ["l1", "l2", "l3", "l4"]) await service.enroll(id);

    expect(await service.drop("l3")).toEqual({ status: "LEFT_WAITLIST" });

    const state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual(["l1"]);
    expect(state.waitlist).toEqual(["l2", "l4"]);
    expect(await service.enroll("l4")).toEqual({ status: "ALREADY_WAITLISTED", position: 2 });
  });

  it("sends a learner who drops and re-enrolls to the back of the queue", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 3));
    for (const id of ["l1", "l2", "l3"]) await service.enroll(id);
    await service.drop("l1"); // l2 promoted

    expect(await service.enroll("l1")).toEqual({ status: "WAITLISTED", position: 2 });
    expect((await expectInvariants(service, directory)).waitlist).toEqual(["l3", "l1"]);
  });
});

describe("AC4: prerequisite failure and the skip-and-retain policy (DESIGN.md A4, A5)", () => {
  it("rejects an ineligible learner: no seat, no waitlist entry, missing courses listed", async () => {
    const { service, directory } = await setup(1, { noPrereq: [] }, [PREREQ, "MATH101"]);
    current = { service, directory };

    expect(await service.enroll("noPrereq")).toEqual({
      status: "PREREQUISITE_NOT_MET",
      missing: [PREREQ, "MATH101"],
    });

    const state = await service.snapshot();
    expect(state.enrolled).toEqual([]);
    expect(state.waitlist).toEqual([]);
  });

  it("lists only the prerequisites that are actually missing", async () => {
    const { service } = await setup(1, { partial: [PREREQ] }, [PREREQ, "MATH101"]);
    expect(await service.enroll("partial")).toEqual({
      status: "PREREQUISITE_NOT_MET",
      missing: ["MATH101"],
    });
  });

  it("also rejects an ineligible learner when the offering is full (does not waitlist them)", async () => {
    const { service, directory } = await track(1, { ...eligibleLearners("l", 1), noPrereq: [] });
    await service.enroll("l1");

    expect(await service.enroll("noPrereq")).toMatchObject({ status: "PREREQUISITE_NOT_MET" });
    expect((await expectInvariants(service, directory)).waitlist).toEqual([]);
  });

  it("rejects an unknown learner", async () => {
    const { service, directory } = await track(1, {});
    expect(await service.enroll("ghost")).toEqual({ status: "LEARNER_NOT_FOUND" });
    expect((await expectInvariants(service, directory)).enrolled).toEqual([]);
  });

  it("skips a waiter who became ineligible, promotes the next one, and keeps the skipped waiter's place", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 3));
    for (const id of ["l1", "l2", "l3"]) await service.enroll(id);
    directory.setCompletedCourses("l2", []); // l2's record changes while waiting

    expect(await service.drop("l1")).toEqual({ status: "DROPPED", promoted: ["l3"] });

    const state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual(["l3"]);
    expect(state.waitlist).toEqual(["l2"]); // still waiting, still first
  });

  it("promotes a skipped waiter ahead of later joiners once eligible again", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 4));
    for (const id of ["l1", "l2", "l3", "l4"]) await service.enroll(id);
    directory.setCompletedCourses("l2", []);
    await service.drop("l1"); // l2 skipped, l3 promoted; waitlist = [l2, l4]
    directory.setCompletedCourses("l2", [PREREQ]);

    expect(await service.drop("l3")).toEqual({ status: "DROPPED", promoted: ["l2"] });
    expect((await expectInvariants(service, directory)).waitlist).toEqual(["l4"]);
  });

  it("leaves a seat open when every waiter is ineligible, and gives it to an eligible newcomer", async () => {
    const { service, directory } = await track(1, { ...eligibleLearners("l", 3), newcomer: [PREREQ] });
    for (const id of ["l1", "l2", "l3"]) await service.enroll(id);
    directory.setCompletedCourses("l2", []);
    directory.setCompletedCourses("l3", []);

    expect(await service.drop("l1")).toEqual({ status: "DROPPED", promoted: [] });
    let state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual([]);
    expect(state.waitlist).toEqual(["l2", "l3"]);

    expect(await service.enroll("newcomer")).toEqual({ status: "ENROLLED" });
    state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual(["newcomer"]);
    expect(state.waitlist).toEqual(["l2", "l3"]);
  });

  it("gives an open seat to a waiter who became eligible before a newcomer (start-of-call promotion)", async () => {
    const { service, directory } = await track(1, { ...eligibleLearners("l", 2), newcomer: [PREREQ] });
    await service.enroll("l1");
    await service.enroll("l2");
    directory.setCompletedCourses("l2", []);
    await service.drop("l1"); // seat open, l2 ineligible and waiting
    directory.setCompletedCourses("l2", [PREREQ]);

    expect(await service.enroll("newcomer")).toEqual({ status: "WAITLISTED", position: 1 });

    const state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual(["l2"]);
    expect(state.waitlist).toEqual(["newcomer"]);
  });

  it("returns ALREADY_ENROLLED to a waiter whose own enroll call triggers their promotion", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 2));
    await service.enroll("l1");
    await service.enroll("l2");
    directory.setCompletedCourses("l2", []);
    await service.drop("l1");
    directory.setCompletedCourses("l2", [PREREQ]);

    expect(await service.enroll("l2")).toEqual({ status: "ALREADY_ENROLLED" });
    expect((await expectInvariants(service, directory)).enrolled).toEqual(["l2"]);
  });

  it("does not remove an enrolled learner whose record later changes", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 1));
    await service.enroll("l1");
    directory.setCompletedCourses("l1", []);

    expect(await service.enroll("l1")).toEqual({ status: "ALREADY_ENROLLED" });
    expect((await service.snapshot()).enrolled).toEqual(["l1"]);
  });
});

describe("AC5: invalid requests and repeated drops leave state intact", () => {
  it("returns NOT_ENROLLED for a repeated drop and changes nothing", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 2));
    await service.enroll("l1");
    await service.enroll("l2");
    await service.drop("l1"); // l2 promoted
    const before = await service.snapshot();

    expect(await service.drop("l1")).toEqual({ status: "NOT_ENROLLED" });
    expect(await service.drop("l1")).toEqual({ status: "NOT_ENROLLED" });

    expect(await expectInvariants(service, directory)).toEqual(before);
  });

  it("returns NOT_ENROLLED for a learner who never enrolled", async () => {
    const { service } = await track(1, eligibleLearners("l", 1));
    await service.enroll("l1");
    const before = await service.snapshot();

    expect(await service.drop("stranger")).toEqual({ status: "NOT_ENROLLED" });
    expect(await service.snapshot()).toEqual(before);
  });

  it.each([
    ["empty string", ""],
    ["whitespace", "   "],
    ["number", 42],
    ["null", null],
    ["undefined", undefined],
    ["object", { id: "l1" }],
  ])("returns INVALID_REQUEST for a %s learner ID and changes nothing", async (_label, badId) => {
    const { service, directory } = await track(1, eligibleLearners("l", 2));
    await service.enroll("l1");
    await service.enroll("l2");
    const before = await service.snapshot();

    expect(await service.enroll(badId)).toMatchObject({ status: "INVALID_REQUEST" });
    expect(await service.drop(badId)).toMatchObject({ status: "INVALID_REQUEST" });

    expect(await expectInvariants(service, directory)).toEqual(before);
  });

  it("keeps state unchanged after rejected enroll requests", async () => {
    const { service } = await track(1, { ...eligibleLearners("l", 2), noPrereq: [] });
    await service.enroll("l1");
    await service.enroll("l2");
    const before = await service.snapshot();

    await service.enroll("l1"); // ALREADY_ENROLLED
    await service.enroll("l2"); // ALREADY_WAITLISTED
    await service.enroll("noPrereq"); // PREREQUISITE_NOT_MET
    await service.enroll("ghost"); // LEARNER_NOT_FOUND

    expect(await service.snapshot()).toEqual(before);
  });

  it("fails cleanly and saves nothing when the learner directory errors, then keeps working", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 2));
    await service.enroll("l1");
    const before = await service.snapshot();

    const original = directory.completedCourses.bind(directory);
    directory.completedCourses = async () => {
      throw new Error("directory unavailable");
    };
    await expect(service.enroll("l2")).rejects.toThrow("directory unavailable");
    directory.completedCourses = original;

    expect(await service.snapshot()).toEqual(before);
    expect(await service.enroll("l2")).toEqual({ status: "WAITLISTED", position: 1 }); // lock released
  });
});

describe("Service setup", () => {
  it("does not reset an existing offering when a second service is created for it", async () => {
    const { service, store, directory } = await setup(1, eligibleLearners("l", 1));
    await service.enroll("l1");

    const again = await EnrollmentService.create(store, directory, {
      offeringId: "CS201",
      capacity: 1,
      prerequisites: [PREREQ],
    });

    expect((await again.snapshot()).enrolled).toEqual(["l1"]);
  });
});

describe("Edge cases added after independent review (AI_USAGE.md Entry 7)", () => {
  it("returns LEFT_WAITLIST to a waiter who drops when a promotion pass would have seated them", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 2));
    await service.enroll("l1");
    await service.enroll("l2");
    directory.setCompletedCourses("l2", []);
    await service.drop("l1"); // seat open, l2 skipped and retained
    directory.setCompletedCourses("l2", [PREREQ]); // l2 would now be promoted by any call

    expect(await service.drop("l2")).toEqual({ status: "LEFT_WAITLIST" });

    const state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual([]);
    expect(state.waitlist).toEqual([]);
  });

  it("gives the seat to the next eligible waiter when the waiter ahead leaves", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 3));
    for (const id of ["l1", "l2", "l3"]) await service.enroll(id);
    directory.setCompletedCourses("l2", []);
    directory.setCompletedCourses("l3", []);
    await service.drop("l1"); // seat open; l2, l3 both skipped
    directory.setCompletedCourses("l2", [PREREQ]);
    directory.setCompletedCourses("l3", [PREREQ]);

    expect(await service.drop("l2")).toEqual({ status: "LEFT_WAITLIST" });

    const state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual(["l3"]);
    expect(state.waitlist).toEqual([]);
  });

  it("lets an ineligible waiter leave the waitlist", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 3));
    for (const id of ["l1", "l2", "l3"]) await service.enroll(id);
    directory.setCompletedCourses("l2", []);

    expect(await service.drop("l2")).toEqual({ status: "LEFT_WAITLIST" });
    expect((await expectInvariants(service, directory)).waitlist).toEqual(["l3"]);
  });

  it("lists start-of-call and post-drop promotions together in DROPPED.promoted", async () => {
    const { service, directory } = await track(2, eligibleLearners("l", 4));
    for (const id of ["l1", "l2", "l3", "l4"]) await service.enroll(id);
    directory.setCompletedCourses("l3", []);
    directory.setCompletedCourses("l4", []);
    await service.drop("l1"); // one seat open; l3, l4 skipped
    directory.setCompletedCourses("l3", [PREREQ]);
    directory.setCompletedCourses("l4", [PREREQ]);

    // Start-of-call promotion seats l3; releasing l2's seat then promotes l4.
    expect(await service.drop("l2")).toEqual({ status: "DROPPED", promoted: ["l3", "l4"] });
    expect((await expectInvariants(service, directory)).enrolled).toEqual(["l3", "l4"]);
  });

  it("skips and retains a waiter whose learner record disappears (unknown)", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 3));
    for (const id of ["l1", "l2", "l3"]) await service.enroll(id);
    directory.removeLearner("l2");

    expect(await service.drop("l1")).toEqual({ status: "DROPPED", promoted: ["l3"] });
    expect((await expectInvariants(service, directory)).waitlist).toEqual(["l2"]);
  });

  it("fails a drop cleanly when a waiter's lookup errors, then keeps working", async () => {
    const { service, directory } = await track(1, eligibleLearners("l", 2));
    await service.enroll("l1");
    await service.enroll("l2");
    const before = await service.snapshot();

    const original = directory.completedCourses.bind(directory);
    directory.completedCourses = async (id) => {
      if (id === "l2") throw new Error("lookup failed for l2");
      return original(id);
    };
    await expect(service.drop("l1")).rejects.toThrow("lookup failed for l2");
    expect(await service.snapshot()).toEqual(before); // seat not released, nobody promoted

    directory.completedCourses = original;
    expect(await service.drop("l1")).toEqual({ status: "DROPPED", promoted: ["l2"] });
  });

  it("does not need waiters' records while the offering is full and stays full", async () => {
    const { service, directory } = await track(1, { ...eligibleLearners("l", 2), newcomer: [PREREQ] });
    await service.enroll("l1");
    await service.enroll("l2");

    const original = directory.completedCourses.bind(directory);
    const looked: string[] = [];
    directory.completedCourses = async (id) => {
      looked.push(id);
      if (id === "l2") throw new Error("lookup failed for l2");
      return original(id);
    };

    // A broken waiter record does not block requests that cannot open a seat.
    expect(await service.enroll("newcomer")).toEqual({ status: "WAITLISTED", position: 2 });
    expect(await service.enroll("l1")).toEqual({ status: "ALREADY_ENROLLED" });
    expect(await service.drop("nobody")).toEqual({ status: "NOT_ENROLLED" });
    expect(looked).toEqual(["newcomer", "l1"]); // requester lookups only, no waiter scans

    directory.completedCourses = original;
  });

  it("applies the stored offering, not a different config, when create() is called again", async () => {
    const { store, directory } = await setup(1, eligibleLearners("l", 1));

    const again = await EnrollmentService.create(store, directory, {
      offeringId: "CS201",
      capacity: 50,
      prerequisites: [],
    });

    const state = await again.snapshot();
    expect(state.capacity).toBe(1);
    expect(state.prerequisites).toEqual([PREREQ]);
  });
});
