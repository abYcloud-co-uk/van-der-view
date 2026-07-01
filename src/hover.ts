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
   *  content Mol*'s native viewport tooltip shows. Authoritative for the WHOLE loci. */
  label: string;
  /** auth chain id (e.g. 'A') of the loci's **first element** (a representative); structure-element
   *  loci only. At the default hover granularity the loci is a single residue/atom, so this — and
   *  the two fields below — describe exactly what `label` does. For a coarser loci that spans
   *  multiple residues/chains they reflect only the first element, so prefer `label` (or `loci`)
   *  when a hover may span more than one residue. */
  chain?: string;
  /** residue name (auth_comp_id, e.g. 'GLY') of the representative first element; see `chain`. */
  residueName?: string;
  /** residue number (auth_seq_id) of the representative first element; see `chain`. */
  residueNumber?: number;
  /** atom name (auth_atom_id, e.g. 'CA') — only when the hovered loci is a single atom;
   *  omitted at residue/chain granularity, where it would be a misleading "first atom". */
  atomName?: string;
  /** Pointer position as **viewport/client coordinates** (like `clientX/clientY`): drop it
   *  straight into a `position: fixed` tooltip (`left: screen.x, top: screen.y`) and it is
   *  correct wherever the canvas sits on the page. Absent on non-pointer emits. (Converted from
   *  Mol*'s canvas-relative hover coord at the browser seam — see `subscribeHoverEvents`.) */
  screen?: { x: number; y: number };
  /** the raw molstar loci, for advanced hosts. */
  loci: Loci;
}

/** The first non-empty element of a structure-element loci as a reusable Location — the
 *  representative the structured `HoverInfo` fields are read from. Returns `null` if no element
 *  is populated. (Hover loci at the default granularity hold a single residue/atom, so the first
 *  element represents the whole loci.) */
function firstLocation(loci: StructureElement.Loci): StructureElement.Location | null {
  const loc = StructureElement.Location.create(loci.structure);
  for (const e of loci.elements) {
    if (OrderedSet.size(e.indices) === 0) continue;
    loc.unit = e.unit;
    loc.element = e.unit.elements[OrderedSet.getAt(e.indices, 0)];
    return loc;
  }
  return null;
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
  // event.page is Mol*'s CANVAS-RELATIVE pointer position (misleadingly named — it is NOT DOM
  // pageX/pageY; y is canvas-internal). Kept raw here so this stays pure; the browser seam
  // (createMolView.subscribeHover) converts it to viewport coords before a host sees it.
  if (event.page) info.screen = { x: event.page[0], y: event.page[1] };

  if (StructureElement.Loci.is(loci)) {
    const loc = firstLocation(loci);
    if (loc) {
      info.chain = StructureProperties.chain.auth_asym_id(loc);
      info.residueName = StructureProperties.residue.auth_comp_id(loc);
      info.residueNumber = StructureProperties.residue.auth_seq_id(loc);
      if (StructureElement.Loci.size(loci) === 1) {
        info.atomName = StructureProperties.atom.auth_atom_id(loc);
      }
    }
  }
  return info;
}

/**
 * Convert a canvas-relative pointer position (what Mol*'s hover event carries — see the
 * `event.page` note in `toHoverInfo`) to viewport/client coordinates by adding the canvas's
 * on-screen offset. `rect` is the canvas element's `getBoundingClientRect()`. Pure: the DOM
 * read (the rect) is done at the browser seam (`createMolView`), keeping this Node-testable.
 */
export function viewportFromCanvasRelative(
  rect: { left: number; top: number },
  p: { x: number; y: number },
): { x: number; y: number } {
  return { x: rect.left + p.x, y: rect.top + p.y };
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
 *
 * The source is a `BehaviorSubject`, which replays its current value synchronously on subscribe.
 * That seed is dropped when it carries no hover (the usual state at mount), so the host never
 * gets a phantom `null` before the pointer has moved; a seed that already carries a hover
 * (subscribed mid-hover) IS delivered. Real "pointer left" nulls after the seed always deliver.
 */
export function subscribeHoverEvents(
  source: HoverSource,
  cb: (info: HoverInfo | null) => void,
  transformScreen?: (p: { x: number; y: number }) => { x: number; y: number },
): () => void {
  let primed = false;
  const sub = source.subscribe((event) => {
    let info: HoverInfo | null = null;
    try {
      info = toHoverInfo(event);
    } catch (err) {
      console.error('[van-der-view] subscribeHover: toHoverInfo failed:', err);
    }
    // event.page is canvas-relative; the browser seam supplies a transform to viewport coords.
    // A direct caller with no transform leaves screen canvas-relative.
    if (info?.screen && transformScreen) info.screen = transformScreen(info.screen);
    // Drop only a leading "nothing hovered" seed (the BehaviorSubject's initial replay); deliver
    // everything after, and deliver a seed that is itself a hover.
    if (!primed) {
      primed = true;
      if (info === null) return;
    }
    try {
      cb(info);
    } catch (err) {
      console.error('[van-der-view] subscribeHover callback threw:', err);
    }
  });
  return () => sub.unsubscribe();
}
