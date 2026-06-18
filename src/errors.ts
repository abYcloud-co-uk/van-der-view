/** An executor-level failure carrying a stable `code` for the CommandResult error. */
export class ExecutorError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A selector could not be resolved (unsupported/invalid selection). */
export class SelectionError extends ExecutorError {}

/** A load source could not be resolved to data/url. */
export class ResolveError extends ExecutorError {}
