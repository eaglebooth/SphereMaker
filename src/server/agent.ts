import type { AgentSnapshot, AuditEvent, Intent, MarketAdapter, MarketPolicy, SwapDeal } from '../shared/types';
import { appConfig, defaultPolicy } from './config';
import { audit, bps, nowIso, round, uid } from './utils';

export class MarketMakerAgent {
  private policy: MarketPolicy = { ...defaultPolicy };
  private status: AgentSnapshot['status'] = 'idle';
  private timer?: NodeJS.Timeout;
  private balances: AgentSnapshot['balances'] = [];
  private openIntents: Intent[] = [];
  private counterpartyIntents: Intent[] = [];
  private deals: SwapDeal[] = [];
  private auditLog: AuditEvent[] = [];
  private handledIntentIds = new Set<string>();
  private lastTickAt?: string;
  private error?: string;

  constructor(private readonly adapter: MarketAdapter) {}

  async init(): Promise<void> {
    this.push(audit('system', 'init', `Starting Sphere Maker in ${this.adapter.mode} mode.`));
    await this.adapter.init();
    this.balances = await this.adapter.getBalances();
    this.push(audit('system', 'ready', 'Agent initialized and balances loaded.', 'success'));
  }

  start(): void {
    if (this.status === 'running') {
      return;
    }
    this.status = 'running';
    this.error = undefined;
    this.push(audit('agent', 'start', `Autonomous loop started with ${this.policy.tickMs}ms ticks.`, 'success'));
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.policy.tickMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.status = 'paused';
    this.push(audit('agent', 'stop', 'Autonomous loop paused by operator.'));
  }

  updatePolicy(next: Partial<MarketPolicy>): MarketPolicy {
    const wasRunning = this.status === 'running';
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.policy = {
      ...this.policy,
      ...next,
      pair: `${next.baseAsset ?? this.policy.baseAsset}/${next.quoteAsset ?? this.policy.quoteAsset}`
    };
    this.push(audit('policy', 'update', 'Risk policy updated.', 'success', this.policy as unknown as Record<string, unknown>));
    if (wasRunning) {
      this.start();
    }
    return this.policy;
  }

  async tick(): Promise<void> {
    if (this.status !== 'running') {
      return;
    }

    try {
      this.lastTickAt = nowIso();
      this.balances = await this.adapter.getBalances();
      this.counterpartyIntents = await this.adapter.listCounterpartyIntents(this.policy);
      await this.refreshQuotes();
      await this.matchCounterparties();
      this.error = undefined;
    } catch (error) {
      this.status = 'error';
      this.error = error instanceof Error ? error.message : String(error);
      this.push(audit('system', 'error', this.error, 'error'));
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    }
  }

  snapshot(): AgentSnapshot {
    return {
      mode: this.adapter.mode,
      status: this.status,
      agentName: appConfig.agentName,
      lastTickAt: this.lastTickAt,
      policy: this.policy,
      balances: this.balances,
      wallet: this.adapter.getWalletStatus(),
      openIntents: this.activeOpenIntents(),
      counterpartyIntents: this.counterpartyIntents,
      deals: this.deals.slice(-20).reverse(),
      audit: this.auditLog.slice(-80).reverse(),
      error: this.error
    };
  }

