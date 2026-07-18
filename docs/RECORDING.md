# sports-workbench — Demo Video Recording Script

**Target:** 4:20–4:40 final cut (hard limit 5:00) · 1080p+ · 30fps+
**Record between:** now and July 19, 2026 ~22:00 UTC (submission closes 23:59 UTC)
**The one rule:** every claim on screen must be real. Judges can re-run every command we show.

---

## 0. Pre-flight checklist (before hitting record)

### Environment
- [ ] On latest `main`: `npm ci && npm run build && npm test` green (verified: 11/11 pass)
- [ ] `node dist/cli/index.js --version` prints `0.1.8`
- [ ] Devnet wallet has >= 0.01 SOL
- [ ] `export TXLINE_API_TOKEN=txoracle_api_...` (existing token, valid ~30 days from June 26)
- [ ] 10 min before recording: run the `signal` command, confirm live ticks arrive
- [ ] Terminal: dark theme, 18-20pt font, ~140x36 window, prompt stripped to `$`
- [ ] Browser tabs only: site homepage, `/signals`, Solscan devnet, GitHub repo
- [ ] Do Not Disturb ON, clean desktop, hide bookmarks bar, quit Slack/Discord
- [ ] Screen recorder: cursor highlight + click halo ON (Screen Studio / CleanShot / OBS)

### Timing strategy (IMPORTANT)
- **Best window: during the World Cup final (July 19).** Real match, real odds movement, real signals. Record Scene 3 live during the match.
- **Fallback A:** if the stream is quiet, pre-run the agent 2-3 hours tonight, keep the terminal scrollback + `signals.json`, replay that footage. Only narrate "recorded live" if true.
- **Fallback B:** the backtester (Scene 5) carries the "it works" burden — docs already justify it ("matches end after the deadline; backtests replay historical TxLINE batches").

---

## Scene-by-scene script

### SCENE 0 — Cold open (0:00-0:20) — SLIDES
**Show:** Slide 1 (logo + "Every sports signal, signed on chain") then Slide 2 (problem).

**Say:**
> "Every sports trading tool on the market says 'trust me bro.' P&L claims, win rates, signal logs — none of it is verifiable. sports-workbench says: verify it. Every signal our agent fires is anchored to a Merkle proof on Solana. Anyone can re-check it, on any machine, forever. We built it on TxLINE, for the World Cup."

---

### SCENE 1 — Zero to running in 30 seconds (0:20-0:45) — TERMINAL
**Type (live, not pasted):**
```bash
$ npx -p @srivtx/sports-workbench sports-workbench --version
0.1.8
$ npx -p @srivtx/sports-workbench sports-workbench doctor
```
**Show:** doctor output — green checks (Node, npm prefix, PATH, binary, wallet, token, DNS, RPC).

**Say:**
> "Zero install — one npx and the CLI runs. The built-in doctor diagnoses your setup: Node version, PATH, wallet, token, RPC — and fixes what it can. Real npm package, version 0.1.8, MIT license, CI green."

---

### SCENE 2 — On-chain subscribe (0:45-1:15) — TERMINAL + SOLSCAN
**Type:**
```bash
$ sports-workbench subscribe --devnet --level 1 --weeks 4
```
**Show:** JSON output (`txSig`, `apiToken`, `expiresAt`, `wallet`). Cut to Solscan devnet with that txSig — the txoracle program call visible.

**Say:**
> "The free World Cup tier is gated by an on-chain subscription — one transaction, about two-thousandths of a SOL, thirty days of streaming and proofs. Here's the transaction on Solscan, calling the txoracle program on devnet. No invoices, no API keys over email — the subscription itself is a Solana transaction."

**B-roll:** zoom `txSig` then dissolve to Solscan.

---

### SCENE 3 — THE MONEY SHOT: live agent (1:15-2:15) — TERMINAL, LIVE
**Type:**
```bash
$ sports-workbench signal --devnet --strategy sharpDetector --threshold 1.5 --state ./signals.json
```
**Show (60s real time, speed-ramp quiet parts):**
1. `[sports-workbench] starting strategy=sharpDetector threshold=1.5%`
2. Odds ticks / signals firing as the match moves: `[signal] fixture=... deltaPct=+34.9`
3. Second terminal pane: `watch -n2 'jq length signals.json'` — the count climbing
4. Cut to site `/signals` page — same signals rendered with receipts

