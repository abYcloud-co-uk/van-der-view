import type { LoadSource, StructureFormat } from './types';
import { STRUCTURE_FORMATS } from './types';
import { ResolveError } from './errors';

/** Normalized input of the load-structure command. */
export interface LoadInput {
  source: LoadSource;
  id?: string;
  url?: string;
  data?: string;
  format?: StructureFormat;
}

/** What a resolver returns: either inline text or a URL, plus the format. */
export interface ResolvedStructure {
  data?: string;
  url?: string;
  format: StructureFormat;
  isBinary?: boolean;
}

/** Host-overridable hook that turns a LoadInput into fetchable data (e.g. auth/S3). */
export type ResolveStructure = (input: LoadInput) => Promise<ResolvedStructure>;

const rcsbCif = (id: string) => `https://files.rcsb.org/download/${id.toUpperCase()}.cif`;

/** Require a non-empty string field; the input is unvalidated JSON, so guard the type too. */
const requireString = (value: unknown, message: string): string => {
  if (typeof value !== 'string' || value.length === 0) throw new ResolveError('invalid_input', message);
  return value;
};

/** Default resolver: PDB id -> RCSB mmCIF; plain url; inline text. */
export const defaultResolveStructure: ResolveStructure = async (input) => {
  if (input.format !== undefined && !STRUCTURE_FORMATS.includes(input.format)) {
    throw new ResolveError(
      'invalid_input',
      `load-structure "format" must be one of ${STRUCTURE_FORMATS.join(', ')}.`,
    );
  }
  const format: StructureFormat = input.format ?? 'mmcif';
  switch (input.source) {
    case 'pdb':
      return {
        url: rcsbCif(requireString(input.id, 'load-structure source "pdb" requires a non-empty string "id".')),
        format: 'mmcif',
      };
    case 'url':
      return {
        url: requireString(input.url, 'load-structure source "url" requires a non-empty string "url".'),
        format,
      };
    case 'inline':
      return {
        data: requireString(input.data, 'load-structure source "inline" requires a non-empty string "data".'),
        format,
      };
    default:
      throw new ResolveError('invalid_input', `unknown load-structure source "${String(input.source)}".`);
  }
};
