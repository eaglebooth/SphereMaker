export type AgentMode = 'dry-run' | 'live';
export type AgentStatus = 'idle' | 'running' | 'paused' | 'error';
export type Side = 'buy' | 'sell';

export interface MarketPolicy {
  pair: string;
  baseAsset: string;
  quoteAsset: string;
  referencePrice: number;
  spreadBps: number;
  quoteSizeBase: number;
  maxBaseInventory: number;
  minBaseInventory: number;
  maxQuoteInventory: number;
  maxOpenIntentsPerSide: number;
  tickMs: number;
  autoSettle: boolean;
  maxSlippageBps: number;
}

export interface Balance {
  asset: string;
  available: number;
}

export interface Intent {
  id: string;
  owner: string;
  side: Side;
  baseAsset: string;
  quoteAsset: string;
  baseAmount: number;
  quoteAmount: number;
  price: number;
  status: 'open' | 'matched' | 'settled' | 'cancelled';
  createdAt: string;
  expiresAt?: string;
  source: 'agent' | 'counterparty';
}

export interface SwapDeal {
  id: string;
  intentId: string;
  counterparty: string;
  side: Side;
  baseAmount: number;
  quoteAmount: number;
  price: number;
  status: 'proposed' | 'accepted' | 'settled' | 'rejected' | 'failed';
  createdAt: string;
  settledAt?: string;
  txRef?: string;
}

export interface WalletStatus {
  mode: AgentMode;
  connection: 'simulated' | 'configured' | 'connected' | 'offline' | 'missing';
  network: string;
  nametag: string;
  address?: string;
  walletApiSession?: 'online' | 'offline' | null;
  hasMnemonic: boolean;
  message: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  level: 'info' | 'warn' | 'error' | 'success';
  actor: 'agent' | 'policy' | 'market' | 'swap' | 'system';
  action: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface AgentSnapshot {
  mode: AgentMode;
  status: AgentStatus;
  agentName: string;
  lastTickAt?: string;
  policy: MarketPolicy;
  balances: Balance[];
  wallet: WalletStatus;
  openIntents: Intent[];
  counterpartyIntents: Intent[];
  deals: SwapDeal[];
  audit: AuditEvent[];
  error?: string;
}

export interface MarketAdapter {
  mode: AgentMode;
  init(): Promise<void>;
  getBalances(): Promise<Balance[]>;
  listCounterpartyIntents(policy: MarketPolicy): Promise<Intent[]>;
  publishIntent(intent: Omit<Intent, 'id' | 'status' | 'createdAt' | 'source'>): Promise<Intent>;
  cancelIntent(intentId: string): Promise<void>;
  proposeSwap(intent: Intent, policy: MarketPolicy): Promise<SwapDeal>;
  settleSwap(deal: SwapDeal): Promise<SwapDeal>;
  getWalletStatus(): WalletStatus;
}

export interface DemoCounterpartyIntentInput {
  owner?: string;
  side: Side;
  baseAmount: number;
  price: number;
}
