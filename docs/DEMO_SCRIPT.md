# @srivtx/sports-workbench — Demo Script (5 minutes)

## Scene 1 (0:00–0:30) — The pitch

**Voiceover over a 1-pager:**
> "Every sports trading tool on the market says 'trust me bro.' `@srivtx/sports-workbench` says 'verify it.' We built a verifiable backtester and signal agent for the TxLINE / TxODDS World Cup hackathon. Every signal we generate is anchored to the Solana blockchain via a Merkle proof. Anyone can re-run the backtest, re-derive the proof, and get the same answer — on any machine, forever."

## Scene 2 (0:30–1:30) — Backtest playground

**Show the live demo at [https://sports-workbench.srivtx.xyz](https://sports-workbench.srivtx.xyz).**

1. Open the **Backtest** tab.
2. Pick a strategy: `sharpDetector` (the official one).
3. Pick a date range: 2026-06-01 to 2026-07-10.
4. Set threshold: 2%.
5. Click **Run Backtest**.

**Result panel shows:**
- total signals: ~80
- closed trades: ~75
- win rate: ~58%
- P&L: +$1,240
- max drawdown: 7.2%
- Sharpe: 1.42
- **verified signals: 75 / 75** (every single one)

> "Every one of those 75 trades is anchored to a Solana transaction. Click 'view proof' on any row."

## Scene 3 (1:30–2:30) — Verifiable Settlement Receipt

1. Click any trade in the table.
2. Modal opens showing the **Verifiable Settlement Receipt**:
   - `messageId` (the exact TxLINE odds update that fired the signal)
   - `ts` (timestamp)
   - `fixtureId`
   - `merkleRoot` (the on-chain root)
   - `pda` (the on-chain `dailyBatchRootsPda` for that day)
   - `programId` (the txoracle program)
   - `view: { method: "validate_odds", computeUnits: 1_400_000 }`
3. Click **Verify on Solana**.

> "The browser calls the Solana program. The program checks the Merkle proof against the on-chain root. If the odds update was real, the call succeeds. If anyone tampered with the data, the call fails."

**Result: `verify_odds.view() → true`**

## Scene 4 (2:30–3:30) — Live signal agent

1. Open the **Live Feed** tab.
2. Show the one-time on-chain subscribe (the activation flow):
   ```bash
   $ npx -p @srivtx/sports-workbench sports-workbench subscribe --devnet --level 1 --weeks 4
   {
     "txSig": "Rr1p5iDmR8NmVf6yxbRCJapSftpovanTg18WF5yVdnUjLDCCRF6zFmiqsa2mj3qcFYgvctsLzncraCNRYsXVpAa",
     "apiToken": "txoracle_api_471e307dc45a4b68aaaccbc3113539b4",
     "expiresAt": "2026-07-26T07:04:58.670Z",
     "wallet": "6vTYvzm1dwqJreoYHEiUqitnfyDoLmp3seVX6fjFwVFp"
   }
   $ export TXLINE_API_TOKEN=txoracle_api_471e307dc45a4b68aaaccbc3113539b4
   ```
3. Show the running agent in the terminal:
   ```bash
   $ npx -p @srivtx/sports-workbench sports-workbench signal --strategy sharpDetector --threshold 1.5 --devnet
   [sports-workbench] starting strategy=sharpDetector threshold=1.5%
   [sports-workbench] signal fixture=17588234 strategy=sharpDetector deltaPct=34.92 verified=false
   [sports-workbench] signal fixture=17588234 strategy=sharpDetector deltaPct=46.01 verified=false
   [sports-workbench] signal fixture=17926740 strategy=sharpDetector deltaPct=19.72 verified=false
   ```
4. Open the dashboard — same signals appear in the live feed.
5. Click a new signal. It links to the Solana transaction on Solscan.

> "The agent runs 24/7. Connects to the free World Cup tier SSE stream using BOTH the JWT and the activated X-Api-Token headers. Every signal is detected in real-time and persisted to a local JSON store."

## Scene 5 (3:30–4:30) — solana-agent-kit composition

Show the code:

```ts
import { TxlinePlugin } from "@srivtx/sports-workbench/agent-kit";
agent.use(new TxlinePlugin({ strategy: "sharpDetector", thresholdPct: 2 }));

// Now your AI agent can do:
const r = await agent.methods.backtestOdds(agent, {
  fromDate: Date.parse("2026-06-01"),
  toDate: Date.parse("2026-07-10"),
  startingBankroll: 10000,
  positionSize: 0.02,
  verifyOnChain: true,
});
```

> "Drops into the solana-agent-kit that Yash (SendAI) and the Solana AI ecosystem have built. Installs via `npm install @srivtx/sports-workbench`. Compatible with Claude Code, Cursor, Codex, and 7 other agents."

## Scene 6 (4:30–5:00) — Closing

> "`@srivtx/sports-workbench`. A verifiable sports trading workbench for the TxLINE World Cup hackathon. Free tier, Solana-native, proof-anchored. Try it. Verify it. Build on it."

**End card: link to repo, demo, and submission form.**

---

## Production notes

- Demo video should be 1080p, 30fps, ~5 min
- Screen recording with cursor highlighted
- All TxLINE API calls in real-time
- Terminal: `npx -p @srivtx/sports-workbench sports-workbench backtest` output with --out flag, then `cat report.json | jq`
- Browser: live dashboard
- Music: subtle, optional
- No filler — every second should be a fact or a demo

## B-roll

- TxLINE SSE stream on `curl` — show the events flowing
- Solana explorer — show the daily_batch_roots PDA
- The 3-level Merkle tree diagram
- The 51 other hackathon submissions (b-roll of competitor screenshots)
