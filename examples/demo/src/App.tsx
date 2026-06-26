import { useState } from 'react';
import { MolViewCanvas, type HoverInfo } from '@abycloud-co-uk/van-der-view/browser';
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
    <>
      <MolViewCanvas style={{ flex: 1, height: '100vh' }} onHover={setHover} />
      {/* Render only when we have a position (`screen` may be absent on a non-pointer emit), so the
          tooltip never pins to the corner. `screen` is pageX/pageY (document coords); this demo is
          full-viewport and non-scrolling, so position:fixed needs no scroll offset — a scrolling
          host would subtract window.scrollX/scrollY. */}
      {hover?.screen && (
        <div
          style={{
            position: 'fixed',
            left: hover.screen.x + 14,
            top: hover.screen.y + 14,
            pointerEvents: 'none',
            background: 'rgba(0,0,0,0.85)',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 12,
            maxWidth: 320,
            zIndex: 10,
          }}
        >
          <div>{hover.label}</div>
          {/* `!= null`, not truthiness — a real blank auth chain id ('') still has residue detail. */}
          {hover.chain != null && (
            <div style={{ color: '#9cf', marginTop: 2 }}>
              {hover.chain} · {hover.residueName} {hover.residueNumber}
              {hover.atomName ? ` · ${hover.atomName}` : ''}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function App() {
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#111', color: '#eee' }}>
      <HoverLayer />
      <div style={{ width: 380, overflowY: 'auto', padding: 16, background: '#181818', borderLeft: '1px solid #333' }}>
        <h1 style={{ fontSize: 16, marginTop: 0 }}>van-der-view demo</h1>
        <LoadPanel />
        <TrajectoryPanel />
        <CommandsPanel />
        <RepresentationPanel />
        <SceneContextPanel />
        <StepperPanel />
        <PasteToolUsePanel />
        <XrPanel />
        <SupersedePanel />
        {/* PANELS */}
      </div>
    </div>
  );
}
