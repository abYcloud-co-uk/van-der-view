import { useState } from 'react';
import { useMolView } from '@abycloud-co-uk/van-der-view/browser';
import type { CommandResult } from '@abycloud-co-uk/van-der-view';
import { Panel, ResultView } from '../ui';
import { FIXTURE_1CRN, FIXTURE_1HSG_ID } from '../fixtures';

export function LoadPanel() {
  const viewer = useMolView();
  const [result, setResult] = useState<CommandResult>();
  const disabled = !viewer;
  return (
    <Panel title="Load">
      <button
        disabled={disabled}
        onClick={async () =>
          setResult(
            await viewer!.dispatch({
              name: 'load-structure',
              input: { source: 'inline', data: FIXTURE_1CRN, format: 'pdb' },
            }),
          )
        }
      >
        Load 1CRN (inline)
      </button>{' '}
      <button
        disabled={disabled}
        onClick={async () =>
          setResult(
            await viewer!.dispatch({ name: 'load-structure', input: { source: 'pdb', id: FIXTURE_1HSG_ID } }),
          )
        }
      >
        Load 1HSG (pdb)
      </button>
      <ResultView result={result} />
    </Panel>
  );
}
