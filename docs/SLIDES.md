# SLIDES BRIEF — sports-workbench demo deck

> **For the agent generating this deck:** produce a 10-slide, 16:9 (1920x1080) presentation.
> It plays inside a 5-minute hackathon demo video (cold open + closing card) and doubles as the
> submission deck. Everything below is verified fact — do not invent numbers, claims, or features.
> Copy is written to be used verbatim; you may tighten phrasing but never change a fact.

### How this deck is used in the video (so you design for the right job)

| Slides | Where they appear in the video | Design priority |
|---|---|---|
| 1-2 (Title, Problem) | **Cold open, full-screen, ~20s** while the narrator speaks | Must be legible at a glance — huge headline, minimal text |
| 3-6 (TxLINE, Product, Flow, Receipt) | **Quick cuts, 2-4s each**, flashed between live-demo segments as visual glue | One idea per slide, readable in 3 seconds |
| 7-9 (Proof, Strategies, Agents) | Mostly for the **submission deck**; may get 2s cutaways | Can carry slightly more detail |
| 10 (Close/CTA) | **End card, held ~3-5s** | Links must be big and readable — this is what judges type |

Every slide will be shown fullscreen in a 16:9 video, so: no walls of text, font sizes large,
and each slide must make sense without a presenter.

---

## 1. Context

- **Event:** TxLINE / TxODDS World Cup Hackathon (Superteam Earn), "Trading Tools & Agents" track.
- **Deadline:** July 19, 2026, 23:59 UTC.
- **What TxLINE is:** a high-performance sports data layer — real-time scores + consensus betting odds
  for all 104 World Cup matches, where **every update is cryptographically anchored on Solana**
  via Merkle proofs. One normalized JSON schema across all competitions.
- **What we built:** `sports-workbench` — a **verifiable sports trading workbench**: a backtester +
  autonomous live signal agent where **every signal carries a Merkle proof anchored on Solana**.
  The differentiator in one line: every other tool says "trust me bro"; we say "verify it."
- **Judging criteria:** core functionality/data ingestion, autonomous operation, clean deterministic
  logic, innovation/novelty, production readiness. Demo video is weighted heavily.

## 2. Verified facts you may use (and only these)

