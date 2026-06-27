import { useCallback, useEffect, useRef, useState } from 'react';
import { useMolView } from '@abycloud-co-uk/van-der-view/browser';
import type { Command, CommandResult } from '@abycloud-co-uk/van-der-view';
import { Panel } from '../ui';
import { SYSTEM_PROMPT, runAgentTurn, type AgentEvent, type WireMessage } from '../agent/loop';
import { useSpeechInput } from '../agent/use-speech-input';

type Entry =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'assistant'; text: string }
  | { id: number; kind: 'tool'; command: Command; result: CommandResult }
  | { id: number; kind: 'error'; text: string };

/** Omit that distributes over the union (plain Omit<Union,K> keeps only shared keys). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type EntryInput = DistributiveOmit<Entry, 'id'>;

function ToolChip({ command, result }: { command: Command; result: CommandResult }) {
  const input = command.input === undefined ? '' : ` ${JSON.stringify(command.input)}`;
  const ok = result.ok;
  return (
    <div className={`vdv-toolchip ${ok ? 'vdv-toolchip--ok' : 'vdv-toolchip--err'}`}>
      <span className="vdv-toolchip__name">{command.name}</span>
      <span className="vdv-toolchip__args">{input}</span>
      {ok ? (
        <span className="vdv-toolchip__ok">
          {result.data !== undefined ? ` → ${JSON.stringify(result.data)}` : ' → ok'}
        </span>
      ) : (
        <span className="vdv-toolchip__err">{` → ${result.error.code}: ${result.error.message}`}</span>
      )}
    </div>
  );
}

export function AgentPanel() {
  const view = useMolView();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<WireMessage[]>([{ role: 'system', content: SYSTEM_PROMPT }]);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const push = useCallback((entry: EntryInput) => {
    setEntries((prev) => [...prev, { ...entry, id: ++idRef.current } as Entry]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || !view) return;
      setInput('');
      push({ kind: 'user', text: trimmed });
      setBusy(true);
      try {
        historyRef.current = await runAgentTurn(view, historyRef.current, trimmed, (event: AgentEvent) => {
          if (event.kind === 'assistant') push({ kind: 'assistant', text: event.text });
          else if (event.kind === 'tool') push({ kind: 'tool', command: event.command, result: event.result });
          else push({ kind: 'error', text: event.message });
        });
      } catch (e) {
        push({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
      } finally {
        setBusy(false);
      }
    },
    [busy, view, push],
  );

  // A recognized voice phrase auto-sends, exactly like pressing Enter on typed text.
  const onTranscript = useCallback((text: string) => void send(text), [send]);
  const speech = useSpeechInput(onTranscript);

  return (
    <Panel title="Agent · DeepSeek">
      <div className="vdv-chat__log" ref={scrollRef}>
        {entries.length === 0 && (
          <div className="vdv-chat__hint">
            Ask the agent to drive the viewer, e.g. “load 1CRN and colour it by B-factor”, “focus chain A”,
            or “how far apart are residues 10 and 40?”.
          </div>
        )}
        {entries.map((e) => {
          if (e.kind === 'tool') return <ToolChip key={e.id} command={e.command} result={e.result} />;
          const label = e.kind === 'user' ? 'you' : e.kind === 'error' ? 'error' : 'agent';
          return (
            <div key={e.id} className={`vdv-msg vdv-msg--${e.kind}`}>
              <span className="vdv-msg__eyebrow">{label}</span>
              <div className="vdv-msg__body">{e.text}</div>
            </div>
          );
        })}
        {busy && <div className="vdv-chat__busy">…thinking</div>}
      </div>

      <form
        className="vdv-chat__form"
        onSubmit={(ev) => {
          ev.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(ev) => setInput(ev.target.value)}
          disabled={!view || busy}
          placeholder={view ? 'Ask the agent…' : 'viewer loading…'}
        />
        {speech.supported && (
          <button
            type="button"
            className={`vdv-mic ${speech.listening ? 'vdv-mic--on' : ''}`}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            disabled={!view || busy}
            title={speech.listening ? 'Stop listening' : 'Tap to talk'}
          >
            {speech.listening ? '● rec' : '🎤'}
          </button>
        )}
        <button type="submit" className="vdv-btn vdv-btn--primary" disabled={!view || busy || input.trim() === ''}>
          Send
        </button>
      </form>
    </Panel>
  );
}
