import type { ReactNode } from 'react';
import type { CommandResult } from '@abycloud-co-uk/van-der-view';

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: '1px solid #333', borderRadius: 6, padding: 12, marginBottom: 12 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9bd' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ResultView({ result }: { result: CommandResult | undefined }) {
  if (!result) return null;
  const text = result.ok
    ? `ok${result.data !== undefined ? ' ' + JSON.stringify(result.data) : ''}`
    : `error ${result.error.code}: ${result.error.message}`;
  return (
    <pre style={{ margin: '8px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', color: result.ok ? '#7d8' : '#f88' }}>
      {text}
    </pre>
  );
}
