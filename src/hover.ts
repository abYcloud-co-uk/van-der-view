import { Loci } from 'molstar/lib/mol-model/loci';
import { StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { lociLabel } from 'molstar/lib/mol-theme/label';
import type { InteractivityManager } from 'molstar/lib/mol-plugin-state/manager/interactivity';

/**
 * Host-facing info about whatever is currently under the pointer, surfaced so a host can
 * render its own tooltip on the bare canvas without reaching into Mol* internals (#29).
 */
export interface HoverInfo {
  /** Ready-to-display, plain-text label — `lociLabel(loci, { htmlStyling: false })`, the same
   *  content Mol*'s native viewport tooltip shows. */
  label: string;
  /** auth chain id (e.g. 'A'); present only for a structure-element loci. */
  chain?: string;
  /** residue name (auth_comp_id, e.g. 'GLY'); structure-element loci only. */
  residueName?: string;
  /** residue number (auth_seq_id); structure-element loci only. */
  residueNumber?: number;
  /** atom name (auth_atom_id, e.g. 'CA') — only when the hovered loci is a single atom;
   *  omitted at residue/chain granularity, where it would be a misleading "first atom". */
  atomName?: string;
  /** screen coords (pageX/pageY) from the hover event; absent on non-pointer emits. */
  screen?: { x: number; y: number };
  /** the raw molstar loci, for advanced hosts. */
  loci: Loci;
}

/**
 * Map a Mol* hover event to a `HoverInfo`, or `null` when nothing is under the pointer
 * (empty loci — pointer left the structure). Pure: no plugin/WebGL — `lociLabel` and the
 * StructureProperties accessors run in Node. The real loci is `event.current.loci`.
 */
export function toHoverInfo(event: InteractivityManager.HoverEvent): HoverInfo | null {
  const loci = event.current.loci;
  if (Loci.isEmpty(loci)) return null;

  const info: HoverInfo = { label: lociLabel(loci, { htmlStyling: false }), loci };
  if (event.page) info.screen = { x: event.page[0], y: event.page[1] };

  if (StructureElement.Loci.is(loci)) {
    const loc = StructureElement.Location.create(loci.structure);
    // First non-empty element is representative for chain/residue (a hover loci at residue
    // granularity shares them across all its atoms).
    for (const e of loci.elements) {
      if (OrderedSet.size(e.indices) === 0) continue;
      loc.unit = e.unit;
      loc.element = e.unit.elements[OrderedSet.getAt(e.indices, 0)];
      info.chain = StructureProperties.chain.auth_asym_id(loc);
      info.residueName = StructureProperties.residue.auth_comp_id(loc);
      info.residueNumber = StructureProperties.residue.auth_seq_id(loc);
      if (StructureElement.Loci.size(loci) === 1) {
        info.atomName = StructureProperties.atom.auth_atom_id(loc);
      }
      break;
    }
  }
  return info;
}

/** Minimal structural shape of the Mol* hover Subject (`plugin.behaviors.interaction.hover`),
 *  so the wiring is testable with a fake source and needs no rxjs import. */
export interface HoverSource {
  subscribe(observer: (event: InteractivityManager.HoverEvent) => void): { unsubscribe(): void };
}

/**
 * Subscribe to a hover source, deliver each event mapped through `toHoverInfo` (or `null`)
 * to `cb`, and return an unsubscribe. Both the mapping and the host callback are contained:
 * a throw must not propagate into the rxjs Subject, which is the SAME Subject that drives
 * Mol*'s hover-highlight — an uncontained throw would break core rendering, not just the host.
 * If `toHoverInfo` itself throws, the error is logged and the callback receives `null`
 * (treated as 'nothing hovered'), so a mapping failure clears a tooltip rather than leaving
 * stale data.
 */
export function subscribeHoverEvents(
  source: HoverSource,
  cb: (info: HoverInfo | null) => void,
): () => void {
  const sub = source.subscribe((event) => {
    let info: HoverInfo | null = null;
    try {
      info = toHoverInfo(event);
    } catch (err) {
      console.error('[van-der-view] subscribeHover: toHoverInfo failed:', err);
    }
    try {
      cb(info);
    } catch (err) {
      console.error('[van-der-view] subscribeHover callback threw:', err);
    }
  });
  return () => sub.unsubscribe();
}