  private async refreshQuotes(): Promise<void> {
    const staleQuotes = this.openIntents.filter((intent) => intent.status === 'open');

    const quotes = this.buildQuotes();
    for (const quote of quotes) {
      const published = await this.adapter.publishIntent(quote);
      this.openIntents.push(published);
      this.push(
        audit(
          'market',
          'publish_intent',
          `${published.side.toUpperCase()} ${published.baseAmount} ${published.baseAsset} @ ${published.price} ${published.quoteAsset}`,
          'success',
          { intentId: published.id }
        )
      );
    }

    for (const intent of staleQuotes) {
      intent.status = 'cancelled';
      try {
        await this.adapter.cancelIntent(intent.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.push(audit('market', 'cancel_stale_intent_failed', `Could not cancel stale quote ${intent.id}: ${message}`, 'warn'));
      }
    }
  }

  private activeOpenIntents(): Intent[] {
    const latestBySide = new Map<Intent['side'], Intent>();

    for (const intent of [...this.openIntents].reverse()) {
      if (intent.status === 'open' && !latestBySide.has(intent.side)) {
        latestBySide.set(intent.side, intent);
      }
    }

    return ['buy', 'sell']
      .map((side) => latestBySide.get(side as Intent['side']))
      .filter((intent): intent is Intent => Boolean(intent));
  }

  private buildQuotes(): Array<Omit<Intent, 'id' | 'status' | 'createdAt' | 'source'>> {
    const baseBalance = this.balanceOf(this.policy.baseAsset);
    const quoteBalance = this.balanceOf(this.policy.quoteAsset);
    const halfSpread = bps(this.policy.referencePrice, this.policy.spreadBps / 2);
    const bidPrice = round(this.policy.referencePrice - halfSpread, 6);
    const askPrice = round(this.policy.referencePrice + halfSpread, 6);
    const quotes: Array<Omit<Intent, 'id' | 'status' | 'createdAt' | 'source'>> = [];

    if (baseBalance < this.policy.maxBaseInventory && quoteBalance > this.policy.quoteSizeBase * bidPrice) {
      quotes.push({
        owner: appConfig.agentName,
        side: 'buy',
        baseAsset: this.policy.baseAsset,
        quoteAsset: this.policy.quoteAsset,
        baseAmount: this.policy.quoteSizeBase,
        quoteAmount: round(this.policy.quoteSizeBase * bidPrice, 4),
        price: bidPrice
      });
    } else {
      this.push(audit('policy', 'skip_bid', 'Bid skipped because inventory or quote balance limit was reached.', 'warn'));
    }

    if (baseBalance > this.policy.minBaseInventory) {
      quotes.push({
        owner: appConfig.agentName,
        side: 'sell',
        baseAsset: this.policy.baseAsset,
        quoteAsset: this.policy.quoteAsset,
        baseAmount: this.policy.quoteSizeBase,
        quoteAmount: round(this.policy.quoteSizeBase * askPrice, 4),
        price: askPrice
      });
    } else {
      this.push(audit('policy', 'skip_ask', 'Ask skipped because base inventory is below the minimum reserve.', 'warn'));
    }

    return quotes;
  }

  private async matchCounterparties(): Promise<void> {
    for (const intent of this.counterpartyIntents) {
      if (this.handledIntentIds.has(intent.id)) {
        continue;
      }

      if (intent.owner === appConfig.agentName || intent.owner === appConfig.agentName.replace(/^@/, '')) {
        this.handledIntentIds.add(intent.id);
        this.push(audit('policy', 'skip_self_intent', 'Skipping own market intent.', 'info', { intentId: intent.id }));
        continue;
      }

      const decision = this.evaluateCounterparty(intent);
      if (!decision.accept) {
        this.push(audit('policy', 'reject_intent', decision.reason, 'info', { intentId: intent.id, price: intent.price }));
        continue;
      }

      this.handledIntentIds.add(intent.id);
      const proposed = await this.proposeWithTimeout(intent);
      this.deals.push(proposed);
      if (proposed.status === 'failed') {
        this.push(
          audit('swap', 'proposal_timeout', `Swap proposal timed out with ${proposed.counterparty}; continuing loop.`, 'warn', {
            dealId: proposed.id,
            intentId: intent.id
          })
        );
        break;
      }

      this.push(
        audit('swap', 'propose_swap', `Swap proposed with ${proposed.counterparty} at ${proposed.price}.`, 'success', {
          dealId: proposed.id,
          intentId: intent.id
        })
      );

      if (this.policy.autoSettle) {
        const settled = await this.adapter.settleSwap(proposed);
        this.deals = this.deals.map((deal) => (deal.id === proposed.id ? settled : deal));
        this.balances = await this.adapter.getBalances();
        if (settled.status === 'settled') {
          this.push(audit('swap', 'settle_swap', `Swap settled: ${settled.txRef ?? settled.id}.`, 'success'));
        } else {
          this.push(
            audit(
              'swap',
              'await_counterparty',
              `Swap proposal submitted: ${settled.txRef ?? settled.id}. Awaiting counterparty acceptance and deposit.`,
              'info'
            )
          );
        }
      }
      break;
    }
  }

  private async proposeWithTimeout(intent: Intent): Promise<SwapDeal> {
    let settled = false;
    const proposal = this.adapter.proposeSwap(intent, this.policy);
    proposal.catch(() => undefined);

    const timeout = new Promise<SwapDeal>((resolve) => {
      setTimeout(() => {
        if (settled) {
          return;
        }
        resolve(this.failedDeal(intent, 'proposal_timeout'));
      }, Math.min(this.policy.tickMs, 5000));
    });

    try {
      const deal = await Promise.race([proposal, timeout]);
      settled = true;
      return deal;
    } catch (error) {
      settled = true;
      const message = error instanceof Error ? error.message : String(error);
      this.push(audit('swap', 'proposal_failed', message, 'warn', { intentId: intent.id }));
      return this.failedDeal(intent, 'proposal_failed');
    }
  }

  private failedDeal(intent: Intent, reason: string): SwapDeal {
    return {
      id: uid('failed_swap'),
      intentId: intent.id,
      counterparty: intent.owner,
      side: intent.side === 'buy' ? 'sell' : 'buy',
      baseAmount: intent.baseAmount,
      quoteAmount: intent.quoteAmount,
      price: intent.price,
      status: 'failed',
      createdAt: nowIso(),
      txRef: reason
    };
  }

  private evaluateCounterparty(intent: Intent): { accept: boolean; reason: string } {
    const fair = this.policy.referencePrice;
    const maxBuyPrice = fair + bps(fair, this.policy.maxSlippageBps);
    const minSellPrice = fair - bps(fair, this.policy.maxSlippageBps);
    const baseBalance = this.balanceOf(this.policy.baseAsset);
    const quoteBalance = this.balanceOf(this.policy.quoteAsset);

    if (intent.side === 'sell') {
      if (intent.price > maxBuyPrice) {
        return { accept: false, reason: `Sell intent too expensive: ${intent.price} > max ${round(maxBuyPrice, 6)}.` };
      }
      if (quoteBalance < intent.quoteAmount) {
        return { accept: false, reason: 'Not enough quote balance to buy this amount.' };
      }
      if (baseBalance + intent.baseAmount > this.policy.maxBaseInventory) {
        return { accept: false, reason: 'Buying would exceed max base inventory.' };
      }
      return { accept: true, reason: 'Counterparty ask is inside slippage and inventory limits.' };
    }

    if (intent.price < minSellPrice) {
      return { accept: false, reason: `Buy intent too cheap: ${intent.price} < min ${round(minSellPrice, 6)}.` };
    }
    if (baseBalance - intent.baseAmount < this.policy.minBaseInventory) {
      return { accept: false, reason: 'Selling would break the minimum base reserve.' };
    }
    return { accept: true, reason: 'Counterparty bid is inside slippage and inventory limits.' };
  }

  private balanceOf(asset: string): number {
    return this.balances.find((balance) => balance.asset === asset)?.available ?? 0;
  }

  private push(event: AuditEvent): void {
    this.auditLog.push(event);
    this.auditLog = this.auditLog.slice(-250);
  }
}
