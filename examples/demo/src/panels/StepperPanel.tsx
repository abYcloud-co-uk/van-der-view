import { useEffect, useState } from 'react';
import { useMolView } from 'van-der-view/browser';
import type { Command, CommandResult } from 'van-der-view';
import { Panel, ResultView } from '../ui';
import { FIXTURE_1CRN } from '../fixtures';

const SEQUENCE: Command[] = [
  { name: 'load-structure', input: { source: 'inline', data: FIXTURE_1CRN, format: 'pdb' } },
  { name: 'highlight', input: { selection: { chain: 'A' } } },
  { name: 'focus', input: { selection: { chain: 'A' }, zoomOut: 2 } },
  { name: 'reset-camera', input: {} },
];

export function StepperPanel() {
  const viewer = useMolView();
  const [i, setI] = useState(0);
  const [result, setResult] = useState<CommandResult>();
  const pos = i % SEQUENCE.length;

  const next = async () => {
    if (!viewer) return;
    setResult(await viewer.dispatch(SEQUENCE[pos]));
    setI((n) => n + 1);
  };

  // No dependency array: re-bind each render so the listener always closes over
  // the current `viewer`/`pos`. Cheap for a single-key demo handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') void next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Panel title="Sequence stepper">
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        step {pos} / {SEQUENCE.length}: <code>{SEQUENCE[pos].name}</code>
      </div>
      <button disabled={!viewer} onClick={() => void next()}>
        Next ▶ (or press Enter)
      </button>
      <ResultView result={result} />
    </Panel>
  );
}
