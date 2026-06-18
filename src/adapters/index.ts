import type { ProviderAdapter } from '../types';
import { toCommand, toTools } from './anthropic';

const anthropic: ProviderAdapter = { toTools, toCommand };

/** A reserved adapter that throws clearly until the provider is implemented. */
function notImplemented(provider: string): ProviderAdapter {
  const fail = (): never => {
    throw new Error(`van-der-view: the "${provider}" adapter is not implemented yet.`);
  };
  return { toTools: fail, toCommand: fail };
}

export const adapters = {
  anthropic,
  openai: notImplemented('openai'),
};
