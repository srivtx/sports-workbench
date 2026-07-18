---
name: sports-workbench
description: Backtest sports trading strategies against historical TxLINE odds, stream live signals from the free World Cup tier, and generate Verifiable Settlement Receipts anchored to Solana. Use when the user wants verifiable sports trading data, Merkle proof-backed odds, or on-chain attestation of signal data.
---

# Sports Workbench

A verifiable sports trading workbench for the TxLINE / TxODDS World Cup Hackathon. Backtest, signal, and verify on Solana.

## When to use

- The user wants to backtest a sports trading strategy against historical TxLINE odds
- The user wants to detect sharp odds movements on the live free-tier World Cup stream
- The user wants to generate a Verifiable Settlement Receipt for any odds update (Merkle proof anchored on Solana)
- The user is building a solana-agent-kit agent and wants TxLINE data + verification

## How to use

**Zero install (works anywhere with Node 20+):**
```bash
npx -p @srivtx/sports-workbench sports-workbench --version
```

**Or install globally (no sudo, no PATH issues):**
```bash
curl -fsSL https://sports-workbench.srivtx.xyz/install.sh | bash
```

**Run a backtest:**
```bash
npx -p @srivtx/sports-workbench sports-workbench backtest \
  --strategy sharpDetector --from 2026-06-01 --to 2026-07-10 --out report.json
```

**Subscribe + start the live signal agent:**
```bash
# Step 1: one-time, costs ~0.002 SOL, 0 TxL
npx -p @srivtx/sports-workbench sports-workbench subscribe --devnet --level 1 --weeks 4
# → returns { txSig, apiToken, ... }
export TXLINE_API_TOKEN=<apiToken from above>

# Step 2: stream live signals
npx -p @srivtx/sports-workbench sports-workbench signal \
  --strategy sharpDetector --threshold 0.5 --devnet
```

**Generate a Verifiable Settlement Receipt:**
```bash
# latest stored signal — no copy-paste needed:
npx -p @srivtx/sports-workbench sports-workbench verify --state .sports-workbench-state.json
# or any odds update directly:
npx -p @srivtx/sports-workbench sports-workbench verify --message-id <id> --ts <ms>
```

**As a solana-agent-kit plugin:**
```ts
import { TxlinePlugin } from "@srivtx/sports-workbench/agent-kit";
agent.use(new TxlinePlugin({ strategy: "sharpDetector", thresholdPct: 2 }));
```

**Self-heal if you hit a permission / env error:**
```bash
npx -p @srivtx/sports-workbench sports-workbench doctor --fix
```

## TxLINE endpoints used

- `POST /auth/guest/start` — guest JWT (works on `txline.txodds.com` or `txline-dev.txodds.com`)
- `POST /api/token/activate` — exchange on-chain subscribe tx for a 30-day `X-Api-Token`
- `GET /api/fixtures/snapshot` — fixture list (use optional `?competitionId=`)
- `GET /api/odds/snapshot/{fixtureId}` — historical odds snapshot
- `GET /api/odds/updates/{epochDay}/{hourOfDay}/{interval}` — 5-min historical odds
- `GET /api/odds/validation?messageId=…&ts=…` — Merkle proof
- `GET /api/scores/historical/{fixtureId}` — settlement scores
- `GET /api/odds/stream` (SSE) — live stream (requires BOTH `Authorization: Bearer <jwt>` AND `X-Api-Token: <apiToken>`)

## Free tier

Runs entirely on the TxLINE free World Cup tier (Service Level 1 or 12, both 0 TxL tokens). No payment required for the hackathon. The `subscribe` command costs ~0.002 SOL one-time (for the Token-2022 ATA rent + tx fee); the token is valid for 30 days.
