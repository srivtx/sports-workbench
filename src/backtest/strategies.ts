// Trading strategies. Each strategy is a pure function from a stream of
// odds events to a Signal. Strategies are deterministic and testable.

import type { OddsPayload, Signal, StrategyName } from "../types/index.js";

export interface StrategyContext {
  thresholdPct: number; // 2.0 = 2% odds shift
  marketTypeFilter?: string; // e.g. "MatchWinner"
  windowMs?: number; // 5 * 60 * 1000 default
}

export interface Strategy {
  name: StrategyName;
  describe(): string;
  // decide whether the latest odds update should fire a signal
  evaluate(ctx: StrategyContext, history: OddsPayload[], current: OddsPayload): Signal | null;
}

// =====================
// Momentum
// =====================
// Fire when the home win probability moves UP by >thresholdPct in the
// window. Captures the "sharp money is backing the favorite" pattern.

export const momentumStrategy: Strategy = {
  name: "momentum",
  describe() {
    return "Follow the move. Fire when implied probability for the home team rises >thresholdPct in the rolling window.";
  },
  evaluate(ctx, history, current) {
    const t = ctx.thresholdPct;
    const home = current.PriceNames[0];
    const homeIdx = current.PriceNames.indexOf(home);
    if (homeIdx < 0) return null;
    const curHomePct = parsePct(current.Pct[homeIdx]);
    if (curHomePct == null) return null;

    const baseHome = basePriceFor(history, current, home);
    if (baseHome == null) return null;
    const deltaPct = curHomePct - baseHome;
    if (deltaPct < t) return null;

    return {
      id: sigId(current),
      fixtureId: current.FixtureId,
      marketType: marketTypeFromOdds(current),
      detectedAt: current.Ts,
      strategy: "momentum",
      beforePct: baseHome,
      afterPct: curHomePct,
      deltaPct,
      verified: false,
      messageId: current.MessageId,
    };
  },
};

// =====================
// Mean reversion
// =====================
// Fire when an outcome has moved too far too fast. Bet on snap-back.

export const meanReversionStrategy: Strategy = {
  name: "meanReversion",
  describe() {
    return "Fade the move. Fire when implied probability for an outcome moves >thresholdPct in either direction; bet on reversion.";
  },
  evaluate(ctx, history, current) {
    const t = ctx.thresholdPct;
    const home = current.PriceNames[0];
    const homeIdx = current.PriceNames.indexOf(home);
    if (homeIdx < 0) return null;
    const curHomePct = parsePct(current.Pct[homeIdx]);
    if (curHomePct == null) return null;
    const baseHome = basePriceFor(history, current, home);
    if (baseHome == null) return null;
    const deltaPct = Math.abs(curHomePct - baseHome);
    if (deltaPct < t) return null;

    return {
      id: sigId(current),
      fixtureId: current.FixtureId,
      marketType: marketTypeFromOdds(current),
      detectedAt: current.Ts,
      strategy: "meanReversion",
      beforePct: baseHome,
      afterPct: curHomePct,
      deltaPct,
      verified: false,
      messageId: current.MessageId,
    };
  },
};

// =====================
// Sharp detector (sponsor's official idea #1)
// =====================
// Fire when ANY outcome (Home/Draw/Away) shifts >thresholdPct in window.

export const sharpDetectorStrategy: Strategy = {
  name: "sharpDetector",
  describe() {
    return "Detect ANY significant odds shift. Fire when max abs deltaPct across all outcomes > threshold within the rolling window. Tracks whether the call predicted the outcome.";
  },
  evaluate(ctx, history, current) {
    const t = ctx.thresholdPct;
    let bestDelta = 0;
    let bestName = current.PriceNames[0] ?? "Home";
    let bestBefore = 0;
    let bestAfter = 0;

    for (let i = 0; i < current.PriceNames.length; i++) {
      const name = current.PriceNames[i];
      const cur = parsePct(current.Pct[i]);
      if (cur == null) continue;
      const base = basePriceFor(history, current, name);
      if (base == null) continue;
      const d = Math.abs(cur - base);
      if (d > bestDelta) {
        bestDelta = d;
        bestName = name;
        bestBefore = base;
        bestAfter = cur;
      }
    }

    if (bestDelta < t) return null;

    return {
      id: sigId(current),
      fixtureId: current.FixtureId,
      marketType: marketTypeFromOdds(current),
      detectedAt: current.Ts,
      strategy: "sharpDetector",
      beforePct: bestBefore,
      afterPct: bestAfter,
      deltaPct: bestDelta,
      verified: false,
      messageId: current.MessageId,
    };
  },
};

export const STRATEGIES: Record<StrategyName, Strategy> = {
  momentum: momentumStrategy,
  meanReversion: meanReversionStrategy,
  sharpDetector: sharpDetectorStrategy,
  custom: {
    name: "custom",
    describe() {
      return "User-defined JS strategy. See examples/custom-strategy.ts.";
    },
    evaluate() {
      return null;
    },
  },
};

// =====================
// helpers
// =====================

function marketTypeFromOdds(o: OddsPayload): string {
  // e.g. "HomeWin", "Draw", "AwayWin", handicap lines
  return [o.SuperOddsType, o.MarketParameters].filter(Boolean).join(":");
}

function parsePct(s: string | undefined): number | null {
  if (!s || s === "NA") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function windowMs(ctx: StrategyContext, history: OddsPayload[], current: OddsPayload): number {
  return ctx.windowMs ?? 5 * 60 * 1000;
}

function basePriceFor(
  history: OddsPayload[],
  current: OddsPayload,
  priceName: string
): number | null {
  if (history.length === 0) return null;
  const window = windowMs({ thresholdPct: 0 } as StrategyContext, history, current);
  const cutoff = current.Ts - window;
  // find the most recent history item within (cutoff, current.Ts)
  const candidates = history
    .filter((h) => h.FixtureId === current.FixtureId && h.Ts >= cutoff && h.Ts < current.Ts)
    .sort((a, b) => b.Ts - a.Ts);
  for (const h of candidates) {
    const idx = h.PriceNames.indexOf(priceName);
    if (idx < 0) continue;
    const v = parsePct(h.Pct[idx]);
    if (v != null) return v;
  }
  return null;
}

function sigId(o: OddsPayload): string {
  return `${o.FixtureId}:${o.MessageId}:${o.Ts}`;
}
