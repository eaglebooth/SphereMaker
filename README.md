# Sphere Maker

Sphere Maker is an autonomous market-making and swap agent for the Unicity Sphere ecosystem. The agent quotes both sides of a `UCT/ETH` testnet market, watches signed market intents, evaluates counterparties against risk limits, proposes swaps, and settles automatically when the policy allows it.

Builder Program track: **Payments and markets** with an **Autonomous agents** bonus angle.

## Reviewer Demo

Fast local review:

```bash
npm install
npm run dev
```

Create `.env` from `.env.example` first if you want to override the default dry-run settings.

Open `http://127.0.0.1:5173`, press **Start**, and watch:

- **Agent Quotes**: the `@chichi` agent publishes bid/ask intents.
- **Market Feed**: live trade tape showing both sides of each proposed swap.
- **Settlements**: swaps the agent proposed with the counterparty, including status.
- **Decision Audit**: policy decisions, proposal attempts, timeouts, and recovery.

Live Testnet v2 review:

```bash
npm run dev:api
npm run dev:web
npm run live:counterparty:responder
```

The live path uses real Sphere SDK market and swap primitives. Testnet relay/escrow may occasionally return proposal or subscription timeouts; the product handles those with bounded proposal timeouts and keeps the autonomous loop running instead of hanging.

Public hosted preview:

- The Vercel URL is a reviewer-friendly UI preview with demo fallback data when no backend API is attached.
- To exercise the real Sphere SDK agent wallet, market intents, and swap proposals, run the backend locally with the commands above.

## XP Target

Target submission tier: **Silver + Agentic Build = 3,500 XP**.

- Silver: working original build using Sphere SDK primitives for a clear market-making use case.
- Agentic bonus: the backend agent autonomously publishes intents, evaluates market opportunities, proposes swaps, and continues as a service loop.

Gold direction is documented, but this submission intentionally prioritizes a stable reviewer demo over risky escrow-specific changes while Testnet v2 settlement endpoints are intermittently timing out.

## Why This Is Agentic

The operator sets goals and limits once:

- pair and reference price
- spread
- quote size
- min/max inventory
- max slippage
- auto-settlement preference

After that, the agent runs its own loop:

1. reads balances
2. scans market intents
3. publishes bid/ask intents
4. rejects bad counterparties
5. proposes swaps for acceptable intents
6. settles swaps automatically if `autoSettle` is enabled
7. writes a human-readable audit trail

No human has to click "send" for each action.

## Modes

## Wallet Connection Model

Sphere Maker uses an **agent wallet**, not a normal user-clicks-every-transaction browser wallet.

That is intentional: an autonomous market maker must keep running after the operator closes the page. In live mode, the wallet is loaded by the backend agent from `.env`, then the dashboard shows safe public status only:

- mode
- network
- nametag
- wallet-api session
- public address when available
- whether a mnemonic is configured

The dashboard never receives or stores the mnemonic/private key.

To connect a real Testnet v2 wallet, set `SPHERE_MODE=live` and provide `SPHERE_AGENT_MNEMONIC` in `.env`. In dry-run mode, the app shows a simulated wallet so reviewers can test the autonomous loop immediately.

### Dry-run mode

Default mode. It uses an in-memory simulated Sphere market so the product can be reviewed immediately.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

### Live Sphere SDK mode

Create `.env` from `.env.example` and set:

```bash
SPHERE_MODE=live
SPHERE_NAMETAG=@your-agent
SPHERE_AGENT_MNEMONIC="your testnet wallet recovery phrase"
```

Then run:

```bash
npm run dev
```

The live adapter initializes Sphere SDK with:

- network: `testnet` / Testnet v2
- public testnet gateway key from the official SDK docs
- wallet API: `https://wallet-api.unicity.network`
- wallet-api delivery/token-storage providers

The adapter is intentionally isolated in `src/server/adapters/liveSphereAdapter.ts`, so SDK method-name changes can be handled there without changing the strategy or UI.

## Product Surface

- autonomous start/pause control
- one-tick manual run for demos
- editable risk policy
- demo counterparty bot for reproducible agent-to-agent swaps
- balances
- active agent quotes
- market feed
- proposed/settled swaps
- decision audit log

## Architecture

```text
React dashboard
   |
   | HTTP /api/*
   v
Express API
   |
   v
MarketMakerAgent
   |
   +-- DryRunMarketAdapter
   |
   +-- LiveSphereAdapter -> @unicitylabs/sphere-sdk -> Testnet v2
```

Core files:

- `src/server/agent.ts`: autonomous market-maker loop and policy guard
- `src/server/adapters/dryRunAdapter.ts`: deterministic demo market
- `src/server/adapters/liveSphereAdapter.ts`: Sphere SDK integration boundary
- `src/server/demoCounterparty.ts`: repeatable counterparty bot that posts matching intents into the dry-run market
- `src/server/demoScenario.ts`: short autonomous swap scenario for reviewers
- `src/client/App.tsx`: reviewer/operator dashboard
- `src/shared/types.ts`: shared product/domain types

## Demo Scripts

Run a short local scenario:

```bash
npm run demo:scenario
```

Run a continuous local counterparty feed:

```bash
npm run demo:counterparty
```

## Live Counterparty

For live Testnet v2 testing, use two fresh testnet wallets and keep both mnemonics in `.env` only.

```bash
npm run live:counterparty
npm run live:scenario
```

Live swap proposals default to the current Sphere SDK test escrow, `@escrow-test-02`. Override `SPHERE_ESCROW_ADDRESS` only if the Sphere team publishes a newer trusted escrow for Testnet v2.
