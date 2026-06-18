import { describe, expect, it } from 'vitest';
import { err, ok } from '../src/types';

describe('CommandResult helpers', () => {
  it('ok() builds a success result', () => {
    expect(ok({ loaded: true })).toEqual({ ok: true, data: { loaded: true } });
  });

  it('ok() with no data yields data: undefined', () => {
    expect(ok()).toEqual({ ok: true, data: undefined });
  });

  it('err() builds a failure result', () => {
    expect(err('bad_selection', 'no chain "Z"')).toEqual({
      ok: false,
      error: { code: 'bad_selection', message: 'no chain "Z"' },
    });
  });
});
