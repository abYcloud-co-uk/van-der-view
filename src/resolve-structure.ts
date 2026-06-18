import type { LoadSource, StructureFormat } from './types';
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

/** Default resolver: PDB id -> RCSB mmCIF; plain url; inline text. */
export const defaultResolveStructure: ResolveStructure = async (input) => {
  const format: StructureFormat = input.format ?? 'mmcif';
  switch (input.source) {
    case 'pdb':
      if (!input.id) throw new ResolveError('invalid_input', 'load-structure source "pdb" requires "id".');
      return { url: rcsbCif(input.id), format: 'mmcif' };
    case 'url':
      if (!input.url) throw new ResolveError('invalid_input', 'load-structure source "url" requires "url".');
      return { url: input.url, format };
    case 'inline':
      if (!input.data) throw new ResolveError('invalid_input', 'load-structure source "inline" requires "data".');
      return { data: input.data, format };
    default:
      throw new ResolveError('invalid_input', `unknown load-structure source "${String(input.source)}".`);
  }
};