**Say:**
> "Here's the agent, live, during the World Cup final, reading the TxLINE SSE stream — every odds update cryptographically committed on-chain. The sharp-detector strategy fires when any outcome moves more than one and a half percent in the rolling window. No human input from here on — it detects, fetches the Merkle proof for each signal, and persists everything to a local JSON store. Same feed, rendered on the dashboard. Drop the binary on a VM and it runs 24/7."

**If a goal or big odds swing happens while recording: LET IT RUN. Those 10 seconds are the whole video.**

---

### SCENE 4 — Verifiable Settlement Receipt (2:15-2:55) — TERMINAL + SOLSCAN
**Type (verifies the latest signal captured in Scene 3 — no copy-paste):**
```bash
$ sports-workbench verify --devnet --state ./signals.json
```
**Show:** receipt JSON — `messageId`, `ts`, `fixtureId`, `subTreeRoot`, `subTreeProof`, `mainTreeProof`, `merkleRoot`, `programId`, `batchRootsPda`. Then Solscan on the `dailyBatchRootsPda` account / program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`.

**Say:**
> "Every signal produces a Verifiable Settlement Receipt: the exact TxLINE message ID, the canonical sub-tree root, and the full proof path up to the on-chain daily Merkle root. Anyone can re-run the program's validate_odds instruction against this proof. If the data was real, it verifies. If anyone tampered with a single byte, it fails. That's the difference between a screenshot and a receipt."

---

### SCENE 5 — Backtester (2:55-3:40) — TERMINAL
**Type:**
```bash
$ sports-workbench backtest --strategy sharpDetector --from 2026-06-01 --to 2026-07-10 --threshold 2 --out report.json
$ jq '{signals, closedTrades, winRate, pnl, maxDrawdown, sharpe, verified}' report.json
```
**Show:** the report metrics; briefly scroll `proofArtifacts` entries.

**Say:**
> "The other half of the workbench: a deterministic backtester. It replays every five-minute TxLINE batch across the whole tournament through the same strategy, simulates the trades, and attaches a Merkle proof to every signal. Same input, same output, on any machine — which is why this demo doesn't depend on whether matches are still being played when the judges watch it."

---

### SCENE 6 — Built for agents (3:40-4:10) — EDITOR + SITE
**Show:** VS Code with the agent-kit snippet (below), then the site `/agent` page + `/playground`.
```ts
import { TxlinePlugin } from "@srivtx/sports-workbench/agent-kit";
agent.use(new TxlinePlugin({ strategy: "sharpDetector", thresholdPct: 2 }));
const r = await agent.methods.backtestOdds(agent, { fromDate, toDate, verifyOnChain: true });
```

**Say:**
> "It drops into solana-agent-kit as a plugin — six methods, every one returning its proof alongside the payload. Also installable as a skill for Claude Code, Cursor, and any MCP-compatible agent. Your agent doesn't just read odds — it can prove them."

---

### SCENE 7 — Close (4:10-4:35) — SLIDE
**Show:** closing slide — repo, npm, site, program IDs.

**Say:**
> "sports-workbench. A verifiable trading workbench for TxLINE — free tier, Solana-native, proof-anchored. The repo is public, the package is on npm, the agent is running. Try it. Verify it. Build on it."

---

## 2. Capture list (B-roll, grab whenever convenient)
- [ ] `curl -N` on the SSE stream — raw `data:` events flowing
- [ ] Solscan: subscribe tx + `dailyBatchRootsPda` account page
- [ ] Site scroll: homepage hero, `/receipts`, `/fixtures`, `/install`
- [ ] `npm test` green output (11/11)
- [ ] GitHub repo page (README badges, CI green check)
- [ ] The 3-level Merkle tree diagram (from slides deck)

## 3. Post-production checklist
- [ ] Hard cut anything that isn't a fact or a demo — target 4:30
- [ ] Zoom-callouts on: txSig, `deltaPct` values, `merkleRoot`, win-rate line
- [ ] Captions on (judges watch muted)
- [ ] End card 3s: repo URL + site URL
- [ ] Upload YouTube (unlisted) + Loom backup; test both links in incognito
- [ ] Paste links into the Superteam Earn submission form before 23:59 UTC
