import { env } from './config';

const apiBase = process.env.SPHERE_MAKER_API_URL ?? 'http://127.0.0.1:8787';

async function json(path: string, options?: RequestInit): Promise<any> {
  const response = await fetch(`${apiBase}${path}`, options);
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

console.log('[live-scenario] prerequisites:');
console.log('- API must be running with SPHERE_MODE=live');
console.log('- SPHERE_AGENT_MNEMONIC must be set for maker');
console.log('- COUNTERPARTY_AGENT_MNEMONIC must be set before running npm run live:counterparty');
console.log('- SPHERE_ESCROW_ADDRESS defaults to @escrow-test-02 for Testnet v2 swap proposals');

const stateBefore = await json('/api/state');
if (stateBefore.mode !== 'live') {
  throw new Error(`Expected API mode live, got ${stateBefore.mode}. Set SPHERE_MODE=live in .env and restart the API.`);
}

await json('/api/agent/start', { method: 'POST' });
await json('/api/agent/tick', { method: 'POST' });

const stateAfter = await json('/api/state');
console.log(JSON.stringify({
  maker: env.SPHERE_NAMETAG,
  counterparty: env.COUNTERPARTY_NAMETAG,
  status: stateAfter.status,
  wallet: stateAfter.wallet,
  openQuotes: stateAfter.openIntents.length,
  discoveredCounterpartyIntents: stateAfter.counterpartyIntents.length,
  deals: stateAfter.deals.length,
  latestAudit: stateAfter.audit.slice(0, 5)
}, null, 2));
