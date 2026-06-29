import type { ReactNode } from 'react';
import type { CommandResult } from '@abycloud-co-uk/van-der-view';

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="vdv-panel">
      <h2 className="vdv-panel__title">{title}</h2>
      {children}
    </section>
  );
}

export function ResultView({ result }: { result: CommandResult | undefined }) {
  if (!result) return null;
  const text = result.ok
    ? `ok${result.data !== undefined ? ' ' + JSON.stringify(result.data) : ''}`
    : `error ${result.error.code}: ${result.error.message}`;
  return <pre className={`vdv-result ${result.ok ? 'vdv-result--ok' : 'vdv-result--err'}`}>{text}</pre>;
}
