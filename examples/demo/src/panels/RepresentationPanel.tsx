import { useState } from 'react';
import { useMolView } from '@abycloud-co-uk/van-der-view/browser';
import type { Command, CommandResult } from '@abycloud-co-uk/van-der-view';
import { Panel, ResultView } from '../ui';

const REPS = ['cartoon', 'ball-and-stick', 'spacefill', 'molecular-surface'] as const;
const SCHEMES = ['element', 'chain', 'b-factor', 'secondary-structure'] as const;
const TARGETS = ['A', 'B'] as const;

export function RepresentationPanel() {
  const viewer = useMolView();
  const [result, setResult] = useState<CommandResult>();
  // The active selection target. Switch to B (load 1HSG first) to verify cross-selection
  // composition: color A then B → both persist; b-factor on A → only A recolors.
  const [target, setTarget] = useState<(typeof TARGETS)[number]>('A');
  const disabled = !viewer;
  const run = async (command: Command) => setResult(await viewer!.dispatch(command));
  const sel = { chain: target };

  return (
    <Panel title="Representation (v1.1a)">
      <div style={{ fontSize: 12, marginBottom: 4 }}>target chain (B needs 1HSG)</div>
      {TARGETS.map((t) => (
        <button
          key={t}
          disabled={disabled}
          onClick={() => setTarget(t)}
          style={{ fontWeight: target === t ? 700 : 400 }}
        >
          chain {t}
        </button>
      ))}
      <hr style={{ borderColor: '#333' }} />
      <div style={{ fontSize: 12, marginBottom: 4 }}>set-representation (chain {target})</div>
      {REPS.map((type) => (
        <button key={type} disabled={disabled} onClick={() => run({ name: 'set-representation', input: { selection: sel, type } })}>
          {type}
        </button>
      ))}
      <hr style={{ borderColor: '#333' }} />
      <div style={{ fontSize: 12, marginBottom: 4 }}>set-color (chain {target})</div>
      {SCHEMES.map((scheme) => (
        <button key={scheme} disabled={disabled} onClick={() => run({ name: 'set-color', input: { selection: sel, scheme } })}>
          {scheme}
        </button>
      ))}{' '}
      <button disabled={disabled} onClick={() => run({ name: 'set-color', input: { selection: sel, color: '#1e90ff' } })}>
        hex blue
      </button>{' '}
      <button disabled={disabled} onClick={() => run({ name: 'set-color', input: { selection: sel, color: '#e11d48' } })}>
        hex red
      </button>
      <hr style={{ borderColor: '#333' }} />
      <button disabled={disabled} onClick={() => run({ name: 'toggle-visibility', input: { selection: sel, visible: false } })}>
        hide {target}
      </button>{' '}
      <button disabled={disabled} onClick={() => run({ name: 'toggle-visibility', input: { selection: sel, visible: true } })}>
        show {target}
      </button>{' '}
      <button disabled={disabled} onClick={() => run({ name: 'add-label', input: { selection: sel, text: `chain ${target}` } })}>
        label {target}
      </button>
      <hr style={{ borderColor: '#333' }} />
      <button
        disabled={disabled}
        onClick={() =>
          run({
            name: 'measure-distance',
            input: { from: { chain: 'A', residues: [1] }, to: { chain: 'A', residues: [46] } },
          })
        }
      >
        distance res1↔res46
      </button>
      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
        v2 model: each selection owns its component — color persists across representation
        changes, schemes apply per-selection, and coloring one chain leaves the other intact.
      </div>
      <ResultView result={result} />
    </Panel>
  );
}
