import { defaultPolicy } from './config';
import { bps, round } from './utils';
import type { Side } from '../shared/types';

const apiBase = process.env.SPHERE_MAKER_API_URL ?? 'http://127.0.0.1:8787';
const intervalMs = Number(process.env.COUNTERPARTY_INTERVAL_MS ?? 4000);
const owner = process.env.COUNTERPARTY_NAMETAG ?? '@counterparty-bot';

async function postIntent(): Promise<void> {
  const side: Side = Math.random() > 0.5 ? 'sell' : 'buy';
  const edgeBps = side === 'sell' ? -35 : 35;
  const price = round(defaultPolicy.referencePrice + bps(defaultPolicy.referencePrice, edgeBps), 6);
  const baseAmount = round(defaultPolicy.quoteSizeBase * (0.7 + Math.random() * 0.6), 2);

  const response = await fetch(`${apiBase}/api/demo/counterparty`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, side, baseAmount, price })
  });

  if (!response.ok) {
    throw new Error(`Counterparty post failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json() as { intent: { id: string; side: Side; baseAmount: number; price: number } };
  console.log(`[counterparty] posted ${body.intent.side.toUpperCase()} ${body.intent.baseAmount} UCT @ ${body.intent.price} (${body.intent.id})`);
}

console.log(`[counterparty] feeding demo intents into ${apiBase}`);
await postIntent();
setInterval(() => {
  postIntent().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
  });
}, intervalMs);
