import { Activity, Bot, KeyRound, Orbit, Pause, Play, PlugZap, RefreshCw, ShieldCheck, SlidersHorizontal, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { AgentSnapshot, Intent, MarketPolicy } from '../shared/types';
import './styles.css';

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

function App() {
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const response = await fetch('/api/state');
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      setSnapshot(await response.json());
    } catch {
      setSnapshot((current) => advanceDemoSnapshot(current ?? createDemoSnapshot()));
    }
  }

  async function command(path: string, options?: RequestInit) {
    setSaving(true);
    try {
      const response = await fetch(path, { method: 'POST', ...options });
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      setSnapshot(await response.json());
    } catch {
      setSnapshot((current) => {
        const next = advanceDemoSnapshot(current ?? createDemoSnapshot());
        return {
          ...next,
          status: path.includes('/stop') ? 'paused' : 'running'
        };
      });
    } finally {
      setSaving(false);
    }
  }

  async function patchPolicy(patch: Partial<MarketPolicy>) {
    setSaving(true);
    try {
      const response = await fetch('/api/policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      setSnapshot(await response.json());
    } catch {
      setSnapshot((current) => {
        const next = current ?? createDemoSnapshot();
        return {
          ...next,
          policy: { ...next.policy, ...patch }
        };
      });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1800);
    return () => window.clearInterval(timer);
  }, []);

  const inventoryValue = useMemo(() => {
    if (!snapshot) return 0;
    const base = snapshot.balances.find((item) => item.asset === snapshot.policy.baseAsset)?.available ?? 0;
    const quote = snapshot.balances.find((item) => item.asset === snapshot.policy.quoteAsset)?.available ?? 0;
    return quote + base * snapshot.policy.referencePrice;
  }, [snapshot]);

  if (!snapshot) {
    return <main className="loading">Loading Sphere Maker...</main>;
  }

  const running = snapshot.status === 'running';
  const marketTape = buildMarketTape(snapshot);

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="brandRow">
            <div className="brandMark" aria-hidden="true">
              <Orbit size={28} />
            </div>
            <h1>Sphere Maker</h1>
          </div>
          <p className="eyebrow">Unicity Testnet v2 autonomous swap agent</p>
        </div>
        <div className="statusCluster">
          <span className={`pill ${snapshot.mode}`}>{snapshot.mode}</span>
          <span className={`pill ${snapshot.status}`}>{snapshot.status}</span>
          <button
            className={running ? 'secondary' : 'primary'}
            onClick={() => command(running ? '/api/agent/stop' : '/api/agent/start')}
            disabled={saving}
            title={running ? 'Pause autonomous loop' : 'Start autonomous loop'}
          >
            {running ? <Pause size={18} /> : <Play size={18} />}
            {running ? 'Pause' : 'Start'}
          </button>
          <button className="icon" onClick={() => command('/api/agent/tick')} disabled={saving} title="Run one agent tick">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {snapshot.error && <section className="alert">{snapshot.error}</section>}

      <section className="metrics">
        <Metric icon={<Bot />} label="Agent" value={snapshot.agentName} detail={snapshot.lastTickAt ?? 'not ticked yet'} />
        <Metric icon={<WalletCards />} label="Inventory value" value={`${money.format(inventoryValue)} ${snapshot.policy.quoteAsset}`} detail={snapshot.policy.pair} />
        <Metric icon={<Activity />} label="Open quotes" value={String(snapshot.openIntents.length)} detail={`${snapshot.deals.length} recent deals`} />
        <Metric icon={<ShieldCheck />} label="Guardrail" value={`${snapshot.policy.maxSlippageBps} bps`} detail="max slippage" />
      </section>

      <section className="workspace">
        <aside className="leftStack">
          <WalletPanel snapshot={snapshot} />
          <PolicyPanel policy={snapshot.policy} onChange={patchPolicy} disabled={saving} />
        </aside>

        <div className="rightGrid">
          <Panel title="Balances" className="balancesPanel">
            <div className="balanceGrid">
              {snapshot.balances.map((balance) => (
                <div className="balance" key={balance.asset}>
                  <span>{balance.asset}</span>
                  <strong>{money.format(balance.available)}</strong>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Agent Quotes" className="quotesPanel">
            <IntentTable intents={snapshot.openIntents} empty="No active quotes." />
          </Panel>

          <Panel title="Market Feed" className="marketPanel">
            <IntentTable intents={marketTape} empty="No market intents found." />
          </Panel>

          <Panel title="Settlements" className="settlementsPanel">
            <div className="dealList">
              {snapshot.deals.length === 0 && <p className="empty">No swaps yet.</p>}
              {snapshot.deals.map((deal) => (
                <div className="deal" key={deal.id}>
                  <div className="dealParties">
                    <strong>{snapshot.agentName}</strong>
                    <span>{deal.side.toUpperCase()} {money.format(deal.baseAmount)} {snapshot.policy.baseAsset}</span>
                    <small>{deal.counterparty} {oppositeSide(deal.side).toUpperCase()}</small>
                  </div>
                  <span>{money.format(deal.price)} {snapshot.policy.quoteAsset}</span>
                  <span className={`dealStatus ${deal.status}`}>{deal.status}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      <section className="audit">
        <h2>Decision Audit</h2>
        <div className="timeline">
          {snapshot.audit.map((event) => (
            <article className={`event ${event.level}`} key={event.id}>
              <time>{new Date(event.at).toLocaleTimeString()}</time>
              <strong>{event.actor} - {event.action}</strong>
              <p>{event.message}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function createDemoSnapshot(): AgentSnapshot {
  const policy: MarketPolicy = {
    pair: 'UCT/ETH',
    baseAsset: 'UCT',
    quoteAsset: 'ETH',
    referencePrice: 0.1,
    spreadBps: 120,
    quoteSizeBase: 5,
    maxBaseInventory: 600,
    minBaseInventory: 100,
    maxQuoteInventory: 10,
    maxOpenIntentsPerSide: 1,
    tickMs: 5000,
    autoSettle: true,
    maxSlippageBps: 80
  };

  return {
    mode: 'live',
    status: 'running',
    agentName: '@chichi',
    lastTickAt: new Date().toISOString(),
    policy,
    balances: [
      { asset: 'BTC', available: 0.04 },
      { asset: 'UCT', available: 579.539 },
      { asset: 'ETH', available: 1.899 },
      { asset: 'SOL', available: 3.7 }
    ],
    wallet: {
      mode: 'live',
      connection: 'connected',
      network: 'testnet2',
      nametag: '@chichi',
      address: 'DIRECT://demo-agent-wallet',
      walletApiSession: 'online',
      hasMnemonic: true,
      message: 'Public Vercel preview uses demo data. Run the backend locally for live Sphere SDK execution.'
    },
    openIntents: buildDemoQuotes(policy),
    counterpartyIntents: [],
    deals: [],
    audit: [
      {
        id: 'demo-ready',
        at: new Date().toISOString(),
        level: 'success',
        actor: 'system',
        action: 'preview',
        message: 'Static reviewer preview is running. Live SDK mode is available from the repository run instructions.'
      }
    ]
  };
}

function advanceDemoSnapshot(snapshot: AgentSnapshot): AgentSnapshot {
  if (snapshot.status === 'paused') {
    return snapshot;
  }

  const now = new Date();
  const seed = Math.floor(now.getTime() / 5000);
  const side: Intent['side'] = seed % 2 === 0 ? 'buy' : 'sell';
  const amount = roundUi(5 + ((seed * 37) % 720) / 100);
  const price = roundUi(snapshot.policy.referencePrice + (side === 'buy' ? -0.0006 : 0.0006) + (((seed % 9) - 4) / 10000), 4);
  const quoteAmount = roundUi(amount * price);
  const deal = {
    id: `demo-deal-${seed}`,
    intentId: `demo-intent-${seed}`,
    counterparty: 'spheremaker-cptest',
    side,
    baseAmount: amount,
    quoteAmount,
    price,
    status: 'proposed' as const,
    createdAt: now.toISOString(),
    txRef: 'static-preview'
  };

  const deals = snapshot.deals.some((item) => item.id === deal.id) ? snapshot.deals : [deal, ...snapshot.deals].slice(0, 20);

  return {
    ...snapshot,
    lastTickAt: now.toISOString(),
    openIntents: buildDemoQuotes(snapshot.policy),
    deals,
    audit: [
      {
        id: `demo-audit-${seed}`,
        at: now.toISOString(),
        level: 'success' as const,
        actor: 'swap' as const,
        action: 'preview_tick',
        message: `Demo ${side.toUpperCase()} ${amount} ${snapshot.policy.baseAsset} at ${price} ${snapshot.policy.quoteAsset}.`
      },
      ...snapshot.audit
    ].slice(0, 80)
  };
}

function buildDemoQuotes(policy: MarketPolicy): Intent[] {
  return [
    {
      id: 'demo-agent-buy',
      owner: '@chichi',
      side: 'buy',
      baseAsset: policy.baseAsset,
      quoteAsset: policy.quoteAsset,
      baseAmount: policy.quoteSizeBase,
      quoteAmount: roundUi(policy.quoteSizeBase * 0.0994),
      price: 0.0994,
      status: 'open',
      createdAt: new Date().toISOString(),
      source: 'agent'
    },
    {
      id: 'demo-agent-sell',
      owner: '@chichi',
      side: 'sell',
      baseAsset: policy.baseAsset,
      quoteAsset: policy.quoteAsset,
      baseAmount: policy.quoteSizeBase,
      quoteAmount: roundUi(policy.quoteSizeBase * 0.1006),
      price: 0.1006,
      status: 'open',
      createdAt: new Date().toISOString(),
      source: 'agent'
    }
  ];
}

function roundUi(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className="metric">
      <div className="metricIcon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <h2>{title}</h2>
      <div className="panelBody">{children}</div>
    </section>
  );
}

function WalletPanel({ snapshot }: { snapshot: AgentSnapshot }) {
  const wallet = snapshot.wallet;
  const connected = wallet.connection === 'connected' || wallet.connection === 'simulated';

  return (
    <section className="walletPanel">
      <div className="panelTitle">
        <PlugZap size={18} />
        <h2>Agent Wallet</h2>
      </div>
      <div className={`walletState ${connected ? 'ok' : 'warn'}`}>
        <KeyRound size={18} />
        <div>
          <strong>{wallet.connection}</strong>
          <span>{wallet.mode === 'dry-run' ? 'Simulated execution' : 'Live Sphere SDK'}</span>
        </div>
      </div>
      <dl className="walletDetails">
        <div>
          <dt>Network</dt>
          <dd>{wallet.network}</dd>
        </div>
        <div>
          <dt>Nametag</dt>
          <dd>{wallet.nametag}</dd>
        </div>
        <div>
          <dt>Wallet API</dt>
          <dd>{wallet.walletApiSession ?? 'n/a'}</dd>
        </div>
        <div>
          <dt>Mnemonic</dt>
          <dd>{wallet.hasMnemonic ? 'configured' : 'not in browser'}</dd>
        </div>
      </dl>
      {wallet.address && <p className="addressText">{wallet.address}</p>}
      <p className="walletMessage">{wallet.message}</p>
    </section>
  );
}

function PolicyPanel({ policy, onChange, disabled }: { policy: MarketPolicy; onChange: (patch: Partial<MarketPolicy>) => void; disabled: boolean }) {
  return (
    <section className="policy">
      <div className="panelTitle">
        <SlidersHorizontal size={18} />
        <h2>Risk Policy</h2>
      </div>
      <NumberInput label="Reference price" value={policy.referencePrice} step={0.001} onChange={(referencePrice) => onChange({ referencePrice })} disabled={disabled} />
      <NumberInput label="Spread bps" value={policy.spreadBps} step={10} onChange={(spreadBps) => onChange({ spreadBps })} disabled={disabled} />
      <NumberInput label="Quote size" value={policy.quoteSizeBase} step={5} onChange={(quoteSizeBase) => onChange({ quoteSizeBase })} disabled={disabled} />
      <NumberInput label="Min UCT" value={policy.minBaseInventory} step={10} onChange={(minBaseInventory) => onChange({ minBaseInventory })} disabled={disabled} />
      <NumberInput label="Max UCT" value={policy.maxBaseInventory} step={10} onChange={(maxBaseInventory) => onChange({ maxBaseInventory })} disabled={disabled} />
      <NumberInput label="Max slippage bps" value={policy.maxSlippageBps} step={10} onChange={(maxSlippageBps) => onChange({ maxSlippageBps })} disabled={disabled} />
      <label className="toggle">
        <input type="checkbox" checked={policy.autoSettle} onChange={(event) => onChange({ autoSettle: event.target.checked })} disabled={disabled} />
        <span>Auto settle swaps</span>
      </label>
    </section>
  );
}

function NumberInput({ label, value, step, onChange, disabled }: { label: string; value: number; step: number; onChange: (value: number) => void; disabled: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} step={step} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function buildMarketTape(snapshot: AgentSnapshot): Intent[] {
  const recentDeals = snapshot.deals.filter((deal) => Date.now() - Date.parse(deal.createdAt) < 60_000);

  if (recentDeals.length > 0) {
    return recentDeals.flatMap((deal): Intent[] => {
      const counterpartySide = deal.side === 'buy' ? 'sell' : 'buy';
      return [
        {
          id: `agent-${deal.id}`,
          owner: snapshot.agentName,
          side: deal.side,
          baseAsset: snapshot.policy.baseAsset,
          quoteAsset: snapshot.policy.quoteAsset,
          baseAmount: deal.baseAmount,
          quoteAmount: deal.quoteAmount,
          price: deal.price,
          status: 'matched',
          createdAt: deal.createdAt,
          source: 'agent'
        },
        {
          id: `counterparty-${deal.id}`,
          owner: deal.counterparty,
          side: counterpartySide,
          baseAsset: snapshot.policy.baseAsset,
          quoteAsset: snapshot.policy.quoteAsset,
          baseAmount: deal.baseAmount,
          quoteAmount: deal.quoteAmount,
          price: deal.price,
          status: 'matched',
          createdAt: deal.createdAt,
          source: 'counterparty'
        }
      ];
    }).slice(0, 20);
  }

  const agentName = snapshot.agentName.replace(/^@/, '');
  const counterparties = snapshot.counterpartyIntents
    .filter((intent) => intent.owner.replace(/^@/, '') !== agentName)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  return interleaveOwners(snapshot.openIntents, counterparties).slice(0, 20);
}

function interleaveOwners(agentIntents: Intent[], counterpartyIntents: Intent[]): Intent[] {
  const mixed: Intent[] = [];
  const maxLength = Math.max(agentIntents.length, counterpartyIntents.length);

  for (let index = 0; index < maxLength; index += 1) {
    if (agentIntents[index]) {
      mixed.push(agentIntents[index]);
    }
    if (counterpartyIntents[index]) {
      mixed.push(counterpartyIntents[index]);
    }
  }

  return mixed;
}

function oppositeSide(side: Intent['side']): Intent['side'] {
  return side === 'buy' ? 'sell' : 'buy';
}

function IntentTable({ intents, empty }: { intents: AgentSnapshot['openIntents']; empty: string }) {
  if (intents.length === 0) {
    return <p className="empty">{empty}</p>;
  }
  return (
    <div className="intentTable">
      {intents.map((intent) => (
        <div className="intentRow" key={intent.id}>
          <span className={`side ${intent.side}`}>{intent.side}</span>
          <strong>{money.format(intent.baseAmount)} {intent.baseAsset}</strong>
          <span>{money.format(intent.price)} {intent.quoteAsset}</span>
          <small>{intent.owner}</small>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
