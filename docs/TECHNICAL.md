# @srivtx/sports-workbench — Technical Documentation

Verifiable sports trading workbench. Built for the **TxLINE / TxODDS World Cup Hackathon** (Trading Tools and Agents track, Superteam Earn, July 19 2026).

## The problem

Every sports trading tool — backtesters, signal bots, market scanners — produces a number and says "trust me bro." P&L claims, strategy claims, hit rates: all opaque. Nobody anchors to a verifiable source.

**TxLINE** by TxODDS is the only sports data feed with cryptographic Merkle proofs on Solana. Every odds update, every score, every fixture change gets committed to an on-chain Merkle root. Anyone can verify the data the agent acted on was real, published at a specific time, and anchored to chain.

`@srivtx/sports-workbench` is the first tool that uses this capability for backtesting and live signal generation. Every signal ships with a verifiable receipt.

## Quick start

```bash
# zero install
npx -p @srivtx/sports-workbench sports-workbench --version

# subscribe to free tier (one-time, on-chain, ~0.002 SOL)
sports-workbench subscribe --devnet --level 1 --weeks 4

# set the API token
export TXLINE_API_TOKEN=<apiToken from above>

# stream live signals
sports-workbench signal --devnet --strategy sharpDetector --threshold 0.5 --state ./signals.json

# verify the latest signal
sports-workbench verify --devnet --state ./signals.json

# or verify a specific signal by index
sports-workbench verify --devnet --state ./signals.json --index 2

# backtest a strategy over 30 days
sports-workbench backtest --strategy sharpDetector --from 2026-06-01 --to 2026-07-10 --out report.json

# list available strategies
sports-workbench strategies

# check your environment
sports-workbench doctor

# list World Cup fixtures
sports-workbench fixtures

# get live odds for a fixture
sports-workbench odds 18257865
```

## Architecture

```
sports-workbench subscribe (one-time, on-chain activation)
  ├── subscribeOnChain() → builds IDL-discriminator instruction
  │     ├── derives pricing_matrix PDA, token_treasury PDA, user Token-2022 ATA
  │     ├── creates Token-2022 ATA in same tx if missing
  │     └── submits to txoracle program
  │           devnet: 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J
  │           mainnet: 9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA
  └── activateApiToken()
        ├── getGuestJwt() → POST /auth/guest/start
        ├── sign canonical message: <txSig>:<leagues>:<jwt>
        └── POST /api/token/activate → { apiToken: "txoracle_api_…" }

sports-workbench signal (live autonomous agent)
  └── TxLineClient.streamFreeTierOdds()
        └── TxlineTrader agent
              ├── SSE stream with Last-Event-ID resume
              ├── strategy evaluator (sharpDetector / momentum / meanReversion / custom)
              ├── fires signal when odds cross threshold
              ├── persists to --state file (JSON store, append-only)
              └── clean SIGINT shutdown (Ctrl+C saves all signals)

sports-workbench verify
  ├── reads signals from --state file (no copy-paste needed)
  ├── --index N picks specific signal from the store
  ├── --message-id + --ts for direct verification
  └── proveOdds()
        ├── GET /api/odds/validation?messageId=…&ts=…
        ├── returns Merkle proof (subTreeProof + mainTreeProof)
        ├── bundles as Verifiable Settlement Receipt
        └── derives dailyBatchRootsPda for on-chain verification

sports-workbench backtest (offline replay)
  ├── walks historical 5-min batches for date range
  │     for epochDay: for hour: for interval (12 per hour)
  ├── replays through strategy
  ├── proveOdds() per detected signal
  ├── simulates binary-outcome trades
  └── builds BacktestReport
        ├── P&L, Sharpe ratio, Sortino ratio, profit factor
        ├── total signals, verified count, win rate
        └── proof artifacts attached to every signal
```

## Commands

