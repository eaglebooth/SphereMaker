import type { Balance, Intent, MarketAdapter, MarketPolicy, SwapDeal, WalletStatus } from '../../shared/types';
import { env } from '../config';
import { RuntimeJsonStorageProvider } from '../runtimeJsonStorageProvider';
import { runtimeStoragePaths } from '../storagePaths';
import { nowIso, round, uid } from '../utils';

type AnyRecord = Record<string, any>;
const DEFAULT_ESCROW_ADDRESS = '@escrow-test-02';
const TOKEN_DECIMALS = 18;

export class LiveSphereAdapter implements MarketAdapter {
  mode = 'live' as const;
  private sphere?: AnyRecord;
  private createdWallet = false;

  async init(): Promise<void> {
    const sdk = await import('@unicitylabs/sphere-sdk');
    const nodeImpl = await import('@unicitylabs/sphere-sdk/impl/nodejs');
    const walletApi = await import('@unicitylabs/sphere-sdk/impl/shared/wallet-api');

    const storage = runtimeStoragePaths('maker');
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
      deviceId: env.SPHERE_DEVICE_ID
    });

    const initArgs = {
      ...providers,
      network: env.SPHERE_NETWORK,
      autoGenerate: !env.SPHERE_AGENT_MNEMONIC,
      nametag: env.SPHERE_NAMETAG,
      market: true,
      accounting: true,
      swap: true
    };

    if (env.SPHERE_AGENT_MNEMONIC) {
      Object.assign(initArgs, { mnemonic: env.SPHERE_AGENT_MNEMONIC });
    }

    const result = await sdk.Sphere.init(initArgs as Parameters<typeof sdk.Sphere.init>[0]);
    this.sphere = result.sphere;
    this.createdWallet = Boolean(result.created);
  }

  async getBalances(): Promise<Balance[]> {
    const sphere = this.requireSphere();
    const assets = await sphere.payments.getAssets();
    if (Array.isArray(assets)) {
      return assets.map((asset: AnyRecord) => ({
        asset: String(asset.symbol ?? asset.coinId ?? asset.asset ?? 'UNKNOWN'),
        available: this.normalizeAssetAmount(asset)
      }));
    }
    return Object.entries(assets ?? {}).map(([asset, amount]) => ({
      asset,
      available: Number(amount)
    }));
  }

  async listCounterpartyIntents(policy: MarketPolicy): Promise<Intent[]> {
    const market = this.requireMarket();
    const query = `sphere-maker ${policy.pair} ${policy.baseAsset} ${policy.quoteAsset} swap quote`;
    const searches = await Promise.all([
      market.search(query, this.marketSearchOptions(80)),
      market.search(`${query} side=buy buy`, this.marketSearchOptions(40)),
      market.search(`${query} side=sell sell`, this.marketSearchOptions(40))
    ]);
    const items = this.uniqueMarketItems(searches.flatMap((raw: unknown) => this.extractMarketItems(raw)));
    const freshBotQuotes = items.filter((item: AnyRecord) => this.hasBotQuoteId(item));
    const displayItems = freshBotQuotes.length >= 3 ? freshBotQuotes : items;
    const intents = displayItems
      .map((item: AnyRecord) => this.normalizeIntent(item, policy))
      .filter(Boolean);
    return this.interleaveSides(this.sortNewestFirst(intents)).slice(0, 20);
  }

  async publishIntent(intent: Omit<Intent, 'id' | 'status' | 'createdAt' | 'source'>): Promise<Intent> {
    const market = this.requireMarket();
    const quoteAmount = round(intent.baseAmount * intent.price, 4);
    const quoteId = uid('maker_quote');
    const payload = {
      description: [
        'sphere-maker swap quote',
        `side=${intent.side}`,
        `pair=${intent.baseAsset}/${intent.quoteAsset}`,
        `base=${intent.baseAmount}`,
        `quote=${quoteAmount}`,
        `price=${intent.price}`,
        `quote_id=${quoteId}`
      ].join(' | '),
      intentType: intent.side,
      category: 'sphere-maker-liquidity',
      price: intent.price,
      currency: intent.quoteAsset,
      contactHandle: env.SPHERE_NAMETAG,
      expiresInDays: 1
    };
    const raw = await market.postIntent(payload);
    return {
      ...intent,
      id: String(raw?.intentId ?? raw?.id ?? uid('live_intent')),
      status: 'open',
      createdAt: nowIso(),
      source: 'agent'
    };
  }

  async cancelIntent(intentId: string): Promise<void> {
    const market = this.requireMarket();
    await market.closeIntent(intentId);
  }

  async proposeSwap(intent: Intent): Promise<SwapDeal> {
    const swap = this.requireSwap();
    const counterpartyAddress = this.resolveCounterpartyAddress(intent);
    if (!counterpartyAddress) {
      throw new Error(`Cannot propose live swap for ${intent.owner}; configure COUNTERPARTY_DIRECT_ADDRESS or use a resolvable nametag.`);
    }
    const escrowAddress = this.getEscrowAddress();
    const localSide = intent.side === 'buy' ? 'sell' : 'buy';
    const raw = await swap.proposeSwap(this.buildSwapDeal(intent, localSide, counterpartyAddress, escrowAddress), {
      message: `Sphere Maker accepting ${intent.id} at ${intent.price}`
    });
    return {
      id: String(raw?.id ?? raw?.swapId ?? uid('live_swap')),
      intentId: intent.id,
      counterparty: intent.owner,
      side: intent.side === 'buy' ? 'sell' : 'buy',
      baseAmount: intent.baseAmount,
      quoteAmount: intent.quoteAmount,
      price: intent.price,
      status: 'proposed',
      createdAt: nowIso(),
      txRef: raw?.txId ?? raw?.id
    };
  }

  async settleSwap(deal: SwapDeal): Promise<SwapDeal> {
    return {
      ...deal,
      status: 'proposed',
      txRef: deal.txRef ?? deal.id
    };
  }

  getWalletStatus(): WalletStatus {
    const identity = this.sphere?.identity;
    const directAddress = identity?.directAddress ?? identity?.address;
    const session = this.sphere?.walletApiSessionStatus ?? null;
    const connected = Boolean(this.sphere?.isReady);
    const hasMnemonic = Boolean(env.SPHERE_AGENT_MNEMONIC);

    return {
      mode: 'live',
      connection: connected ? 'connected' : hasMnemonic ? 'configured' : 'missing',
      network: env.SPHERE_NETWORK,
      nametag: env.SPHERE_NAMETAG,
      address: directAddress ? String(directAddress) : undefined,
      walletApiSession: session,
      hasMnemonic,
      message: connected
        ? `Live agent wallet is ${this.createdWallet ? 'newly created' : 'loaded'} and ready for autonomous market actions.`
        : 'Live mode needs SPHERE_AGENT_MNEMONIC in .env before the agent can use a real wallet.'
    };
  }

  private requireSphere(): AnyRecord {
    if (!this.sphere) {
      throw new Error('Sphere SDK is not initialized.');
    }
    return this.sphere;
  }

  private requireMarket(): AnyRecord {
    const sphere = this.requireSphere();
    if (!sphere.market) {
      throw new Error('Sphere SDK market module is unavailable.');
    }
    return sphere.market;
  }

  private requireSwap(): AnyRecord {
    const sphere = this.requireSphere();
    if (!sphere.swap && !sphere.swaps) {
      throw new Error('Sphere SDK swap module is unavailable.');
    }
    return sphere.swap ?? sphere.swaps;
  }

  private normalizeIntent(item: AnyRecord, policy: MarketPolicy): Intent {
    const parsed = this.parseSphereMakerDescription(String(item.description ?? ''));
    const baseAmount = Number(parsed.base ?? item.baseAmount ?? item.amount ?? policy.quoteSizeBase);
    const price = Number(item.price ?? item.rate ?? policy.referencePrice);
    const side = (parsed.side ?? item.side ?? item.intentType) === 'sell' ? 'sell' : 'buy';
    return {
      id: String(item.id ?? item.intentId ?? uid('remote')),
      owner: String(item.owner ?? item.author ?? item.agentNametag ?? item.nametag ?? item.contactHandle ?? '@unknown'),
      side,
      baseAsset: String(item.baseAsset ?? policy.baseAsset),
      quoteAsset: String(item.quoteAsset ?? policy.quoteAsset),
      baseAmount: round(baseAmount, 4),
      quoteAmount: round(Number(item.quoteAmount ?? baseAmount * price), 4),
      price: round(price, 6),
      status: 'open',
      createdAt: String(item.createdAt ?? nowIso()),
      source: 'counterparty'
    };
  }

  private normalizeAssetAmount(asset: AnyRecord): number {
    const raw = asset.totalAmount ?? asset.amount ?? asset.balance ?? asset.available ?? 0;
    const decimals = Number(asset.decimals ?? 0);
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return decimals > 0 ? round(value / 10 ** decimals, 6) : value;
  }

  private parseSphereMakerDescription(description: string): Record<string, string> {
    return Object.fromEntries(
      description
        .split('|')
        .map((part) => part.trim().split('='))
        .filter((parts): parts is [string, string] => parts.length === 2)
        .map(([key, value]) => [key.trim(), value.trim()])
    );
  }

  private hasBotQuoteId(item: AnyRecord): boolean {
    return String(item.description ?? '').includes('quote_id=');
  }

  private marketSearchOptions(limit: number): AnyRecord {
    return {
      filters: {
        category: 'sphere-maker-liquidity'
      },
      limit
    };
  }

  private extractMarketItems(raw: unknown): AnyRecord[] {
    if (Array.isArray(raw)) {
      return raw;
    }
    const record = raw as AnyRecord | undefined;
    return record?.items ?? record?.intents ?? [];
  }

  private uniqueMarketItems(items: AnyRecord[]): AnyRecord[] {
    const seen = new Set<string>();
    const unique: AnyRecord[] = [];

    for (const item of items) {
      const key = String(item.id ?? item.intentId ?? item.description ?? JSON.stringify(item));
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(item);
    }

    return unique;
  }

  private interleaveSides(intents: Intent[]): Intent[] {
    const buys = intents.filter((intent) => intent.side === 'buy');
    const sells = intents.filter((intent) => intent.side === 'sell');
    const mixed: Intent[] = [];
    const maxLength = Math.max(buys.length, sells.length);

    for (let index = 0; index < maxLength; index += 1) {
      if (buys[index]) {
        mixed.push(buys[index]);
      }
      if (sells[index]) {
        mixed.push(sells[index]);
      }
    }

    return mixed;
  }

  private sortNewestFirst(intents: Intent[]): Intent[] {
    return [...intents].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  private resolveCounterpartyAddress(intent: Intent): string | undefined {
    if (intent.owner === env.COUNTERPARTY_NAMETAG) {
      return env.COUNTERPARTY_DIRECT_ADDRESS ?? env.COUNTERPARTY_CHAIN_PUBKEY ?? env.COUNTERPARTY_NAMETAG;
    }
    return intent.owner.startsWith('@') || intent.owner.startsWith('DIRECT://') ? intent.owner : env.COUNTERPARTY_DIRECT_ADDRESS;
  }

  private getEscrowAddress(): string {
    return env.SPHERE_ESCROW_ADDRESS || DEFAULT_ESCROW_ADDRESS;
  }

  private buildSwapDeal(
    intent: Intent,
    localSide: Intent['side'],
    counterpartyAddress: string,
    escrowAddress: string
  ): AnyRecord {
    const localAddress = env.SPHERE_DIRECT_ADDRESS ?? env.SPHERE_NAMETAG;
    const quoteAmount = round(intent.baseAmount * intent.price, 4);
    const baseUnits = this.toSmallestUnits(intent.baseAmount);
    const quoteUnits = this.toSmallestUnits(quoteAmount);

    if (localSide === 'buy') {
      return {
        partyA: localAddress,
        partyB: counterpartyAddress,
        partyACurrency: intent.quoteAsset,
        partyAAmount: quoteUnits,
        partyBCurrency: intent.baseAsset,
        partyBAmount: baseUnits,
        timeout: 600,
        escrowAddress
      };
    }

    return {
      partyA: localAddress,
      partyB: counterpartyAddress,
      partyACurrency: intent.baseAsset,
      partyAAmount: baseUnits,
      partyBCurrency: intent.quoteAsset,
      partyBAmount: quoteUnits,
      timeout: 600,
      escrowAddress
    };
  }

  private toSmallestUnits(amount: number, decimals = TOKEN_DECIMALS): string {
    const [whole, fraction = ''] = amount.toFixed(decimals).split('.');
    const normalizedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
    const units = `${whole}${normalizedFraction}`.replace(/^0+(?=\d)/, '');
    return units || '0';
  }
}
