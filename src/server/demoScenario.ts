import type { AgentSnapshot, Side } from '../shared/types';
import { defaultPolicy } from './config';
import { bps, round } from './utils';

const apiBase = process.env.SPHERE_MAKER_API_URL ?? 'http://127.0.0.1:8787';

async function json<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, options);
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function postCounterparty(side: Side, edgeBps: number): Promise<void> {
  await json('/api/demo/counterparty', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner: '@demo-counterparty',
      side,
      baseAmount: defaultPolicy.quoteSizeBase,
      price: round(defaultPolicy.referencePrice + bps(defaultPolicy.referencePrice, edgeBps), 6)
    })
  });
}

console.log(`[demo] using API ${apiBase}`);
await json<AgentSnapshot>('/api/agent/start', { method: 'POST' });

await postCounterparty('sell', -45);
await json<AgentSnapshot>('/api/agent/tick', { method: 'POST' });

await postCounterparty('buy', 45);
await json<AgentSnapshot>('/api/agent/tick', { method: 'POST' });

const state = await json<AgentSnapshot>('/api/state');
const settled = state.deals.filter((deal) => deal.status === 'settled');
const published = state.audit.filter((event) => event.action === 'publish_intent');

console.log(JSON.stringify({
  mode: state.mode,
  status: state.status,
  agent: state.agentName,
  openQuotes: state.openIntents.length,
  counterpartyIntents: state.counterpartyIntents.length,
  settledSwaps: settled.length,
  publishedIntents: published.length,
  latestDeal: state.deals[0] ?? null,
  latestAudit: state.audit.slice(0, 5)
}, null, 2));
