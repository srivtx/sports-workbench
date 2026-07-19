# @srivtx/sports-workbench

A CLI tool that streams live sports odds, runs trading strategies against them, and proves every signal on chain. Built on TxLINE and Solana.

Version 0.1.11. MIT license.

## Why this exists

Most sports trading tools give you a number and call it a day. You have no way to check whether the data the bot acted on was real, whether it was published when they claim, or whether the signal even came from a real odds movement.

TxLINE (by TxODDS) fixes the data side. Every odds update flows through a Merkle tree and the root lands on Solana. So there's a cryptographic trail from any given odds update all the way to an on-chain commitment.

sports-workbench is the thing that actually uses that trail. Every signal it fires, every backtest trade it logs, gets a verifiable receipt with the Merkle proof attached. You can take that receipt, point it at the txoracle program on Solana, call `validate_odds.view()`, and get a yes/no — did this odds move really happen or not.

## What it does

Eight commands. Each one does one thing.

**subscribe** — one on-chain tx. Creates a Token-2022 ATA, submits a subscribe instruction to the txoracle program, exchanges the tx signature for a 30-day API token. Costs about 0.002 SOL. Free tier, zero TxL tokens.

**signal** — opens an SSE connection to TxLINE, streams live World Cup odds (or any of the 8 covered soccer leagues), feeds them through a strategy, and fires a signal when the odds cross your threshold. Saves everything to a local JSON file. Hit Ctrl+C and it shuts down clean, writes all pending signals.

**verify** — takes a signal from the JSON store and fetches its Merkle proof from TxLINE. Puts it in a Verifiable Settlement Receipt that anyone can re-check on chain. No copy-paste needed — just point it at the same `--state` file the agent writes to.

**backtest** — walks historical 5-minute odds batches for a date range, replays them through any strategy, simulates binary trades, spits out P&L, Sharpe, Sortino, profit factor, max drawdown. Every signal in the backtest is still individually verifiable.

**strategies** — lists the four built-in strategies with a one-line description of when each fires.

**fixtures** — dumps the latest World Cup fixtures from TxLINE as JSON.

**odds** — gets the current odds snapshot for one fixture.

**doctor** — checks your environment. Node version, npm prefix, wallet key, RPC endpoint, DNS, API token. Tells you what's wrong.

## How the pieces fit together

There are three layers.

Layer 1 is the CLI. Commander + TypeScript, compiled to ESM, published to npm as `@srivtx/sports-workbench`. You run it with `npx -p @srivtx/sports-workbench sports-workbench <command>`. No global install needed. It reads version from `package.json` at runtime so the banner never drifts.

Layer 2 is the TxLINE client. `src/client/txline.ts` wraps every API call. Guest JWT from `POST /auth/guest/start`. SSE stream from `GET /api/odds/stream` with `Last-Event-ID` resume. Historical batches from `GET /api/odds/updates/{day}/{hour}/{interval}`. Merkle proofs from `GET /api/odds/validation`. It uses both `Authorization: Bearer <jwt>` and `X-Api-Token: <apiToken>` headers because the free tier SSE stream requires both.

Layer 3 is the agent + strategies. `src/agent/workbench.ts` is `TxlineTrader` — it connects to the SSE stream and runs the strategy evaluator from `src/backtest/strategies.ts`. Same evaluation logic drives both live signals and backtests. The on-chain proof comes from `src/solana/verify.ts` which fetches the validation, derives the `dailyBatchRootsPda`, and packages the receipt.

### Architecture flow

