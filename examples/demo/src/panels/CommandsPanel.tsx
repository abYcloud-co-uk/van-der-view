import { useState } from 'react';
import { useMolView } from '@abycloud-co-uk/van-der-view/browser';
import type { Command, CommandResult } from '@abycloud-co-uk/van-der-view';
import { Panel, ResultView } from '../ui';

export function CommandsPanel() {
  const viewer = useMolView();
  const [result, setResult] = useState<CommandResult>();
  const [zoomOut, setZoomOut] = useState(1);
  const disabled = !viewer;
  const run = async (command: Command) => setResult(await viewer!.dispatch(command));
  return (
    <Panel title="Commands">
      <button disabled={disabled} onClick={() => run({ name: 'highlight', input: { selection: { chain: 'A' } } })}>
        Highlight chain A
      </button>{' '}
      <button disabled={disabled} onClick={() => run({ name: 'highlight', input: { selection: { preset: 'ligand' } } })}>
        Highlight ligand
      </button>{' '}
      <button disabled={disabled} onClick={() => viewer!.clearHighlight()}>
        Clear highlight
      </button>
      <hr style={{ borderColor: '#333' }} />
      <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
        zoomOut factor: {zoomOut.toFixed(1)}
        <input
          type="range"
          min={1}
          max={4}
          step={0.1}
          value={zoomOut}
          onChange={(e) => setZoomOut(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </label>
      <button
        disabled={disabled}
        onClick={() => run({ name: 'focus', input: { selection: { chain: 'A' }, zoomOut, durationMs: 250 } })}
      >
        Focus chain A
      </button>{' '}
      <button disabled={disabled} onClick={() => run({ name: 'reset-camera', input: {} })}>
        Reset camera
      </button>
      <ResultView result={result} />
    </Panel>
  );
}
