// Verifiable sports backtester — replays historical TxLINE data through any
// registered strategy, generates a Signal for every detected move, fetches
// the on-chain Merkle proof for each, and computes a fully-auditable P&L.

import { TxLineClient } from "../client/txline.js";
import { proveOdds, verifyOddsView } from "../solana/verify.js";
import { STRATEGIES } from "./strategies.js";
import type {
  BacktestConfig,
  BacktestReport,
  OddsPayload,
  Signal,
  Trade,
  TxLineConfig,
} from "../types/index.js";
import { randomUUID } from "node:crypto";

export class Backtester {
  private client: TxLineClient;
  private txlineConfig: TxLineConfig;

  constructor(txlineConfig: TxLineConfig = {}) {
    this.txlineConfig = txlineConfig;
    this.client = new TxLineClient(txlineConfig);
  }

  /**
   * Run a backtest over a date range against the free World Cup tier
   * (Service Level 1 — 60s delayed odds, no payment needed).
   */
  async run(config: BacktestConfig): Promise<BacktestReport> {
    const strategy = STRATEGIES[config.strategy];
    if (!strategy) {
      throw new Error(`Unknown strategy: ${config.strategy}`);
    }

    // Step 1: list fixtures in the range
    const fromEpochDay = Math.floor(config.fromDate / 86_400_000);
    const toEpochDay = Math.floor(config.toDate / 86_400_000);
    const fixtures: number[] = config.fixtureIds ?? [];

    if (fixtures.length === 0) {
      // fall back to scanning the day's snapshots
      for (let d = fromEpochDay; d <= toEpochDay; d++) {
        try {
          const day = await this.client.getFixturesByDay(d);
          for (const f of day) fixtures.push(f.fixtureId);
        } catch {
          // skip days with no data
        }
      }
    }

    if (fixtures.length === 0) {
      return emptyReport(config);
    }

    // Step 2: replay each fixture's odds history through the strategy
    const history: OddsPayload[] = [];
    const signals: Signal[] = [];
    const verifiedSignals: Array<Signal & { proof: any }> = [];
    let unverifiedSignals = 0;

    for (const fixtureId of fixtures) {
      try {
        // We walk back from the end of the day. For each hour 0..23 we
        // pull the 5-min interval snapshots (12 intervals/hour * 24 hours = 288).
        const days = toEpochDay - fromEpochDay + 1;
        for (let i = 0; i < days; i++) {
          const day = fromEpochDay + i;
          for (let hour = 0; hour < 24; hour++) {
            for (let interval = 0; interval < 12; interval++) {
              let batch: OddsPayload[] = [];
              try {
                batch = await this.client.getHistoricalOdds(day, hour, interval);
              } catch {
                continue;
              }
              for (const o of batch) {
                if (o.FixtureId !== fixtureId) continue;
                history.push(o);
                const sig = strategy.evaluate(
                  {
                    thresholdPct: config.thresholdPct,
                    marketTypeFilter: config.marketType,
                  },
                  history,
                  o
                );
                if (sig) {
                  signals.push(sig);
                  if (config.verifyOnChain) {
                    try {
                      const proof = await proveOdds(this.txlineConfig, o);
                      verifiedSignals.push({ ...sig, verified: true, proof } as any);
                    } catch (e) {
                      unverifiedSignals++;
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // skip on error
        continue;
      }
    }

    // Step 3: simulate trades (binary outcome P&L model)
    const trades = simulateTrades(signals, config);
    const finalScores = await fetchFinalScores(this.client, fixtures);

    // attach outcomes
    for (const t of trades) {
      const fs = finalScores.get(t.signal.fixtureId);
      if (fs) {
        t.signal.outcome = resolveOutcome(t.signal, fs);
        t.signal.finalScore = fs;
        if (t.status === "open") {
          t.exitPct = 100; // settles to 100% on win, 0% on loss
          t.exitTs = fs.ts;
          t.status = "closed";
          const win = t.signal.outcome === "win";
          t.pnl = win ? t.stake * (100 / t.entryPct - 1) : -t.stake;
          t.pnlPct = t.pnl / t.stake;
        }
      }
    }

    // Step 4: compute report
    return buildReport(config, signals, verifiedSignals.length, unverifiedSignals, trades);
  }
}

// =====================
// helpers
// =====================

function sigId(o: { fixtureId: number; messageId: string; ts: number }): string {
  return `${o.fixtureId}:${o.messageId}:${o.ts}`;
}

function emptyReport(c: BacktestConfig): BacktestReport {
  return {
    config: c,
    totalSignals: 0,
    totalTrades: 0,
    winRate: 0,
    totalPnl: 0,
    totalPnlPct: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    profitFactor: 0,
    avgWinPct: 0,
    avgLossPct: 0,
    byStrategy: {},
    byMarket: {},
    trades: [],
    verifiedSignals: 0,
    unverifiedSignals: 0,
    proofArtifacts: [],
  };
}

function simulateTrades(signals: Signal[], c: BacktestConfig): Trade[] {
  const trades: Trade[] = [];
  let bankroll = c.startingBankroll;
  for (const s of signals) {
    const stake = bankroll * c.positionSize;
    if (stake <= 0) continue;
    bankroll -= stake;
    // Treat the implied probability as the entry "price"
    const entryPct = s.afterPct;
    trades.push({
      signal: s,
      entryPct,
      stake,
      entryTs: s.detectedAt,
      status: "open",
    });
  }
  return trades;
}

async function fetchFinalScores(
  client: TxLineClient,
  fixtureIds: number[]
): Promise<Map<number, { home: number; away: number; ts: number }>> {
  const out = new Map<number, { home: number; away: number; ts: number }>();
  for (const id of fixtureIds) {
    try {
      const hist = await client.getHistoricalScores(id);
      const last = hist[hist.length - 1];
      if (last && (last as any).gameState === "F") {
        const score = (last as any).score ?? (last as any).scoreSoccer;
        out.set(id, {
          home: score?.Participant1?.Total ?? score?.Participant1?.Goals ?? 0,
          away: score?.Participant2?.Total ?? score?.Participant2?.Goals ?? 0,
          ts: (last as any).ts,
        });
      }
    } catch {
      // ignore
    }
  }
  return out;
}

function resolveOutcome(s: Signal, final: { home: number; away: number }): "win" | "loss" {
  // Simple heuristic: a "Home" direction win if home > away; "Away" if away > home.
  const name = (s.marketType ?? "").toLowerCase();
  if (name.includes("away") || name.includes("2")) return final.away > final.home ? "win" : "loss";
  if (name.includes("draw") || name.includes("x")) return final.home === final.away ? "win" : "loss";
  return final.home > final.away ? "win" : "loss";
}

function buildReport(
  c: BacktestConfig,
  signals: Signal[],
  verifiedCount: number,
  unverifiedCount: number,
  trades: Trade[]
): BacktestReport {
  const closed = trades.filter((t) => t.status === "closed");
  const wins = closed.filter((t) => t.signal.outcome === "win").length;
  const losses = closed.filter((t) => t.signal.outcome === "loss").length;
  const winRate = closed.length > 0 ? wins / closed.length : 0;
  const totalPnl = closed.reduce((acc, t) => acc + (t.pnl ?? 0), 0);
  const totalPnlPct = totalPnl / c.startingBankroll;

  const byStrategy: Record<string, { trades: number; pnl: number; winRate: number }> = {};
  for (const t of closed) {
    const k = t.signal.strategy;
    if (!byStrategy[k]) byStrategy[k] = { trades: 0, pnl: 0, winRate: 0 };
    byStrategy[k].trades++;
    byStrategy[k].pnl += t.pnl ?? 0;
  }
  for (const k of Object.keys(byStrategy)) {
    const ws = closed.filter(
      (t) => t.signal.strategy === k && t.signal.outcome === "win"
    ).length;
    byStrategy[k].winRate = byStrategy[k].trades > 0 ? ws / byStrategy[k].trades : 0;
  }

  const byMarket: Record<string, { trades: number; pnl: number; winRate: number }> = {};
  for (const t of closed) {
    const k = t.signal.marketType;
    if (!byMarket[k]) byMarket[k] = { trades: 0, pnl: 0, winRate: 0 };
    byMarket[k].trades++;
    byMarket[k].pnl += t.pnl ?? 0;
  }
  for (const k of Object.keys(byMarket)) {
    const ws = closed.filter(
      (t) => t.signal.marketType === k && t.signal.outcome === "win"
    ).length;
    byMarket[k].winRate = byMarket[k].trades > 0 ? ws / byMarket[k].trades : 0;
  }

  const winsArr = closed.filter((t) => t.signal.outcome === "win").map((t) => t.pnlPct ?? 0);
  const lossesArr = closed.filter((t) => t.signal.outcome === "loss").map((t) => t.pnlPct ?? 0);
  const avgWinPct = winsArr.length > 0 ? avg(winsArr) : 0;
  const avgLossPct = lossesArr.length > 0 ? avg(lossesArr) : 0;

  // Max drawdown (cumulative pnl)
  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  for (const t of closed) {
    cum += t.pnl ?? 0;
    if (cum > peak) peak = cum;
    const dd = peak === 0 ? 0 : (peak - cum) / c.startingBankroll;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe & Sortino
  const rets = closed.map((t) => t.pnlPct ?? 0);
  const meanR = avg(rets);
  const stdR = stddev(rets);
  const downside = stddev(rets.filter((r) => r < 0));
  const sharpeRatio = stdR === 0 ? 0 : (meanR * Math.sqrt(252)) / stdR;
  const sortinoRatio = downside === 0 ? 0 : (meanR * Math.sqrt(252)) / downside;
  const grossWin = winsArr.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(lossesArr.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss === 0 ? grossWin : grossWin / grossLoss;

  const proofArtifacts = closed
    .filter((t) => t.signal.verified)
    .slice(0, 100)
    .map((t) => ({
      signalId: t.signal.id,
      messageId: t.signal.messageId ?? "",
      onChainTx: t.signal.onChainTx ?? "",
      merkleRoot: t.signal.merkleRoot ?? "",
    }));

  return {
    config: c,
    totalSignals: signals.length,
    totalTrades: closed.length,
    winRate,
    totalPnl,
    totalPnlPct,
    maxDrawdown: maxDD,
    sharpeRatio,
    sortinoRatio,
    profitFactor,
    avgWinPct,
    avgLossPct,
    byStrategy,
    byMarket,
    trades: closed,
    verifiedSignals: verifiedCount,
    unverifiedSignals: unverifiedCount,
    proofArtifacts,
  };
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = avg(xs);
  const v = avg(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}
