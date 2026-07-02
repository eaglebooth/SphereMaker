import type { Balance, DemoCounterpartyIntentInput, Intent, MarketAdapter, MarketPolicy, SwapDeal, WalletStatus } from '../../shared/types';
import { bps, nowIso, round, uid } from '../utils';

export class DryRunMarketAdapter implements MarketAdapter {
  mode = 'dry-run' as const;
  private balances: Balance[] = [
    { asset: 'UCT', available: 360 },
    { asset: 'ETH', available: 6.4 }
  ];

  private intents: Intent[] = [];
  private counterpartyIntents: Intent[] = [];

  async init(): Promise<void> {
    return Promise.resolve();
  }

  async getBalances(): Promise<Balance[]> {
    return this.balances.map((balance) => ({ ...balance }));
  }

  async listCounterpartyIntents(policy: MarketPolicy): Promise<Intent[]> {
    const midpoint = policy.referencePrice;
    const wave = Math.sin(Date.now() / 11_000) * bps(midpoint, 90);
    const competitors: Intent[] = [
      this.fakeIntent('counterparty', 'buy', midpoint - bps(midpoint, 70) + wave, policy),
      this.fakeIntent('counterparty', 'sell', midpoint + bps(midpoint, 65) + wave, policy),
      this.fakeIntent('counterparty', Math.random() > 0.5 ? 'buy' : 'sell', midpoint + wave, policy)
    ];
    return [...this.counterpartyIntents.filter((intent) => intent.status === 'open'), ...competitors];
  }

  async publishIntent(intent: Omit<Intent, 'id' | 'status' | 'createdAt' | 'source'>): Promise<Intent> {
    const published: Intent = {
      ...intent,
      id: uid('intent'),
      status: 'open',
      createdAt: nowIso(),
      source: 'agent'
    };
    this.intents.push(published);
    return published;
  }

  async cancelIntent(intentId: string): Promise<void> {
    this.intents = this.intents.map((intent) =>
      intent.id === intentId ? { ...intent, status: 'cancelled' } : intent
    );
  }

  async proposeSwap(intent: Intent): Promise<SwapDeal> {
    this.counterpartyIntents = this.counterpartyIntents.map((item) =>
      item.id === intent.id ? { ...item, status: 'matched' } : item
    );

    return {
      id: uid('swap'),
      intentId: intent.id,
      counterparty: intent.owner,
      side: intent.side === 'buy' ? 'sell' : 'buy',
      baseAmount: intent.baseAmount,
      quoteAmount: intent.quoteAmount,
      price: intent.price,
      status: 'accepted',
      createdAt: nowIso()
    };
  }

  async settleSwap(deal: SwapDeal): Promise<SwapDeal> {
    const base = this.findBalance('UCT');
    const quote = this.findBalance('ETH');

    if (deal.side === 'buy') {
      quote.available = round(quote.available - deal.quoteAmount);
      base.available = round(base.available + deal.baseAmount);
    } else {
      base.available = round(base.available - deal.baseAmount);
      quote.available = round(quote.available + deal.quoteAmount);
    }

    return {
      ...deal,
      status: 'settled',
      settledAt: nowIso(),
      txRef: uid('drytx')
    };
  }

  getWalletStatus(): WalletStatus {
    return {
      mode: 'dry-run',
      connection: 'simulated',
      network: 'testnet2',
      nametag: '@sphere-maker',
      hasMnemonic: false,
      message: 'Dry-run wallet is simulated. Switch SPHERE_MODE=live and provide SPHERE_AGENT_MNEMONIC to connect a real agent wallet.'
    };
  }

  seedCounterpartyIntent(input: DemoCounterpartyIntentInput, policy: MarketPolicy): Intent {
    const baseAmount = round(input.baseAmount, 4);
    const price = round(input.price, 6);
    const intent: Intent = {
      id: uid('bot_intent'),
      owner: input.owner ?? `@counterparty-bot-${Math.floor(Math.random() * 900 + 100)}`,
      side: input.side,
      baseAsset: policy.baseAsset,
      quoteAsset: policy.quoteAsset,
      baseAmount,
      quoteAmount: round(baseAmount * price, 4),
      price,
      status: 'open',
      createdAt: nowIso(),
      source: 'counterparty'
    };
    this.counterpartyIntents.unshift(intent);
    this.counterpartyIntents = this.counterpartyIntents.slice(0, 40);
    return intent;
  }

  listSeededCounterpartyIntents(): Intent[] {
    return this.counterpartyIntents.map((intent) => ({ ...intent }));
  }

  private fakeIntent(owner: string, side: Intent['side'], price: number, policy: MarketPolicy): Intent {
    const baseAmount = round(policy.quoteSizeBase * (0.6 + Math.random() * 0.9), 2);
    return {
      id: uid('cp'),
      owner: `@${owner}-${Math.floor(Math.random() * 900 + 100)}`,
      side,
      baseAsset: policy.baseAsset,
      quoteAsset: policy.quoteAsset,
      baseAmount,
      quoteAmount: round(baseAmount * price, 2),
      price: round(price, 4),
      status: 'open',
      createdAt: nowIso(),
      source: 'counterparty'
    };
  }

  private findBalance(asset: string): Balance {
    const balance = this.balances.find((item) => item.asset === asset);
    if (!balance) {
      throw new Error(`Missing dry-run balance for ${asset}`);
    }
    return balance;
  }
}
