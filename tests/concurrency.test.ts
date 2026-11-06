/**
 * Concurrency tests (acceptance criterion 6, DESIGN.md §7).
 *
 * Requests are fired together with Promise.all. The in-memory store and directory yield to the
 * event loop on every call, so without the service's mutex these operations would interleave
 * between load and save, the way they would against a real database.
 */
import { describe, expect, it } from "vitest";
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

  it("keeps every learner accounted for under a mix of concurrent enrolls and drops", async () => {
    const { service, directory } = await setup(3, eligibleLearners("l", 12));
    for (let i = 1; i <= 8; i++) await service.enroll(`l${i}`); // 3 enrolled, 5 waiting

    await Promise.all([
      service.drop("l1"),
      service.enroll("l9"),
      service.drop("l2"),
      service.enroll("l10"),
      service.drop("l5"), // leaves the waitlist
      service.enroll("l11"),
      service.drop("l1"), // repeated
      service.enroll("l12"),
    ]);

    const state = await expectInvariants(service, directory);
    expect(state.enrolled).toHaveLength(3);
    // 12 learners joined; l1, l2 dropped and l5 left the waitlist, so 9 remain in total.
    expect(state.enrolled.length + state.waitlist.length).toBe(9);
    expect([...state.enrolled, ...state.waitlist]).not.toContain("l1");
  });
});
