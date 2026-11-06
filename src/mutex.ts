/**
 * Minimal async mutex built on a promise chain (DESIGN.md §7).
 * Tasks run one at a time, in the order `runExclusive` was called. A failing task does not
 * block the tasks queued after it.
 */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task);
    // Keep the chain alive whether the task succeeds or fails.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
