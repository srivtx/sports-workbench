# DEMOSCRIPT — what to say, word for word

**Video length:** about 4 minutes 30 seconds (limit is 5:00)
**Slides:** https://dreamy-melba-912b4d.netlify.app/ (press F for fullscreen, arrow keys to move)
**Rule:** short sentences. Speak slowly. If you make a mistake, pause 2 seconds and say the line again — we cut it later.

**Flow:** Slides 1 → 6, then the terminal demo, then Slide 10 at the end.

---

## Before you record (2 minutes)

- [ ] Terminal open, dark theme, big font (18pt+), clean prompt
- [ ] `export TXLINE_API_TOKEN=txoracle_api_...` already done in this terminal
- [ ] Slides open in browser, fullscreen, on Slide 1
- [ ] Solscan devnet open in a second tab
- [ ] Do Not Disturb ON
- [ ] Water nearby. Record in one take per part — slides first, terminal second.

---

# PART 1 — THE SLIDES (about 1 minute 40 seconds)

## SLIDE 1 — Title (15 sec)
**Screen:** "Every sports signal, signed on chain."

**SAY:**
> "This is sports-workbench. It is a trading tool for sports data. And every signal it makes is signed on the Solana blockchain. That means anyone can check our work. Nobody has to trust us."

---

## SLIDE 2 — The Problem (20 sec)
**Screen:** "Sports trading tools run on trust me bro."

**SAY:**
> "Here is the problem. Every sports trading tool shows you a number and says: trust me. Screenshots of profit. Win rates you cannot check. Signals you cannot audit. None of them can prove their data was real. We fix that."

---

## SLIDE 3 — The Unlock (15 sec)
**Screen:** "The only feed where every update is provable." + the Merkle tree diagram

**SAY:**
> "This is TxLINE. It is a sports data feed for the World Cup. And it is special. Every odds update is locked into a Merkle proof on Solana. So the data itself comes with proof. Nobody can change it later. Not even us."

---

## SLIDE 4 — The Product (15 sec)
**Screen:** "One workbench. Four capabilities."

**SAY:**
> "So we built sports-workbench on top of it. It does four things. One: a backtester — replay old matches through any strategy. Two: a live agent — it watches the stream and fires signals on its own. Three: every signal gets a receipt with on-chain proof. Four: it drops into any AI agent as a plugin."

---

## SLIDE 5 — How it works (15 sec)
**Screen:** the 5-step flow (subscribe → stream → strategy → signal+proof → verify)

**SAY:**
> "Here is the flow. You subscribe on-chain. It costs about two-thousandths of one SOL. Then the agent reads the live stream. The strategy engine watches for big moves. When it fires, it grabs the proof. And anyone can verify it on-chain. Forever. After one command, it runs alone."

---

## SLIDE 6 — Anatomy of a receipt (20 sec)
**Screen:** the receipt JSON

**SAY:**
> "This is the heart of the product. We call it a Verifiable Settlement Receipt. Every signal has one. It shows the exact odds update. The proof path. And the on-chain root. Here is the key part: you can re-run the check on Solana. If the data is real, it verifies. If anyone changed even one byte, it fails."

**(Skip slides 7, 8, 9 for now — go straight to the terminal. If you have time later, you can flash them for 2 seconds each between terminal parts.)**

---

# PART 2 — THE TERMINAL DEMO (about 2 minutes 45 seconds)

Switch from browser to terminal. Say this line while you switch:

> "Enough slides. Let me show you the real thing. Everything you are about to see, you can run yourself."

---

## COMMAND 1 — It runs anywhere (10 sec)

**TYPE:**
```bash
npx -p @srivtx/sports-workbench sports-workbench --version
```
**Screen shows:** `0.1.8`

**SAY:**
> "No install needed. One command. This is a real package on npm. Version 0.1.8."

---

## COMMAND 2 — On-chain subscribe (25 sec)

**TYPE:**
```bash
sports-workbench subscribe --devnet --level 1 --weeks 4
```
**Screen shows:** JSON with `txSig`, `apiToken`, `expiresAt`, `wallet`

**SAY:**
> "First, we subscribe. This is a real transaction on Solana devnet. It costs almost nothing. And it gives us thirty days of the live World Cup stream. Here is the transaction signature."

