/**
 * The closed set of stable error codes the executor emits in a CommandResult.
 * Typing `ExecutorError.code` against this catches typos and divergent codes at
 * compile time (the public `CommandResult.error.code` stays a plain string so
 * consumers aren't forced to switch exhaustively on a set that may grow).
 */
export type ErrorCode =
  | 'invalid_input'
  | 'invalid_selection'
  | 'unsupported_selection' // reserved; retained for API compatibility (no longer thrown in v1)
  | 'no_structure'
  | 'no_trajectory'
  | 'trajectory_mismatch'
  | 'empty_selection'
  | 'unknown_command'
  | 'internal_error';

/** An executor-level failure carrying a stable `code` for the CommandResult error. */
export class ExecutorError extends Error {
  constructor(public readonly code: ErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A selector could not be resolved (unsupported/invalid selection). */
export class SelectionError extends ExecutorError {}

/** A load source could not be resolved to data/url. */
export class ResolveError extends ExecutorError {}
