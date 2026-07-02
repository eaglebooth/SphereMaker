# Sphere Maker Submission Form

## Name
Sphere Maker

## Slug
sphere-maker

## Tagline
Autonomous liquidity and swap agent for Unicity Testnet v2.

## Description
Sphere Maker is an autonomous market-making agent for the Unicity Sphere ecosystem. It loads an agent wallet on the backend, publishes bid and ask intents for a UCT/ETH testnet market, watches other agents' market intents, evaluates them against configurable risk limits, and proposes swaps without a human approving each action.

The dashboard shows live agent wallet status, balances, active quotes, a trade-style market feed, proposed settlements, and a decision audit log. A companion counterparty agent can run in the background to publish matching intents and respond to swaps, making the demo reproducible for reviewers.

This is intentionally an agent-wallet product rather than a browser-wallet dApp: the operator sets goals and limits once, then the agent keeps running as a service loop. The frontend never receives the mnemonic/private key.

Current target: Silver tier plus Agentic Build bonus. The live Testnet v2 flow uses Sphere SDK market and swap primitives. Because testnet relay/escrow can occasionally return proposal/subscription timeouts, the agent has bounded proposal timeouts and continues running instead of hanging.

## Category
Payments and markets

If the portal does not have that exact category, choose: Open, Finance, Tool, AI Agent, or DeFi.

## Tags
AUTONOMOUS AGENT
PAYMENTS
MARKET
SWAP
P2P
TESTNET
SDK

## Website URL
TODO: paste public repository URL or project landing page URL.

## App URL
TODO: paste deployed public app URL. Do not use localhost for final submission.

## Build Path
Payments and markets, with Autonomous agents bonus.

## Agentic Claim
Yes. The backend agent autonomously publishes intents, evaluates counterparties, proposes swaps, records settlement status, and continues as a loop/service. A human sets policy limits but does not click through each economic action.

## Runs on AstridOS
No.

## Reviewer Run Instructions
1. Install dependencies: `npm install`
2. Create `.env` from `.env.example`
3. For dry-run review: `npm run dev`
4. For live Testnet v2 review: set `SPHERE_MODE=live`, configure a testnet mnemonic, then run:
   - `npm run dev:api`
   - `npm run dev:web`
   - `npm run live:counterparty:responder`
5. Open `http://127.0.0.1:5173`
6. Press Start and watch Agent Quotes, Market Feed, Settlements, and Decision Audit.

## Media Assets
Logo: `submission-assets/sphere-maker-logo.png`
Banner: `submission-assets/sphere-maker-banner.png`
Screenshot: `submission-assets/sphere-maker-screenshot.png`
