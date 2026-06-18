import { Script } from 'molstar/lib/mol-script/script';
import { Structure, StructureElement, StructureSelection } from 'molstar/lib/mol-model/structure';
import type { Selection } from './types';
import { SelectionError } from './errors';

/**
 * Resolve our LLM-friendly Selection to a Mol* loci against a loaded Structure.
 * Pure data-model (no plugin/WebGL). Throws SelectionError for unsupported/invalid
 * selectors; an empty (no-match) loci is returned, not thrown — the caller decides.
 */
export function resolveSelection(selection: Selection, structure: Structure): StructureElement.Loci {
  if (selection.preset !== undefined) {
    throw new SelectionError(
      'unsupported_selection',
      `preset selectors are not supported yet (got "${selection.preset}").`,
    );
  }
  const hasResidues = selection.residues !== undefined && selection.residues.length > 0;
  if (selection.chain === undefined && !hasResidues) {
    throw new SelectionError('invalid_selection', 'selection must include a chain and/or residues.');
  }

  const numbering = selection.numbering ?? 'auth';
  const asymProp = numbering === 'auth' ? 'auth_asym_id' : 'label_asym_id';
  const seqProp = numbering === 'auth' ? 'auth_seq_id' : 'label_seq_id';

  // MolScript's builder is loosely typed (Expression); `as any` on the params is expected.
  const sel = Script.getStructureSelection((b) => {
    const tests: Record<string, unknown> = {};
    if (selection.chain !== undefined) {
      tests['chain-test'] = b.core.rel.eq([b.ammp(asymProp), selection.chain]);
    }
    if (hasResidues) {
      const rt = selection.residues!.map((r) =>
        Array.isArray(r)
          ? b.core.rel.inRange([b.ammp(seqProp), r[0], r[1]]) // inRange(value, min, max)
          : b.core.rel.eq([b.ammp(seqProp), r]),
      );
      tests['residue-test'] = rt.length === 1 ? rt[0] : b.core.logic.or(rt);
    }
    return b.struct.generator.atomGroups(tests as any);
  }, structure);

  return StructureSelection.toLociWithSourceUnits(sel);
}
