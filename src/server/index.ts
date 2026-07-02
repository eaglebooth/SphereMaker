import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { appConfig } from './config';
import { MarketMakerAgent } from './agent';
import { DryRunMarketAdapter } from './adapters/dryRunAdapter';
import { LiveSphereAdapter } from './adapters/liveSphereAdapter';

const app = express();
app.use(cors());
app.use(express.json());

const adapter = appConfig.mode === 'live' ? new LiveSphereAdapter() : new DryRunMarketAdapter();
const agent = new MarketMakerAgent(adapter);

const policyPatchSchema = z.object({
  referencePrice: z.number().positive().optional(),
  spreadBps: z.number().min(1).max(5000).optional(),
  quoteSizeBase: z.number().positive().optional(),
  maxBaseInventory: z.number().positive().optional(),
  minBaseInventory: z.number().min(0).optional(),
  maxQuoteInventory: z.number().positive().optional(),
  maxOpenIntentsPerSide: z.number().int().min(1).max(5).optional(),
  tickMs: z.number().int().min(1500).max(60000).optional(),
  autoSettle: z.boolean().optional(),
  maxSlippageBps: z.number().min(1).max(2000).optional()
});

const demoIntentSchema = z.object({
  owner: z.string().optional(),
  side: z.enum(['buy', 'sell']),
  baseAmount: z.number().positive(),
  price: z.number().positive()
});

app.get('/api/state', (_req, res) => {
  res.json(agent.snapshot());
});

app.get('/api/wallet', (_req, res) => {
  res.json(agent.snapshot().wallet);
});

app.post('/api/agent/start', (_req, res) => {
  agent.start();
  res.json(agent.snapshot());
});

app.post('/api/agent/stop', (_req, res) => {
  agent.stop();
  res.json(agent.snapshot());
});

app.post('/api/agent/tick', async (_req, res, next) => {
  try {
    await agent.tick();
    res.json(agent.snapshot());
  } catch (error) {
    next(error);
  }
});

app.patch('/api/policy', (req, res) => {
  const patch = policyPatchSchema.parse(req.body);
  agent.updatePolicy(patch);
  res.json(agent.snapshot());
});

app.get('/api/demo/counterparty', (_req, res) => {
  if (!(adapter instanceof DryRunMarketAdapter)) {
    res.status(409).json({ error: 'Demo counterparty feed is only available in dry-run mode.' });
    return;
  }
  res.json({ intents: adapter.listSeededCounterpartyIntents() });
});

app.post('/api/demo/counterparty', (req, res) => {
  if (!(adapter instanceof DryRunMarketAdapter)) {
    res.status(409).json({ error: 'Demo counterparty feed is only available in dry-run mode.' });
    return;
  }
  const input = demoIntentSchema.parse(req.body);
  const intent = adapter.seedCounterpartyIntent(input, agent.snapshot().policy);
  res.json({ intent, state: agent.snapshot() });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(400).json({ error: message });
});

await agent.init();

app.listen(appConfig.port, '127.0.0.1', () => {
  console.log(`Sphere Maker API listening on http://127.0.0.1:${appConfig.port}`);
});
