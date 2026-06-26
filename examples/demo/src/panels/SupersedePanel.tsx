import { useState } from 'react';
import { useMolView } from '@abycloud-co-uk/van-der-view/browser';
import type { CommandResult } from '@abycloud-co-uk/van-der-view';
import { Panel } from '../ui';

const code = (r: CommandResult) => (r.ok ? 'ok' : r.error.code);

/** Manual GPU verification for #27 (supersession + dedup). The library has no LLM here;
 *  these buttons fire raw load-structure commands so the result codes are observable. */
export function SupersedePanel() {
  const viewer = useMolView();
  const [log, setLog] = useState<string[]>([]);
  const disabled = !viewer;
  const load = (id: string) =>
    viewer!.dispatch({ name: 'load-structure', input: { source: 'pdb', id } });

  return (
    <Panel title="Supersede / Dedup (#27)">
      <button
        disabled={disabled}
        onClick={async () => {
          // Fire three different structures back-to-back without awaiting: latest wins.
          const results = await Promise.all([load('1crn'), load('1hsg'), load('4hhb')]);
          setLog(['rapid 1crn→1hsg→4hhb:', ...results.map((r, i) => `  #${i + 1}: ${code(r)}`)]);
        }}
      >
        Rapid A→B→C (expect first two superseded, last ok)
      </button>{' '}
      <button
        disabled={disabled}
        onClick={async () => {
          // Load the same structure twice in a row (sequential): the second is a dedup no-op.
          const first = await load('1crn');
          const second = await load('1crn');
          setLog([`reload same 1crn:`, `  first: ${code(first)}`, `  second: ${code(second)} (dedup → ok, no reload)`]);
        }}
      >
        Reload same (dedup)
      </button>
      <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre>
    </Panel>
  );
}
