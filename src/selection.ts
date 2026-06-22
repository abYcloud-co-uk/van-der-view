import { Script } from 'molstar/lib/mol-script/script';
import { QueryContext, Structure, StructureElement, StructureSelection } from 'molstar/lib/mol-model/structure';
import { StructureSelectionQueries } from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query';
import type { StructureSelectionQuery } from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query';
import type { Numbering, ResidueRef, Selection, SelectionPreset } from './types';
import { NUMBERINGS, SELECTION_PRESETS } from './types';
import { SelectionError } from './errors';

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate the (LLM-supplied, possibly malformed) residues field into a clean
 * ResidueRef[]. Ranges are normalized to [lo, hi] so a reversed `[end, start]`
 * still selects the intended span. Throws SelectionError on any wrong-typed entry.
 */
function validateResidues(residues: unknown[]): ResidueRef[] {
  return residues.map((r) => {
    if (isFiniteNumber(r)) return r;
    if (Array.isArray(r)) {
      if (r.length !== 2 || !isFiniteNumber(r[0]) || !isFiniteNumber(r[1])) {
        throw new SelectionError(
          'invalid_selection',
          'a residue range must be a [start, end] pair of numbers.',
        );
      }
      return [Math.min(r[0], r[1]), Math.max(r[0], r[1])] as [number, number];
    }
    throw new SelectionError(
      'invalid_selection',
      'each residue must be a number or a [start, end] pair.',
    );
  });
}

/**
 * The 7 v1 presets → Mol*'s own selection queries. All are pure (no plugin/WebGL/async).
 * Using Mol* query reuse (StructureSelectionQueries) rather than hand-rolled mol-script
 * expressions, because the upstream queries are correct, maintained, and already tested.
 */
const PRESET_QUERIES: Record<SelectionPreset, StructureSelectionQuery> = {
  all: StructureSelectionQueries.all,
  polymer: StructureSelectionQueries.polymer,
  protein: StructureSelectionQueries.protein,
  nucleic: StructureSelectionQueries.nucleic,
  ligand: StructureSelectionQueries.ligand,
  ion: StructureSelectionQueries.ion,
  water: StructureSelectionQueries.water,
};

/**
 * Resolve our LLM-friendly Selection to a Mol* loci against a loaded Structure.
 * Pure data-model (no plugin/WebGL). The executor hands us arbitrary JSON the
 * model produced, so we validate field types/values here and throw SelectionError
 * for unsupported/invalid selectors; an empty (no-match) loci is returned, not
 * thrown — the caller decides.
 */
export function resolveSelection(selection: Selection, structure: Structure): StructureElement.Loci {
  if (selection.preset !== undefined) {
    if (!SELECTION_PRESETS.includes(selection.preset)) {
      throw new SelectionError('invalid_selection', `unknown selection preset "${String(selection.preset)}".`);
    }
    const sel = PRESET_QUERIES[selection.preset].query(new QueryContext(structure));
    return StructureSelection.toLociWithSourceUnits(sel);
  }

  if (selection.chain !== undefined && typeof selection.chain !== 'string') {
    throw new SelectionError('invalid_selection', 'selection "chain" must be a string.');
  }

  let residues: ResidueRef[] | undefined;
  if (selection.residues !== undefined) {
    if (!Array.isArray(selection.residues)) {
      throw new SelectionError('invalid_selection', 'selection "residues" must be an array.');
    }
    residues = selection.residues.length > 0 ? validateResidues(selection.residues) : undefined;
  }

  if (selection.chain === undefined && residues === undefined) {
    throw new SelectionError('invalid_selection', 'selection must include a chain and/or residues.');
  }

  if (selection.numbering !== undefined && !NUMBERINGS.includes(selection.numbering)) {
    throw new SelectionError(
      'invalid_selection',
      `selection "numbering" must be one of ${NUMBERINGS.join(', ')}.`,
    );
  }
  const numbering: Numbering = selection.numbering ?? 'auth';
  const asymProp = numbering === 'auth' ? 'auth_asym_id' : 'label_asym_id';
  const seqProp = numbering === 'auth' ? 'auth_seq_id' : 'label_seq_id';

  // MolScript's builder is loosely typed (Expression); `as any` on the params is expected.
  const sel = Script.getStructureSelection((b) => {
    const tests: Record<string, unknown> = {};
    if (selection.chain !== undefined) {
      tests['chain-test'] = b.core.rel.eq([b.ammp(asymProp), selection.chain]);
    }
    if (residues !== undefined) {
      const rt = residues.map((r) =>
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
