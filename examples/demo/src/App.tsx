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

export function App() {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#111', color: '#eee' }}>
      <MolViewCanvas style={{ flex: 1, height: '100vh' }} onHover={setHover} />
      {hover && (
        <div
          style={{
            position: 'fixed',
            left: (hover.screen?.x ?? 0) + 14,
            top: (hover.screen?.y ?? 0) + 14,
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
          {hover.chain && (
            <div style={{ color: '#9cf', marginTop: 2 }}>
              {hover.chain} · {hover.residueName} {hover.residueNumber}
              {hover.atomName ? ` · ${hover.atomName}` : ''}
            </div>
          )}
        </div>
      )}
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
        {/* PANELS */}
      </div>
    </div>
  );
}
