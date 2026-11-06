/**
 * Concurrency tests (acceptance criterion 6, DESIGN.md §7).
 *
 * Requests are fired together with Promise.all. The in-memory store and directory yield to the
 * event loop on every call, so without the service's mutex these operations would interleave
 * between load and save, the way they would against a real database.
 */
import { describe, expect, it } from "vitest";
import { EnrollmentService } from "../src/index.js";
import { eligibleLearners, expectInvariants, setup } from "./helpers.js";

describe("concurrent requests", () => {
  it("never overbooks when many learners race for a few seats", async () => {
    const capacity = 5;
    const racers = 50;
    const { service, directory } = await setup(capacity, eligibleLearners("l", racers));
    const ids = Array.from({ length: racers }, (_, i) => `l${i + 1}`);

    const results = await Promise.all(ids.map((id) => service.enroll(id)));

    const enrolled = results.filter((r) => r.status === "ENROLLED");
    const waitlisted = results.filter((r) => r.status === "WAITLISTED");
    expect(enrolled).toHaveLength(capacity);
    expect(waitlisted).toHaveLength(racers - capacity);

    // Every waitlist position is handed out exactly once: 1..45.
    const positions = waitlisted.map((r) => (r.status === "WAITLISTED" ? r.position : -1));
    expect(positions.sort((a, b) => a - b)).toEqual(
      Array.from({ length: racers - capacity }, (_, i) => i + 1),
    );

    const state = await expectInvariants(service, directory);
    expect(state.enrolled).toHaveLength(capacity);
    expect(state.waitlist).toHaveLength(racers - capacity);
  });

  it("serves requests in arrival order, so the waitlist is FIFO by call order", async () => {
    const { service, directory } = await setup(2, eligibleLearners("l", 10));
    const ids = Array.from({ length: 10 }, (_, i) => `l${i + 1}`);

    await Promise.all(ids.map((id) => service.enroll(id)));

    const state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual(["l1", "l2"]);
    expect(state.waitlist).toEqual(ids.slice(2));
  });

  it("creates one record when the same learner sends many enroll requests at once", async () => {
    const { service, directory } = await setup(3, eligibleLearners("l", 1));

    const results = await Promise.all(Array.from({ length: 10 }, () => service.enroll("l1")));

    expect(results.filter((r) => r.status === "ENROLLED")).toHaveLength(1);
    expect(results.filter((r) => r.status === "ALREADY_ENROLLED")).toHaveLength(9);
    expect((await expectInvariants(service, directory)).enrolled).toEqual(["l1"]);
  });

  it("drops once and promotes once when the same drop is sent many times at once", async () => {
    const { service, directory } = await setup(1, eligibleLearners("l", 3));
    for (const id of ["l1", "l2", "l3"]) await service.enroll(id);

    const results = await Promise.all(Array.from({ length: 10 }, () => service.drop("l1")));

    expect(results.filter((r) => r.status === "DROPPED")).toEqual([
      { status: "DROPPED", promoted: ["l2"] },
    ]);
    expect(results.filter((r) => r.status === "NOT_ENROLLED")).toHaveLength(9);

    const state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual(["l2"]);
    expect(state.waitlist).toEqual(["l3"]);
  });

  it("applies a mix of concurrent enrolls and drops exactly as if run one by one in arrival order", async () => {
    const { service, directory } = await setup(3, eligibleLearners("l", 12));
    for (let i = 1; i <= 8; i++) await service.enroll(`l${i}`); // enrolled l1-l3, waiting l4-l8

    const results = await Promise.all([
      service.drop("l1"), // l4 promoted
      service.enroll("l9"), // waitlisted
      service.drop("l2"), // l5 promoted
      service.enroll("l10"), // waitlisted
      service.drop("l5"), // l5 was promoted above, so this is a normal drop: l6 promoted
      service.enroll("l11"), // waitlisted
      service.drop("l1"), // repeated drop
      service.enroll("l12"), // waitlisted
    ]);

    expect(results).toEqual([
      { status: "DROPPED", promoted: ["l4"] },
      { status: "WAITLISTED", position: 5 },
      { status: "DROPPED", promoted: ["l5"] },
      { status: "WAITLISTED", position: 5 },
      { status: "DROPPED", promoted: ["l6"] },
      { status: "WAITLISTED", position: 5 },
      { status: "NOT_ENROLLED" },
      { status: "WAITLISTED", position: 6 },
    ]);
    const state = await expectInvariants(service, directory);
    expect(state.enrolled).toEqual(["l3", "l4", "l6"]);
    expect(state.waitlist).toEqual(["l7", "l8", "l9", "l10", "l11", "l12"]);
  });

  it("shares one lock across service instances for the same offering (no lost updates)", async () => {
    const { store, directory } = await setup(1, eligibleLearners("l", 20));
    const config = { offeringId: "CS201", capacity: 1, prerequisites: ["CS101"] };
    const instances = await Promise.all(
      Array.from({ length: 4 }, () => EnrollmentService.create(store, directory, config)),
    );
    const ids = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);

    // Spread the racers across the four instances.
    const results = await Promise.all(ids.map((id, i) => instances[i % 4]!.enroll(id)));

    expect(results.filter((r) => r.status === "ENROLLED")).toHaveLength(1);
    const state = await expectInvariants(instances[0]!, directory);
    expect(state.enrolled).toEqual(["l1"]);
    expect(state.waitlist).toEqual(ids.slice(1)); // nobody told WAITLISTED was lost
  });
});
