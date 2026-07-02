import { env } from './config';
import { RuntimeJsonStorageProvider } from './runtimeJsonStorageProvider';
import { runtimeStoragePaths } from './storagePaths';
import { bps, round } from './utils';
import type { Side } from '../shared/types';

type AnyRecord = Record<string, any>;
const processingSwaps = new Set<string>();

async function step<T>(label: string, action: () => Promise<T>, timeoutMs = 45000): Promise<T> {
  console.log(`[live-counterparty] ${label}...`);
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    const result = await Promise.race([action(), timeout]);
    console.log(`[live-counterparty] ${label} ok`);
    return result;
  } finally {
    clearTimeout(timer!);
  }
}

async function initCounterpartySphere(): Promise<AnyRecord> {
  if (!env.COUNTERPARTY_AGENT_MNEMONIC) {
    throw new Error('COUNTERPARTY_AGENT_MNEMONIC is required for live counterparty mode.');
  }

  const sdk = await step('import Sphere SDK', () => import('@unicitylabs/sphere-sdk'));
  const nodeImpl = await step('import node providers', () => import('@unicitylabs/sphere-sdk/impl/nodejs'));
  const walletApi = await step('import wallet api providers', () => import('@unicitylabs/sphere-sdk/impl/shared/wallet-api'));

  const storage = runtimeStoragePaths('counterparty');
  const base = nodeImpl.createNodeProviders({
    network: env.SPHERE_NETWORK,
    dataDir: storage.dataDir,
    tokensDir: storage.tokensDir,
    oracle: { apiKey: env.SPHERE_ORACLE_API_KEY },
    market: true
  });
  base.storage = new RuntimeJsonStorageProvider(storage.dataDir) as unknown as typeof base.storage;

  const providers = walletApi.createWalletApiProviders(base, {
    baseUrl: env.SPHERE_WALLET_API_URL,
    network: 'testnet2',
    deviceId: `${env.SPHERE_DEVICE_ID}-counterparty`
  });

  const result = await step(
    'initialize counterparty Sphere wallet',
    () =>
      sdk.Sphere.init({
        ...providers,
        network: env.SPHERE_NETWORK,
        autoGenerate: true,
        mnemonic: env.COUNTERPARTY_AGENT_MNEMONIC,
        nametag: env.COUNTERPARTY_NAMETAG,
        market: true,
        accounting: true,
        swap: true
      } as Parameters<typeof sdk.Sphere.init>[0]),
    120000
  );

  return result.sphere as AnyRecord;
}

function randomSide(): Side {
  return Math.random() > 0.5 ? 'sell' : 'buy';
}

function randomBaseAmount(): number {
  const configured = Number(process.env.COUNTERPARTY_BASE_AMOUNT);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return round(3 + Math.random() * 9, 2);
}

function randomEdgeBps(side: Side): number {
  const configured = Number(process.env.COUNTERPARTY_EDGE_BPS);
  if (Number.isFinite(configured) && configured !== 0) {
    return side === 'sell' ? -Math.abs(configured) : Math.abs(configured);
  }
  const edge = 20 + Math.random() * 85;
  return side === 'sell' ? -edge : edge;
}

async function postQuote(sphere: AnyRecord, side: Side = randomSide()): Promise<void> {
  const referencePrice = 0.1;
  const baseAmount = randomBaseAmount();
  const edgeBps = randomEdgeBps(side);
  const price = round(referencePrice + bps(referencePrice, edgeBps), 6);
  const quoteAmount = round(baseAmount * price, 4);
  const quoteId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const result = await step(
    `post ${side} market intent`,
    () =>
      sphere.market.postIntent({
        description: [
          'sphere-maker swap quote',
          `side=${side}`,
          'pair=UCT/ETH',
          `base=${baseAmount}`,
          `quote=${quoteAmount}`,
          `price=${price}`,
          `quote_id=${quoteId}`
        ].join(' | '),
        intentType: side,
        category: 'sphere-maker-liquidity',
        price,
        currency: 'ETH',
        contactHandle: env.COUNTERPARTY_NAMETAG,
        expiresInDays: 1
      }),
    60000
  );

  const posted = result as AnyRecord;
  console.log(`[live-counterparty] posted ${side.toUpperCase()} ${baseAmount} UCT @ ${price}: ${posted.intentId ?? posted.id}`);
}

async function respondToSwaps(sphere: AnyRecord): Promise<void> {
  const swaps = sphere.swap.getSwaps({ excludeTerminal: true }) as AnyRecord[];
  for (const swapRef of swaps) {
    const swapId = String(swapRef.swapId ?? swapRef.id);
    const role = String(swapRef.role ?? '');
    const progress = String(swapRef.progress ?? '');

    if (processingSwaps.has(swapId)) {
      continue;
    }

    if (role !== 'acceptor') {
      continue;
    }

    processingSwaps.add(swapId);
    try {
      if (progress === 'proposed') {
        await step(`accept swap ${swapId.slice(0, 10)}`, () => sphere.swap.acceptSwap(swapId), 60000);
        continue;
      }

      if (progress === 'announced') {
        await step(`deposit swap ${swapId.slice(0, 10)}`, () => sphere.swap.deposit(swapId), 120000);
        continue;
      }

      if (progress === 'completed' && !swapRef.payoutVerified) {
        await step(`verify payout ${swapId.slice(0, 10)}`, () => sphere.swap.verifyPayout(swapId), 60000);
      }
    } finally {
      processingSwaps.delete(swapId);
    }
  }
}

const side = process.env.COUNTERPARTY_SIDE === 'buy' || process.env.COUNTERPARTY_SIDE === 'sell'
  ? (process.env.COUNTERPARTY_SIDE as Side)
  : randomSide();
const loop = process.env.COUNTERPARTY_LOOP === 'true';
const responder = process.env.COUNTERPARTY_RESPONDER === 'true';
const intervalMs = Number(process.env.COUNTERPARTY_INTERVAL_MS ?? 12000);

console.log(`[live-counterparty] initializing ${env.COUNTERPARTY_NAMETAG}`);
const sphere = await initCounterpartySphere();
console.log(`[live-counterparty] ready: ${sphere.identity?.directAddress ?? 'identity loaded'}`);

await postQuote(sphere, side);

if (responder) {
  console.log('[live-counterparty] responder loop enabled');
  setInterval(() => {
    respondToSwaps(sphere).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
    });
  }, 5000);
}

if (loop) {
  setInterval(() => {
    postQuote(sphere, Math.random() > 0.5 ? 'sell' : 'buy').catch((error) => {
      console.error(error instanceof Error ? error.message : error);
    });
  }, intervalMs);
} else {
  if (!responder) {
    process.exit(0);
  }
}
