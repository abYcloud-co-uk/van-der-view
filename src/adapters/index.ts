import type { AnthropicTool, OpenAITool, ProviderAdapter } from '../types';
import { toCommand as anthropicToCommand, toTools as anthropicToTools } from './anthropic';
import { toCommand as openaiToCommand, toTools as openaiToTools } from './openai';

const anthropic: ProviderAdapter<AnthropicTool> = {
  toTools: anthropicToTools,
  toCommand: anthropicToCommand,
};

/** OpenAI-compatible adapter; DeepSeek uses this too (its API is OpenAI-compatible). */
const openai: ProviderAdapter<OpenAITool> = {
  toTools: openaiToTools,
  toCommand: openaiToCommand,
};

export const adapters = {
  anthropic,
  openai,
};
