import { useState } from 'react';
import { useMolView } from '@abycloud-co-uk/van-der-view/browser';
import { adapters } from '@abycloud-co-uk/van-der-view';
import type { Command, CommandResult } from '@abycloud-co-uk/van-der-view';
import { Panel, ResultView } from '../ui';

const SAMPLE = JSON.stringify(
  { type: 'tool_use', id: 'toolu_demo', name: 'highlight', input: { selection: { chain: 'A' } } },
  null,
  2,
);

export function PasteToolUsePanel() {
  const viewer = useMolView();
  const [text, setText] = useState(SAMPLE);
  const [command, setCommand] = useState<Command>();
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<CommandResult>();

  const run = async () => {
    setError(undefined);
    setCommand(undefined);
    setResult(undefined);
    let cmd: Command;
    try {
      cmd = adapters.anthropic.toCommand(JSON.parse(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setCommand(cmd);
    if (viewer) setResult(await viewer.dispatch(cmd));
  };

  return (
    <Panel title="Paste tool_use">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12 }}
      />
      <button disabled={!viewer} onClick={() => void run()}>
        toCommand → dispatch
      </button>
      {error && <pre style={{ margin: '8px 0 0', fontSize: 12, color: '#f88', whiteSpace: 'pre-wrap' }}>{error}</pre>}
      {command && (
        <pre style={{ margin: '8px 0 0', fontSize: 12, color: '#9bd', whiteSpace: 'pre-wrap' }}>
          Command: {JSON.stringify(command)}
        </pre>
      )}
      <ResultView result={result} />
    </Panel>
  );
}
