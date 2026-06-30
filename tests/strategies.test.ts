// Strategy unit tests — pure functions, no network needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  momentumStrategy,
  meanReversionStrategy,
  sharpDetectorStrategy,
  STRATEGIES,
} from "../src/backtest/strategies.ts";
import type { OddsPayload } from "../src/types/index.ts";

function makeOdds(opts: Partial<OddsPayload> & { fixtureId?: number; pct: string[]; ts?: number }): OddsPayload {
  return {
    FixtureId: opts.fixtureId ?? 1,
    MessageId: opts.MessageId ?? `m-${opts.Ts ?? 0}`,
    Ts: opts.ts ?? 1,
    Bookmaker: "TestBook",
    BookmakerId: 1,
    SuperOddsType: "HomeWin",
    InRunning: false,
    MarketParameters: "FT",
    MarketPeriod: "FT",
    PriceNames: ["Home", "Draw", "Away"],
    Prices: [200, 330, 400],
    Pct: opts.pct,
    ...opts,
  } as OddsPayload;
}

test("sharpDetector fires on >thresholdPct shift", () => {
  const t0 = 1_700_000_000_000;
  const history = [makeOdds({ pct: ["50.000", "30.000", "20.000"], ts: t0 })];
  const current = makeOdds({ pct: ["53.000", "30.000", "17.000"], ts: t0 + 60_000 });
  const sig = sharpDetectorStrategy.evaluate({ thresholdPct: 2 }, history, current);
  assert.ok(sig, "should fire");
  assert.equal(sig!.strategy, "sharpDetector");
  assert.ok(sig!.deltaPct >= 2);
});

test("sharpDetector does NOT fire on small shift", () => {
  const t0 = 1_700_000_000_000;
  const history = [makeOdds({ pct: ["50.000", "30.000", "20.000"], ts: t0 })];
  const current = makeOdds({ pct: ["50.500", "30.000", "19.500"], ts: t0 + 60_000 });
  const sig = sharpDetectorStrategy.evaluate({ thresholdPct: 2 }, history, current);
  assert.equal(sig, null);
});

test("momentum fires when home prob goes up", () => {
  const t0 = 1_700_000_000_000;
  const history = [makeOdds({ pct: ["50.000", "30.000", "20.000"], ts: t0 })];
  const current = makeOdds({ pct: ["55.000", "28.000", "17.000"], ts: t0 + 60_000 });
  const sig = momentumStrategy.evaluate({ thresholdPct: 3 }, history, current);
  assert.ok(sig);
  assert.equal(sig!.strategy, "momentum");
  assert.ok(sig!.deltaPct >= 3);
});

test("meanReversion fires when ANY outcome moves >threshold", () => {
  const t0 = 1_700_000_000_000;
  const history = [makeOdds({ pct: ["50.000", "30.000", "20.000"], ts: t0 })];
  const current = makeOdds({ pct: ["47.000", "30.000", "23.000"], ts: t0 + 60_000 });
  const sig = meanReversionStrategy.evaluate({ thresholdPct: 2.5 }, history, current);
  assert.ok(sig);
  assert.equal(sig!.strategy, "meanReversion");
});

test("STRATEGIES registry has all expected strategies", () => {
  for (const k of ["momentum", "meanReversion", "sharpDetector", "custom"] as const) {
    assert.ok(STRATEGIES[k], `missing strategy ${k}`);
    assert.equal(typeof STRATEGIES[k].describe, "function");
  }
});

test("signal id is deterministic", () => {
  const t0 = 1_700_000_000_000;
  const a = makeOdds({ pct: ["50.000", "30.000", "20.000"], ts: t0 });
  const b = makeOdds({ pct: ["60.000", "25.000", "15.000"], ts: t0 + 60_000 });
  const history = [a];
  const sig1 = sharpDetectorStrategy.evaluate({ thresholdPct: 2 }, history, b);
  assert.ok(sig1);
  const sig2 = sharpDetectorStrategy.evaluate({ thresholdPct: 2 }, history, b);
  assert.ok(sig2);
  assert.equal(sig1!.id, sig2!.id);
});
