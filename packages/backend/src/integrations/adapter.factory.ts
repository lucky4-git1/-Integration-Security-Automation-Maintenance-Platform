import type { ProviderAdapter } from './adapter.interface.js';
import { GitHubAdapter } from './adapters/github.adapter.js';
import { SlackAdapter } from './adapters/slack.adapter.js';
import { GenericHttpAdapter } from './adapters/generic-http.adapter.js';

const adapters = new Map<string, ProviderAdapter>([
  ['github', new GitHubAdapter()],
  ['slack', new SlackAdapter()],
  ['http', new GenericHttpAdapter()],
]);

export function getAdapter(provider: string): ProviderAdapter {
  const adapter = adapters.get(provider.toLowerCase());
  if (!adapter) {
    throw new Error(`No adapter found for provider: ${provider}. Supported: ${Array.from(adapters.keys()).join(', ')}`);
  }
  return adapter;
}

export function listProviders(): Array<{ provider: string; displayName: string; supportedOperations: string[] }> {
  return Array.from(adapters.values()).map((a) => ({
    provider: a.provider,
    displayName: a.displayName,
    supportedOperations: a.supportedOperations,
  }));
}

export function isProviderSupported(provider: string): boolean {
  return adapters.has(provider.toLowerCase());
}