| Fact | Value |
|---|---|
| Package | `@srivtx/sports-workbench` on npm, **v0.1.8**, MIT, Node 20+ |
| Try it | `npx -p @srivtx/sports-workbench sports-workbench --version` |
| Site | https://sports-workbench.srivtx.xyz |
| Repo | https://github.com/srivtx/sports-workbench (public, CI green) |
| Tests | 11/11 passing; GitHub Actions CI on every push |
| Cost to run | **~0.002 SOL one-time** on-chain subscribe → 30 days streaming + proofs |
| Free tier | TxLINE Service Level 1 / 12 — 0 TxL tokens |
| On-chain verify | `validate_odds` on txoracle program, ~1.4M compute units |
| Program (devnet) | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| Program (mainnet) | `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` |
| Strategies | `sharpDetector` (official hackathon idea #1), `momentum`, `meanReversion`, `custom` |
| Agent integrations | solana-agent-kit plugin (6 methods), MCP/skills (`npx skills add srivtx/sports-workbench`) |
| TxLINE endpoints used | `/auth/guest/start`, `/api/token/activate`, `/api/fixtures/snapshot/*`, `/api/odds/snapshot/:id`, `/api/odds/updates/:day/:hour/:int`, `/api/odds/validation`, `/api/scores/historical/:id`, `/api/odds/stream` (SSE) |

**The Verifiable Settlement Receipt** (the hero concept — one per signal):
`messageId` · `ts` · `fixtureId` · `marketType` · `subTreeRoot` · `subTreeProof` · `mainTreeProof` ·
`merkleRoot` (on-chain) · `programId` · `dailyBatchRootsPda` · verify method `validate_odds`.
Anyone can re-run the on-chain instruction: real data verifies, tampered data fails.

**Architecture in one flow:** on-chain subscribe → 30-day API token → SSE live stream →
strategy engine (sharpDetector) → signal fired → Merkle proof fetched → receipt persisted →
re-verify on-chain anytime.

## 3. Brand kit (match the product site exactly)

- **Background:** `#050505` (near-black). Dark terminal aesthetic.
- **Primary accent:** `#B6FF3C` (acid lime — the logo color; use for key words, numbers, underlines).
- **Secondary accent:** `#5EE6FF` (electric cyan — use sparingly: links, secondary data).
- **Text:** white/off-white (`#F5F5F5`); muted gray `#8A8A8A` for captions.
- **Display font:** "Weirdo TM" (bundled `weirdo-tm.otf` in repo `vercel/fonts/`) for headlines only.
- **Body/code font:** a clean monospace (JetBrains Mono / SF Mono) — this product IS a terminal tool.
- **Logo:** rounded-square lime tile with a black S-curve path (repo `public/logo.svg`).
- **Texture:** subtle scanline/CRT or fine grid is on-brand. Terminal windows with lime-on-black
  text are the core visual motif.
- **Do not:** gradients in brand colors, stock photos of stadiums/athletes, clip-art, light themes,
  more than 2 accent colors per slide.

## 4. Slide-by-slide spec

**Slide 1 — Title.**
Logo tile centered-left; headline "Every sports signal, signed on chain."; sub: "sports-workbench —
a verifiable trading workbench for TxLINE · TxODDS World Cup Hackathon 2026". Small mono footer:
`npx -p @srivtx/sports-workbench`. Speaker note: cold-open of the video, 10 seconds.

**Slide 2 — The problem.**
Headline: "Sports trading tools run on 'trust me bro.'" Three muted cards: "P&L screenshots",
"Unverifiable win rates", "Signals you can't audit". Red-ish (not brand) strike-through styling OK.
One lime line at bottom: "No tool anchors a single signal to a verifiable source."

**Slide 3 — The unlock: TxLINE.**
Headline: "The only feed where every update is provable." Simple 3-level Merkle diagram:
5-min batches → sub-tree roots → daily root → Solana. Caption: "Every odds update, score event,
fixture change — committed to an on-chain Merkle root."

**Slide 4 — The product.**
Headline: "One workbench. Four capabilities." 2x2 grid: **01 Backtester** (replay any date range,
proof per signal) · **02 Live agent** (SSE stream, fires on threshold moves, runs 24/7) ·
**03 Verifiable Settlement Receipts** (Merkle proof + on-chain root per signal) ·
**04 Agent skill** (solana-agent-kit plugin + MCP).

**Slide 5 — How it works.**
Horizontal flow, 5 nodes, monospace labels: `subscribe (on-chain, ~0.002 SOL)` → `SSE stream` →
`strategy engine` → `signal + Merkle proof` → `verify on-chain, forever`. One lime arrow path.
Caption: "Fully autonomous after one command."

**Slide 6 — Anatomy of a receipt.**
Left: dark terminal card with the receipt JSON (use the field list from section 2, abbreviated).
Right: three lime callouts — "the exact odds update", "the proof path", "the on-chain root".
Footer: "Re-run `validate_odds`. Real verifies. Tampered fails."

**Slide 7 — Proof it works.**
Big-number row (lime numerals): `11/11` tests · `CI green` · `v0.1.8 on npm` · `~0.002 SOL` ·
`30 days` of stream · `0 TxL`. Caption: "Free tier, on-chain, open source (MIT)."

**Slide 8 — Strategies.**
Table of the 4 strategies with one-line triggers (verbatim from facts table). Note under:
"sharpDetector is the sponsor's official track idea #1."

**Slide 9 — Built for agents.**
Left: code block (the agent-kit snippet from facts: `TxlinePlugin` + `backtestOdds`).
Right: "6 methods on SolanaAgentKit" + "MCP skill: `npx skills add srivtx/sports-workbench`" +
"Claude Code · Cursor · any MCP agent".

**Slide 10 — Close / CTA.**
Headline: "Try it. Verify it. Build on it." Three mono lines: site URL · repo URL · npm package.
Small: program IDs (devnet/mainnet) + "TxLINE World Cup Hackathon — Trading Tools & Agents track".
Logo tile bottom-right. Speaker note: end card, hold 3 seconds, links must be legible.

## 5. Deliverables expected from you (the slide agent)

1. 10 PNG/SVG slides, 1920x1080, using the brand kit above.
2. Source file (HTML/Figma/markdown — whatever you generate) so we can tweak.
3. All copy as specified in section 4 unless a factual error is found — then flag it, don't fix silently.
4. Slide 3's Merkle diagram and Slide 5's flow are the two that matter most; spend effort there.
