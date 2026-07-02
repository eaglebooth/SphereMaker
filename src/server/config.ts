import dotenv from 'dotenv';
import { z } from 'zod';
import type { AgentMode, MarketPolicy } from '../shared/types';

dotenv.config();

const envSchema = z.object({
  SPHERE_MODE: z.enum(['dry-run', 'live']).default('dry-run'),
  SPHERE_NETWORK: z.enum(['testnet', 'testnet2', 'mainnet', 'dev']).default('testnet'),
  SPHERE_ORACLE_API_KEY: z.string().default('sk_ddc3cfcc001e4a28ac3fad7407f99590'),
  SPHERE_WALLET_API_URL: z.string().url().default('https://wallet-api.unicity.network'),
  SPHERE_DEVICE_ID: z.string().default('sphere-maker-local'),
  SPHERE_NAMETAG: z.string().default('@sphere-maker'),
  SPHERE_AGENT_MNEMONIC: z.string().optional(),
  SPHERE_DIRECT_ADDRESS: z.string().optional(),
  SPHERE_CHAIN_PUBKEY: z.string().optional(),
  SPHERE_TRANSPORT_PUBKEY: z.string().optional(),
  SPHERE_ESCROW_ADDRESS: z.string().optional(),
  COUNTERPARTY_NAMETAG: z.string().default('@spheremaker-cptest'),
  COUNTERPARTY_AGENT_MNEMONIC: z.string().optional(),
  COUNTERPARTY_DIRECT_ADDRESS: z.string().optional(),
  COUNTERPARTY_CHAIN_PUBKEY: z.string().optional(),
  COUNTERPARTY_TRANSPORT_PUBKEY: z.string().optional(),
  PORT: z.coerce.number().default(8787)
});

export const env = envSchema.parse(process.env);

export const defaultPolicy: MarketPolicy = {
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

export const appConfig = {
  mode: env.SPHERE_MODE as AgentMode,
  port: env.PORT,
  agentName: env.SPHERE_NAMETAG
};