```
subscribe (one-time)
  subscribeOnChain() → txoracle program
    derives pricing_matrix PDA, treasury PDA, user Token-2022 ATA
    creates ATA in same tx if missing
  activateApiToken()
    getGuestJwt() → sign(txSig:leagues:jwt) → POST /api/token/activate
    returns { apiToken: "txoracle_api_..." }

signal (long-running agent)
  TxLineClient.streamFreeTierOdds()
    SSE stream with Last-Event-ID resume, heartbeat keep-alive
  TxlineTrader agent
    strategy evaluator checks each odds update against threshold
    fires Signal { fixtureId, strategy, deltaPct, messageId, ts }
    proveOdds() per signal → fetches Merkle proof
    persists to --state JSON file (append-only)

verify (one signal)
  reads signal from --state file
  proveOdds() → GET /api/odds/validation?messageId=&ts=
  returns Verifiable Settlement Receipt with proof path

backtest (offline)
  for epochDay: for hour: for interval (12/hour)
    fetches odds batch from TxLINE
    replays through strategy evaluator
  simulate binary trades, compute P&L metrics
  proveOdds() on every detected signal
```

### Strategies

All four strategies share the same interface: `evaluate(ctx, history, current) → Signal | null`. They look at a 5-minute rolling window, compare current odds against the baseline, and fire if the delta crosses `thresholdPct`.

| Strategy | Logic |
|---|---|
| `sharpDetector` | Takes the max absolute delta across all outcomes (Home/Draw/Away). Fires if it's above threshold. This is TxODDS official idea #1. |
| `momentum` | Looks at the home team's implied probability. Fires if it went up more than threshold. Follows the money. |
| `meanReversion` | Same check as momentum but in either direction. Fires on any big move, betting it snaps back. |
| `custom` | Stub. You implement `evaluate` yourself and register it. |

### Verifiable Settlement Receipt

Every signal gets one of these:

```ts
{
  messageId: "1838458902:00003:000186-10021-stab",
  ts: 1784450710172,
  fixtureId: 18257865,
  updateStats: { updateCount, minTimestamp, maxTimestamp },
  subTreeProof: [{ hash: number[], isRightSibling: boolean }],
  mainTreeProof: [{ hash: number[], isRightSibling: boolean }],
  subTreeRoot: "0x...",
  pda: "BzX...",       // dailyBatchRootsPda
  programId: "6pW6...", // txoracle devnet
  view: {
    method: "validate_odds",
    computeUnits: 1400000,
    signer: null
  },
  generatedAt: 1784450715000
}
```

The proof path goes from the individual odds record → sub-tree root → main tree root → on-chain `dailyBatchRootsPda`. Anyone with this receipt can re-derive and check it. No trust required.

## Agent skills

sports-workbench ships with a `SKILL.md` that AI agents (opencode, Claude, Cursor, solana-agent-kit) read to understand what the tool does and how to call it.

The solana-agent-kit plugin (`src/agent-kit.ts`, import path `@srivtx/sports-workbench/agent-kit`) exposes six methods:

- `backtestOdds` — runs a backtest, returns the full report
- `findSharpMove` — connects to SSE stream, waits for first signal above threshold
- `getOdds` — odds snapshot for a fixture
- `getFixtures` — latest World Cup fixtures
- `proveOdds` — fetches Merkle proof for a messageId+ts
- `describeStrategy` — returns the active strategy's description

An agent just does `agent.use(new TxlinePlugin({ strategy, thresholdPct, devnet }))` and then calls `agent.txline.findSharpMove()`. It doesn't have to know about SSE streams, JWT auth, or Merkle trees.

For agents that run CLI tools directly (like opencode), the skill tells them to use `npx -p @srivtx/sports-workbench sports-workbench <command>` and parses the JSON output.

## Dashboard