| Command | What it does |
|---|---|
| `subscribe --devnet` | One-time on-chain activation. Creates Token-2022 ATA, submits subscribe instruction, exchanges tx for API token. Free (0 TxL). |
| `signal --devnet --strategy <name> --threshold <pct>` | Autonomous agent. Connects to SSE stream, runs strategy, fires verifiable signals. Saves to `--state <file>`. Clean Ctrl+C shutdown. |
| `verify --devnet --state <file>` | Generates Verifiable Settlement Receipt for the latest stored signal. Use `--index N` to pick a specific one. |
| `backtest --strategy <name> --from <date> --to <date>` | Replays historical odds through strategy, produces full report with P&L, Sharpe, Sortino. |
| `strategies` | Lists all built-in strategies with descriptions. |
| `fixtures` | Lists latest World Cup fixtures from TxLINE. |
| `odds <fixtureId>` | Fetches live odds snapshot for a fixture. |
| `doctor` | Checks Node version, wallet, RPC, DNS, API token. Catches setup issues. |

## Strategies

| Name | When it fires |
|---|---|
| `sharpDetector` | Max absolute deltaPct across all outcomes > threshold. Official TxODDS idea #1. |
| `momentum` | Home win probability rises > thresholdPct in a 5-min window. Ride the trend. |
| `meanReversion` | Any outcome moves > thresholdPct. Bet on snap-back. |
| `custom` | Bring your own JavaScript strategy. Implement `evaluate(ctx, history, update)`. |

## Signal persistence

Signals are saved to a local JSON file (`--state` flag, defaults to `./signals.json`):

```json
[
  {
    "fixtureId": 18257865,
    "strategy": "sharpDetector",
    "deltaPct": 29.21,
    "messageId": "1838458902:00003:000186-10021-stab",
    "detectedAt": 1784450710172,
    "ts": 1784450710000,
    "proof": {
      "messageId": "1838458902:...",
      "merkleRoot": "0x...",
      "pda": "...",
      "programId": "..."
    }
  }
]
```

`verify --state` reads from this file directly — no copy-paste, no manual messageId entry. The `--index N` flag picks a specific signal from the store.

## On-chain verification

For every signal the agent fires, `proveOdds()` calls:

```
GET /api/odds/validation?messageId=…&ts=…
  → { odds, summary: { oddsSubTreeRoot, fixtureId, updateStats }, subTreeProof, mainTreeProof }
```

This returns the canonicalized sub-tree root for the 5-min batch plus the full proof path to the on-chain `dailyBatchRootsPda`. Every signal gets packaged as a **Verifiable Settlement Receipt**:

```ts
{
  messageId: string,
  ts: number,
  fixtureId: number,
  updateStats: object,
  subTreeProof: [{ hash: number[], isRightSibling: boolean }],
  mainTreeProof: [{ hash: number[], isRightSibling: boolean }],
  subTreeRoot: string, // hex
  pda: string, // dailyBatchRootsPda base58
  programId: string, // txoracle program base58
  view: {
    method: "validate_odds",
    computeUnits: 1_400_000,
    signer: null
  },
  generatedAt: number
}
```

Anyone can take this receipt, derive the PDAs, and call `validate_odds.view()` on-chain to re-check the proof against the Merkle root. Same result every time, on any machine, forever.

## Agent skills (for AI agents)

`sports-workbench` ships as a skill that any AI agent (Claude, opencode, Cursor agent, solana-agent-kit) can use. The agent doesn't need to know how Merkle proofs or TxLINE SSE streams work — it just calls the skill.

### SKILL.md

The `SKILL.md` at the package root tells AI agents when and how to use sports-workbench. It covers all commands, the subscribe→signal→verify flow, and the free tier setup.

### solana-agent-kit plugin

```ts
import { TxlinePlugin } from "@srivtx/sports-workbench/agent-kit";

agent.use(new TxlinePlugin({
  strategy: "sharpDetector",
  thresholdPct: 2,
  devnet: true,
}));

// agent can now call:
//   agent.txline.backtestOdds({ from: "2026-06-01", to: "2026-07-10" })
//   agent.txline.findSharpMove({ fixtureId: 18257865 })
//   agent.txline.getOdds({ fixtureId: 18257865 })
//   agent.txline.getFixtures()
//   agent.txline.proveOdds({ messageId: "...", ts: 1234567890 })
//   agent.txline.describeStrategy()
```

The plugin handles SSE streaming, proof fetching, and state management internally. The agent gets structured results with verifiable proofs attached.

### opencode / Claude skill

When an opencode or Claude agent is asked anything about sports data, the skill routes it through sports-workbench. The agent runs `npx -p @srivtx/sports-workbench sports-workbench <command>` and gets structured JSON back.