**(Optional, if smooth: switch to the Solscan tab, paste the txSig, show it. 10 extra seconds.)**
> "And here it is on Solscan. Anyone can see it. The subscription itself is on-chain."

**THEN TYPE:**
```bash
export TXLINE_API_TOKEN=<paste the apiToken here>
```

---

## COMMAND 3 — THE LIVE AGENT (60 sec) — the most important part

**TYPE:**
```bash
sports-workbench signal --devnet --strategy sharpDetector --threshold 1.5 --state ./signals.json
```
**Screen shows:** agent starts, then signals firing live as odds move.

**SAY (when it starts):**
> "Now the agent is live. It is reading the real TxLINE stream right now. The strategy is called sharp detector. It fires when odds move more than one point five percent. I am not touching anything. It runs alone."

**SAY (when the first signal fires — point at it):**
> "There. A signal. The odds just moved, and the agent caught it. For each signal, it also fetches the Merkle proof and saves everything to this file. This can run all day on any server."

**Let it run 30–60 seconds. If a big move fires, stay quiet and let people watch. Then Ctrl+C.**

---

## COMMAND 4 — Verify one signal on-chain (30 sec)

**First, grab a real messageId and ts from the file. TYPE:**
```bash
jq -r '.[0] | "\(.messageId) \(.ts)"' signals.json
```
Copy the two values. Then **TYPE** (use your real values):
```bash
sports-workbench verify --devnet --message-id <messageId> --ts <ts>
```
**Screen shows:** the receipt JSON — `messageId`, `subTreeRoot`, `mainTreeProof`, `merkleRoot`, `programId`, `batchRootsPda`.

**SAY:**
> "Now we verify one signal. This is the receipt. The exact message. The proof. The on-chain root. Any judge can take this and check it against the Solana program. Real data passes. Fake data fails. That is the whole point."

---

## COMMAND 5 — The backtester (40 sec)

**TYPE:**
```bash
sports-workbench backtest --strategy sharpDetector --from 2026-06-01 --to 2026-07-10 --threshold 2 --out report.json
```
Then:
```bash
jq '{signals, closedTrades, winRate, pnl, sharpe}' report.json
```
**Screen shows:** the summary numbers.

**SAY:**
> "Last thing: the backtester. It replays the whole tournament — every five-minute batch of odds — through the same strategy. Same input, same output, every time, on any machine. And every signal in this report has its proof attached. So even after the World Cup ends, anyone can replay this and get the same answer."

---

# PART 3 — CLOSING (15 sec)

Switch back to the browser. **SLIDE 10 — "Try it. Verify it. Build on it."**

**SAY:**
> "That is sports-workbench. The site is live. The repo is public. The package is on npm. The agent is running on the free tier. Try it. Verify it. Build on it. Thank you."

**Hold the slide for 3 seconds. Stop recording.**

---

## Quick reference — full command list (copy-paste ready)

```bash
# 1
npx -p @srivtx/sports-workbench sports-workbench --version

# 2
sports-workbench subscribe --devnet --level 1 --weeks 4
export TXLINE_API_TOKEN=<apiToken from above>

# 3 (the money shot — let it run 30-60s, then Ctrl+C)
sports-workbench signal --devnet --strategy sharpDetector --threshold 1.5 --state ./signals.json

# 4
jq -r '.[0] | "\(.messageId) \(.ts)"' signals.json
sports-workbench verify --devnet --message-id <messageId> --ts <ts>

# 5
sports-workbench backtest --strategy sharpDetector --from 2026-06-01 --to 2026-07-10 --threshold 2 --out report.json
jq '{signals, closedTrades, winRate, pnl, sharpe}' report.json
```

## If something goes wrong during recording

| Problem | What to do |
|---|---|
| Stream is slow / no signals | Lower the threshold: `--threshold 0.5`. Keep recording, say "it fires on small moves too." |
| A command errors | Stop, fix it, re-record just that command. We cut scenes together. |
| `subscribe` fails | Use the existing token: `export TXLINE_API_TOKEN=txoracle_api_471e...` (the one from June 26) and skip to Command 3. |
| Verify fails on a signal | Pick a different signal from `signals.json` (`jq '.[1]...'`) and try again. |
| Total time over 5:00 | Cut Command 2's Solscan part and the `doctor` step. Never cut Command 3 (live agent) or Command 4 (verify). |