Deployed at [sports-workbench.srivtx.xyz](https://sports-workbench.srivtx.xyz) on Vercel.

| Page | Content |
|---|---|
| `/signals/` | Live signal table. Fixture ID, strategy, delta, odds movement, messageId. Filter by strategy. Copy buttons. |
| `/receipts/` | Settlement receipts. Verify status, Merkle root, explorer links. |
| `/fixtures/` | Current World Cup fixtures. |
| `/playground/` | Interactive strategy tester. |
| `/install/` | 5-step installation guide. |
| `/agent/` | How to wire sports-workbench into AI agents. |
| `/dev/` | API reference and auth flow. |

`/signals/` and `/receipts/` are fully vanilla HTML pages. No React, no framework. They fetch live data from `/data/live-signals.json` and render tables with plain JavaScript. They SPA-swap between each other using a small `nav.js` script — all other pages do full page loads to avoid hydration issues with the Next.js exported pages.

## Cron job

A GitHub Action in `.github/workflows/refresh.yml` runs every hour:

1. Checks out the repo
2. Installs `@srivtx/sports-workbench@latest`
3. Runs `sports-workbench signal --devnet --strategy sharpDetector --threshold 0.5 --state ./signals.json` for 120 seconds
4. Commits the captured signals to `vercel/data/live-signals.json`
5. Pushes back to `main` (uses `contents: write` permission)

Vercel detects the push and redeploys. The dashboard always has fresh data, even when nobody has the agent running locally.

## TxLINE endpoints

| Endpoint | Headers | Used by |
|---|---|---|
| `POST /auth/guest/start` | — | subscribe, all authenticated calls |
| `POST /api/token/activate` | JWT + wallet sig | subscribe |
| `GET /api/fixtures/snapshot/latest` | JWT | fixtures command, backtest |
| `GET /api/odds/snapshot/{fixtureId}` | JWT | odds command |
| `GET /api/odds/updates/{day}/{hour}/{interval}` | JWT | backtest |
| `GET /api/odds/validation?messageId=&ts=` | JWT | verify, proveOdds |
| `GET /api/scores/historical/{fixtureId}` | JWT | backtest settlement |
| `GET /api/odds/stream` (SSE) | JWT + X-Api-Token | signal agent |

Everything works on `txline-dev.txodds.com` (devnet) and `txline.txodds.com` (mainnet). The `oracle-dev.txodds.com` subdomain from the reference examples does not resolve in public DNS — we use the main CloudFront domain for all calls.

## Free tier

Service Level 1 (60s delayed odds) and Service Level 12 (real-time World Cup) are both free. Zero TxL tokens. This covers the entire tool — signal agent, backtest engine, Merkle proof validation, all of it.

The only cost is the one-time `subscribe` on-chain transaction: ~0.002 SOL for the Token-2022 ATA rent plus transaction fee. The API token lasts 30 days.

## On-chain details

Devnet program: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`
Mainnet program: `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`

The `subscribe` instruction takes a `weeks` argument that must be a multiple of 4. One week gets rejected with error code 6041 (`InvalidWeeks`). We default to 4.

Token-2022 ATA creation happens in the same transaction as `subscribe`. The on-chain program rejects the instruction if the user's ATA isn't initialized, so we bundle both into one tx.

## Compared to other submissions

We compared against the top sports repos on GitHub:

- `tradinglabpremium/sports-prediction-market-scanner` (33 stars) — backtester and signal scanner. No on-chain verification, doesn't use TxLINE.
- `thombanal/polymarket-fifa-arbitrage` (225 stars) — arbitrage bot for Polymarket. EVM-based, different data source.
- `machina-sports/sports-skills` (156 stars) — multi-sport skill library. Good scope but no verification layer.
- `matchmind` (Consumer track) — AI companion for match predictions. Uses TxLINE partially, no on-chain anchoring.
- `proofball` (Prediction Markets track) — prediction market with partial on-chain verification.
- `finalwhistle` (Prediction Markets track) — prop betting, also partial on-chain.

sports-workbench is the only submission that does on-chain verification end to end, uses TxLINE as its sole data source, anchors to Solana, and ships as an agent skill.

## Development

```bash
git clone https://github.com/srivtx/sports-workbench
cd sports-workbench
npm install
npm run build        # tsc
node dist/cli/index.js --version
```

Published with `npm publish --access public`. Version read from `package.json` at runtime in both the banner and `--version` output.

## License

MIT.
