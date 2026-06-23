import { useState } from 'react';
import { useMolView } from '@abycloud-co-uk/van-der-view/browser';
import type { Command, CommandResult } from '@abycloud-co-uk/van-der-view';
import { Panel, ResultView } from '../ui';

const REPS = ['cartoon', 'ball-and-stick', 'spacefill', 'molecular-surface'] as const;
const SCHEMES = ['element', 'chain', 'b-factor', 'secondary-structure'] as const;

export function RepresentationPanel() {
  const viewer = useMolView();
  const [result, setResult] = useState<CommandResult>();
  const disabled = !viewer;
  const run = async (command: Command) => setResult(await viewer!.dispatch(command));
  const sel = { chain: 'A' };

  return (
    <Panel title="Representation (v1.1a)">
      <div style={{ fontSize: 12, marginBottom: 4 }}>set-representation (chain A)</div>
      {REPS.map((type) => (
        <button key={type} disabled={disabled} onClick={() => run({ name: 'set-representation', input: { selection: sel, type } })}>
          {type}
        </button>
      ))}
      <hr style={{ borderColor: '#333' }} />
      <div style={{ fontSize: 12, marginBottom: 4 }}>set-color (chain A)</div>
      {SCHEMES.map((scheme) => (
        <button key={scheme} disabled={disabled} onClick={() => run({ name: 'set-color', input: { selection: sel, scheme } })}>
          {scheme}
        </button>
      ))}{' '}
      <button disabled={disabled} onClick={() => run({ name: 'set-color', input: { selection: sel, color: '#1e90ff' } })}>
        hex #1e90ff
      </button>
      <hr style={{ borderColor: '#333' }} />
      <button disabled={disabled} onClick={() => run({ name: 'toggle-visibility', input: { selection: sel, visible: false } })}>
        hide A
      </button>{' '}
      <button disabled={disabled} onClick={() => run({ name: 'toggle-visibility', input: { selection: sel, visible: true } })}>
        show A
      </button>{' '}
      <button disabled={disabled} onClick={() => run({ name: 'add-label', input: { selection: sel, text: 'chain A' } })}>
        label A
      </button>
      <hr style={{ borderColor: '#333' }} />
      <button
        disabled={disabled}
        onClick={() => run({ name: 'measure-distance', input: { from: { chain: 'A' }, to: { chain: 'B' } } })}
      >
        distance A↔B
      </button>
      <ResultView result={result} />
    </Panel>
  );
}
