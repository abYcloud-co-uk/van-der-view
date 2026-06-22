import type { CoordinatesInput } from './types';
import { COORDINATE_FORMATS } from './types';
import type { LoadInput, ResolvedStructure } from './resolve-structure';
import { ResolveError } from './errors';

/** What a coordinate resolver returns: a URL or raw bytes, plus the format. Always binary. */
export interface ResolvedCoordinates {
  url?: string;
  data?: Uint8Array;
  format: CoordinatesInput['format'];
  isBinary: true;
}

/** Host-overridable hook turning a CoordinatesInput into a fetchable stream (auth/S3/bytes). */
export type ResolveCoordinates = (input: CoordinatesInput) => Promise<ResolvedCoordinates>;

/** The agent-facing inputs to a trajectory load: a topology + a coordinate stream. */
export interface LoadTrajectoryInput {
  topology: LoadInput;
  coordinates: CoordinatesInput;
}

/** The fully-resolved inputs handed to the adapter's loadTrajectory. */
export interface ResolvedTrajectory {
  topology: ResolvedStructure;
  coordinates: ResolvedCoordinates;
}

/** Require a non-empty string field; input is unvalidated JSON, so guard the type too. */
const requireString = (value: unknown, message: string): string => {
  if (typeof value !== 'string' || value.length === 0) throw new ResolveError('invalid_input', message);
  return value;
};

/** Default resolver: pass a coordinate URL through with its (validated) format. */
export const defaultResolveCoordinates: ResolveCoordinates = async (input) => {
  if (!COORDINATE_FORMATS.includes(input.format)) {
    throw new ResolveError(
      'invalid_input',
      `load-trajectory coordinates "format" must be one of ${COORDINATE_FORMATS.join(', ')}.`,
    );
  }
  switch (input.source) {
    case 'url':
      return {
        url: requireString(input.url, 'load-trajectory coordinates source "url" requires a non-empty string "url".'),
        format: input.format,
        isBinary: true,
      };
    default:
      throw new ResolveError('invalid_input', `unknown load-trajectory coordinates source "${String(input.source)}".`);
  }
};
