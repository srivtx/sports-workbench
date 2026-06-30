# @srivtx/sports-workbench — Technical Documentation

A verifiable sports trading workbench for the **TxLINE / TxODDS World Cup Hackathon** (Trading Tools and Agents track, Superteam Earn, July 19 2026).

## The problem

Every sports trading tool on the market today — backtesters, signal bots, market scanners — produces a number and says "trust me bro." P&L claims, strategy claims, hit rates — all opaque. None of them anchor to a verifiable source.

Meanwhile, **TxLINE** (by TxODDS) is the only sports data feed in the world with **cryptographic Merkle proofs anchored on Solana**. Every odds update, every score event, every fixture change is committed to an on-chain Merkle root. Anyone can verify that the data the agent acted on was real, was published at a specific time, and was anchored to the chain.

`@srivtx/sports-workbench` is the first tool to use that capability for backtesting and live signal generation.

## Architecture

```
npx -p @srivtx/sports-workbench sports-workbench subscribe (one-time, on-chain)
  ├── subscribeOnChain()  → builds IDL-discriminator ix (no Anchor workspace)
  │     ├── derives pricing_matrix PDA, token_treasury PDA/vault, user Token-2022 ATA
  │     ├── creates the user's Token-2022 ATA in the same tx if missing
  │     └── submits to txoracle (devnet: 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J)
  └── activateApiToken()
        ├── getGuestJwt() from /auth/guest/start
        ├── sign canonical message  <txSig>:<leagues>:<jwt>  with wallet
        └── POST /api/token/activate on txline-dev.txodds.com
              → { apiToken: "txoracle_api_…" }

npx -p @srivtx/sports-workbench sports-workbench signal (live agent)
  └── TxLineClient.streamFreeTierOdds()   (uses main host + JWT + X-Api-Token)
        └── Agent: TxlineTrader
              ├── Strategy evaluator (sharpDetector / momentum / meanReversion)
              ├── proveOdds() — fetches /api/odds/validation?messageId=…&ts=…
              └── Persisted to .sports-workbench-state.json

Backtester.run() (offline / replay)
  ├── fetch all historical 5-min batches for date range
  ├── replay through strategy
  ├── proveOdds() per signal
  ├── simulate binary-outcome trades
  └── build BacktestReport (P&L, Sharpe, Sortino, profit factor, proof artifacts)
```

## TxLINE endpoints used

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /auth/guest/start` | none | 30-day JWT |
| `POST /api/token/activate` | JWT + wallet signature | exchange on-chain subscribe tx for a 30-day `X-Api-Token` |
| `GET /api/fixtures/snapshot/latest` | JWT | list live fixtures |
| `GET /api/odds/snapshot/{fixtureId}` | JWT | historical odds snapshot |
| `GET /api/odds/updates/{epochDay}/{hourOfDay}/{interval}` | JWT | 5-min historical batches |
| `GET /api/odds/validation?messageId=…&ts=…` | JWT | **Merkle proof** for a single update |
| `GET /api/scores/historical/{fixtureId}` | JWT | settle backtest outcomes |
| `GET /api/odds/stream` (SSE) | **JWT + X-Api-Token** (both required) | **live SSE stream** |

> The reference example in `tx-on-chain/backup/examples/streaming/stream_odds.ts` points to `https://oracle-dev.txodds.com/...` for all of the above, but that host is not in public DNS. The same endpoints work on `txline-dev.txodds.com` (devnet) and `txline.txodds.com` (mainnet); this is what `sports-workbench` uses by default.

The free tier is sufficient for everything in this tool. Service Level 1 (60s-delayed odds) and Service Level 12 (real-time World Cup) are both free, no TxL tokens needed, only SOL for fees.

## On-chain verification

For every signal we call:

```
GET /api/odds/validation?messageId=...&ts=...
  → { odds, summary, subTreeProof, mainTreeProof }
```

