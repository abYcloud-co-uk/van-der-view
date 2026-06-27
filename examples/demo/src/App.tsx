import { useState } from 'react';
import { MolViewCanvas, type HoverInfo } from '@abycloud-co-uk/van-der-view/browser';
import { AgentPanel } from './panels/AgentPanel';
import { LoadPanel } from './panels/LoadPanel';
import { CommandsPanel } from './panels/CommandsPanel';
import { SceneContextPanel } from './panels/SceneContextPanel';
import { StepperPanel } from './panels/StepperPanel';
import { PasteToolUsePanel } from './panels/PasteToolUsePanel';
import { XrPanel } from './panels/XrPanel';
import { TrajectoryPanel } from './panels/TrajectoryPanel';
import { RepresentationPanel } from './panels/RepresentationPanel';
import { SupersedePanel } from './panels/SupersedePanel';

/**
 * Canvas + a cursor-following hover tooltip. Owns the hover state HERE (not in `App`) so a
 * pointer-move re-renders only this subtree — the panel column is spared.
 */
function HoverLayer() {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  return (
    <div className="vdv-canvas">
      <MolViewCanvas style={{ width: '100%', height: '100vh' }} onHover={setHover} />
      {/* Render only when we have a position (`screen` may be absent on a non-pointer emit), so the
          tooltip never pins to the corner. `screen` is pageX/pageY (document coords); this demo is
          full-viewport and non-scrolling, so position:fixed needs no scroll offset — a scrolling
          host would subtract window.scrollX/scrollY. */}
      {hover?.screen && (
        <div className="vdv-tooltip" style={{ left: hover.screen.x + 14, top: hover.screen.y + 14 }}>
          <div>{hover.label}</div>
          {/* `!= null`, not truthiness — a real blank auth chain id ('') still has residue detail. */}
          {hover.chain != null && (
            <div className="vdv-tooltip__meta">
              {hover.chain} · {hover.residueName} {hover.residueNumber}
              {hover.atomName ? ` · ${hover.atomName}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <div className="vdv-app">
      <HoverLayer />
      <aside className="vdv-rail">
        <div className="vdv-rail__brand">
          <h1>
            van-der-<span className="vdv-accent">view</span>
          </h1>
          <span className="vdv-tag">Molecular AI Canvas</span>
        </div>

        {/* Primary surface: the conversational agent. */}
        <AgentPanel />

        {/* Everything else is developer tooling, tucked into a collapsible drawer. */}
        <details className="vdv-drawer">
          <summary>Dev tools</summary>
          <LoadPanel />
          <TrajectoryPanel />
          <CommandsPanel />
          <RepresentationPanel />
          <SceneContextPanel />
          <StepperPanel />
          <PasteToolUsePanel />
          <XrPanel />
          <SupersedePanel />
        </details>
      </aside>
    </div>
  );
}
