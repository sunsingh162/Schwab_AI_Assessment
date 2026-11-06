/**
 * Command-line prototype for the course waitlist (the brief's CLI fallback).
 *
 *   npm run demo   → scripted walkthrough of the main rules
 *   npm run cli    → interactive shell (type `help`)
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { EnrollmentService } from "./enrollment-service.js";
import { InMemoryLearnerDirectory, InMemoryOfferingStore } from "./store.js";
import type { DropResult, EnrollResult, OfferingState } from "./types.js";

const OFFERING = { offeringId: "CS201", capacity: 2, prerequisites: ["CS101"] };

function formatResult(result: EnrollResult | DropResult): string {
  switch (result.status) {
    case "WAITLISTED":
    case "ALREADY_WAITLISTED":
      return `${result.status} (position ${result.position})`;
    case "PREREQUISITE_NOT_MET":
      return `${result.status} (missing: ${result.missing.join(", ")})`;
    case "DROPPED":
      return result.promoted.length > 0
        ? `${result.status} (promoted: ${result.promoted.join(", ")})`
        : result.status;
    case "INVALID_REQUEST":
      return `${result.status} (${result.reason})`;
    default:
      return result.status;
  }
}

function formatState(state: OfferingState): string {
  const list = (ids: readonly string[]) => (ids.length > 0 ? ids.join(", ") : "-");
  return (
    `  ${state.offeringId}  seats ${state.enrolled.length}/${state.capacity}` +
    `  enrolled [${list(state.enrolled)}]  waitlist [${list(state.waitlist)}]`
  );
}

async function createDemo() {
  const directory = new InMemoryLearnerDirectory({
    alice: ["CS101"],
    bob: ["CS101"],
    cara: [],
    dan: ["CS101"],
    eve: ["CS101"],
  });
  const service = await EnrollmentService.create(new InMemoryOfferingStore(), directory, OFFERING);
  return { directory, service };
}

async function runScript(): Promise<void> {
  const { directory, service } = await createDemo();
  console.log(
    `Offering ${OFFERING.offeringId}: capacity ${OFFERING.capacity}, prerequisite ${OFFERING.prerequisites.join(", ")}`,
  );
  console.log("Learners: alice, bob, dan, eve have CS101; cara does not.\n");

  const step = async (label: string, action: () => Promise<EnrollResult | DropResult>) => {
    const result = await action();
    console.log(`> ${label.padEnd(22)} ${formatResult(result)}`);
    console.log(formatState(await service.snapshot()));
  };
  const note = (text: string) => console.log(`\n# ${text}`);

  await step("enroll alice", () => service.enroll("alice"));
  await step("enroll alice", () => service.enroll("alice"));
  await step("enroll cara", () => service.enroll("cara"));
  await step("enroll bob", () => service.enroll("bob"));
  await step("enroll dan", () => service.enroll("dan"));
  await step("enroll eve", () => service.enroll("eve"));

  note("dan's record loses CS101 while waiting");
  directory.setCompletedCourses("dan", []);
  await step("drop alice", () => service.drop("alice"));
  note("dan was skipped but kept first place; eve got the seat");

  await step("drop alice", () => service.drop("alice"));
  await step('drop ""', () => service.drop(""));
  await step("enroll ghost", () => service.enroll("ghost"));

  note("dan's record regains CS101");
  directory.setCompletedCourses("dan", ["CS101"]);
  await step("drop bob", () => service.drop("bob"));
  note("dan is promoted from the place they kept");
}

const HELP = `Commands:
  enroll <id>                 enroll a learner
  drop <id>                   drop a learner (enrolled or waitlisted)
  learner <id> [course ...]   add or update a learner's completed courses
  show                        show the offering
  help                        show this help
  quit                        exit`;

async function runInteractive(): Promise<void> {
  const { directory, service } = await createDemo();
  console.log(
    `Offering ${OFFERING.offeringId}: capacity ${OFFERING.capacity}, prerequisite ${OFFERING.prerequisites.join(", ")}`,
  );
  console.log("Seeded learners: alice, bob, dan, eve (have CS101), cara (does not).");
  console.log(HELP);

  // Line iteration (rather than rl.question) also works when commands are piped in.
  const rl = createInterface({ input: stdin, output: stdout, prompt: "> " });
  rl.prompt();
  for await (const line of rl) {
    if (!stdin.isTTY) console.log(line); // echo piped commands so the transcript is readable
    const [command = "", ...args] = line.trim().split(/\s+/);
    if (command === "quit" || command === "exit") break;
    await handle(command, args);
    rl.prompt();
  }
  rl.close();

  async function handle(command: string, args: string[]): Promise<void> {
    switch (command) {
      case "enroll":
        console.log(formatResult(await service.enroll(args[0] ?? "")));
        break;
      case "drop":
        console.log(formatResult(await service.drop(args[0] ?? "")));
        break;
      case "learner":
        if (args[0] === undefined) {
          console.log("usage: learner <id> [course ...]");
          return;
        }
        directory.setCompletedCourses(args[0], args.slice(1));
        console.log(`${args[0]} completed: [${args.slice(1).join(", ")}]`);
        return;
      case "show":
        break;
      case "help":
        console.log(HELP);
        return;
      case "":
        return;
      default:
        console.log(`unknown command "${command}". Type help.`);
        return;
    }
    console.log(formatState(await service.snapshot()));
  }
}

const main = process.argv.includes("--interactive") ? runInteractive : runScript;
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