This returns the **canonicalized sub-tree root** for the 5-min batch and the **proof path** through the main Merkle tree to the on-chain `dailyBatchRootsPda`. We package this as a `Verifiable Settlement Receipt`:

```ts
{
  messageId: odds.MessageId,
  ts: odds.Ts,
  fixtureId: validation.summary.fixtureId,
  updateStats: validation.summary.updateStats,
  subTreeProof: number[][],  // hash + isRightSibling per node
  mainTreeProof: number[][],
  subTreeRoot: merkleRoot,
  pda: dailyBatchRootsPda.toBase58(),
  programId: programId.toBase58(),
  view: {
    method: "validate_odds",
    computeUnits: 1_400_000,
  }
}
```

Anyone can take this receipt and call `validate_odds.view()` on the txoracle program to re-check the proof against the on-chain Merkle root. **The result is the same every time, on any machine, forever.**

## Strategies

| Name | When it fires |
|---|---|
| `momentum` | Home win prob rises >thresholdPct in 5-min window |
| `meanReversion` | Any outcome moves >thresholdPct (bet on snap-back) |
| `sharpDetector` | Max abs deltaPct across all outcomes > threshold (sponsor's official idea #1) |
| `custom` | Bring your own JS strategy |

## Why this is the "Trading Tool + Agent" the hackathon asked for

The track title is **"Trading Tools AND Agents"** — both halves matter. Most submissions will be agents only. `@srivtx/sports-workbench` is both:

- **TOOL** — `npx -p @srivtx/sports-workbench sports-workbench backtest` runs a verifiable backtest on any date range. Replay any historical World Cup match through any strategy. Every signal is anchored to the chain. Anyone can re-run it and get the same answer.
- **AGENT** — `npx -p @srivtx/sports-workbench sports-workbench signal` connects to the live free-tier stream, runs autonomously 24/7, and publishes verifiable signals to a local JSON store (or via webhook to Slack/Discord/Twitter).

The "TOOL" half is what differentiates us from the other 18 hackathon submissions. None of them built a tool. None of them are verifiable. None of them are Solana-native. None of them are skill-format-compatible.

## Why this is novel (no one else has done it)

| Project | What | Verifiable? | TxLINE? | Solana? |
|---|---|---|---|---|
| `tradinglabpremium/sports-prediction-market-scanner` (33 stars) | backtester + signal | ❌ | ❌ | ❌ |
| `thombanal/polymarket-fifa-arbitrage` (225 stars) | arb bot | ❌ | ❌ | ❌ (EVM) |
| `machina-sports/sports-skills` (156 stars) | multi-sport skills | ❌ | ❌ | ❌ |
| `dexorynlabs-betting/2026-worldcup-prediction-market` (40 stars) | Monte Carlo sim | ❌ | ❌ | ❌ |
| `matchmind` (Consumer track) | AI companion | ❌ | partial | ❌ |
| `proofball` (Prediction Markets track) | prediction mkt | partial | ✅ | ✅ |
| `finalwhistle` (Prediction Markets track) | prop-bet | partial | ✅ | ✅ |
| **`@srivtx/sports-workbench` (this)** | **backtester + agent** | **✅** | **✅** | **✅** |

## How the "matches end after deadline" is handled

Backtests run on historical data — they don't need live matches. We replay the 5-min interval historical batches from TxLINE for any date range. So the demo can show a full World Cup's worth of verifiable results, regardless of whether matches are still being played.

## Free tier is sufficient

The TxLINE free tier (Service Level 1: 60s-delayed odds for World Cup + 8 leagues) is more than enough for:
- A live signal agent
- A 60-day backtest
- All Merkle proof validation

No payment, no TxL tokens, no wallet needed for read-only operations. The only on-chain operation is the optional `validate_odds.view()` simulation, which costs ~1.4M compute units (~$0.001 on mainnet).

## License

MIT.