## Dashboard (sports-workbench.srivtx.xyz)

The web dashboard renders live data from the cron-captured signal store:

| Page | What it shows |
|---|---|
| `/signals/` | Live signal feed. Table with time, fixture ID, strategy, delta, odds movement, messageId. Filter by strategy. Copy buttons. Pulls from `/data/live-signals.json`. |
| `/receipts/` | Verifiable settlement receipts. Each row shows fixture, strategy, verify status, Merkle root. "View receipt" opens the explorer. Pulls from `/data/live-signals.json`. |
| `/fixtures/` | Current World Cup fixtures from TxLINE. |
| `/playground/` | Interactive strategy tester. Run backtests in browser. |
| `/install/` | 5-step install guide with copy-paste commands. |
| `/agent/` | Agent skills documentation. How to wire sports-workbench into any AI agent. |
| `/dev/` | API reference. Endpoints, auth flow, rate limits. |

Both `/signals/` and `/receipts/` are fully vanilla HTML/CSS/JS pages (no React, no framework dependency). They SPA-swap for smooth navigation and fetch live data from `/data/live-signals.json`.

## Automated signal capture (GitHub Actions)

A cron job runs hourly via `.github/workflows/refresh.yml`:

```yaml
on:
  schedule:
    - cron: "0 * * * *"  # every hour
```

Each run:
1. Installs `@srivtx/sports-workbench@latest`
2. Runs `sports-workbench signal --devnet --strategy sharpDetector --threshold 0.5 --state ./signals.json` for 120 seconds
3. Pushes captured signals to `vercel/data/live-signals.json`
4. Site redeploys automatically on Vercel

This keeps the dashboard populated with real signals even when no one is running the agent locally.

## TxLINE endpoints used

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /auth/guest/start` | none | 30-day JWT |
| `POST /api/token/activate` | JWT + wallet sig | exchange on-chain tx for API token |
| `GET /api/fixtures/snapshot/latest` | JWT | live fixtures |
| `GET /api/odds/snapshot/{fixtureId}` | JWT | odds snapshot |
| `GET /api/odds/updates/{epochDay}/{hour}/{interval}` | JWT | historical 5-min batches |
| `GET /api/odds/validation?messageId=…&ts=…` | JWT | Merkle proof |
| `GET /api/scores/historical/{fixtureId}` | JWT | settlement scores |
| `GET /api/odds/stream` (SSE) | JWT + X-Api-Token | live SSE stream |

All endpoints work on `txline-dev.txodds.com` (devnet) and `txline.txodds.com` (mainnet). The reference `oracle-dev.txodds.com` host is not in public DNS; sports-workbench uses the main domain with both `Authorization: Bearer <jwt>` and `X-Api-Token: <apiToken>` headers.

## Free tier

The TxLINE free tier (Service Level 1: 60s-delayed odds, Service Level 12: real-time World Cup) covers everything:
- Live signal agent (SSE stream)
- 30-day historical backtests
- All Merkle proof validation
- 8 major soccer leagues + World Cup

Zero TxL tokens. Zero payment. Only cost is ~0.002 SOL for the one-time `subscribe` on-chain transaction (Token-2022 ATA rent + tx fee). Token valid for 30 days.

## Why this is novel

| Project | What | Verifiable? | TxLINE? | Solana? | Agent skills? |
|---|---|---|---|---|---|
| `tradinglabpremium/sports-prediction-market-scanner` | backtester + signal | ❌ | ❌ | ❌ | ❌ |
| `thombanal/polymarket-fifa-arbitrage` | arb bot | ❌ | ❌ | ❌ (EVM) | ❌ |
| `machina-sports/sports-skills` | multi-sport skills | ❌ | ❌ | ❌ | partial |
| `matchmind` | AI companion | ❌ | partial | ❌ | ❌ |
| `proofball` | prediction market | partial | ✅ | ✅ | ❌ |
| `finalwhistle` | prop-bet | partial | ✅ | ✅ | ❌ |
| **`@srivtx/sports-workbench`** | **backtester + agent** | **✅** | **✅** | **✅** | **✅** |

Every signal is verifiable. Every backtest is reproducible. Every AI agent can use it. Nobody else has all three.

## License

MIT.
