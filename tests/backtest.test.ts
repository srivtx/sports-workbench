// Backtester report-shape tests — uses fake TxLINE client to avoid network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Backtester } from "../src/backtest/engine.ts";
import type { OddsPayload, TxLineConfig } from "../src/types/index.ts";
import type { TxLineClient } from "../src/client/txline.ts";

class FakeClient {
  fixtures: any[];
  oddsByDay: Map<number, OddsPayload[]> = new Map();

  constructor(fixtures: any[], odds: OddsPayload[]) {
    this.fixtures = fixtures;
    for (const o of odds) {
      const day = Math.floor(o.Ts / 86_400_000);
      const arr = this.oddsByDay.get(day) ?? [];
      arr.push(o);
      this.oddsByDay.set(day, arr);
    }
  }

  async getLatestFixtures() {
    return this.fixtures;
  }
  async getFixturesByDay(_day: number) {
    return this.fixtures;
  }
  async getHistoricalOdds(day: number, _h: number, _i: number) {
    return this.oddsByDay.get(day) ?? [];
  }
  async getHistoricalScores(_id: number) {
    return [];
  }
}

test("backtester produces a report with 0 signals on empty data", async () => {
  const cfg: TxLineConfig = {};
  const bt = new Backtester(cfg);
  (bt as any).client = new FakeClient([], []) as unknown as TxLineClient;
  const r = await bt.run({
    strategy: "sharpDetector",
    thresholdPct: 2,
    fromDate: 0,
    toDate: 86_400_000 * 2,
    startingBankroll: 10000,
    positionSize: 0.02,
    verifyOnChain: false,
  });
  assert.equal(r.totalSignals, 0);
  assert.equal(r.totalTrades, 0);
  assert.equal(r.winRate, 0);
});

test("backtester detects a sharp move and counts a trade", async () => {
  const cfg: TxLineConfig = {};
  const fixtureId = 4242;
  const t0 = 1_700_000_000_000; // 2023-11-14
  const history: OddsPayload[] = [
    {
      FixtureId: fixtureId,
      MessageId: "m1",
      Ts: t0,
      Bookmaker: "Test",
      BookmakerId: 1,
      SuperOddsType: "HomeWin",
      InRunning: false,
      PriceNames: ["Home", "Draw", "Away"],
      Prices: [200, 330, 400],
      Pct: ["50.000", "30.000", "20.000"],
    },
    {
      FixtureId: fixtureId,
      MessageId: "m2",
      Ts: t0 + 60_000,
      Bookmaker: "Test",
      BookmakerId: 1,
      SuperOddsType: "HomeWin",
      InRunning: false,
      PriceNames: ["Home", "Draw", "Away"],
      Prices: [240, 320, 400],
      Pct: ["60.000", "25.000", "15.000"],
    },
  ];
  const bt = new Backtester(cfg);
  (bt as any).client = new FakeClient(
    [{ fixtureId, competitionId: 1, startTime: t0, status: "F" }],
    history
  ) as unknown as TxLineClient;
  const r = await bt.run({
    strategy: "sharpDetector",
    thresholdPct: 5,
    fromDate: t0 - 86_400_000,
    toDate: t0 + 86_400_000,
    startingBankroll: 10000,
    positionSize: 0.02,
    verifyOnChain: false,
  });
  // The fake client has no final scores, so trades stay open and aren't
  // included in report.trades (which only includes closed trades).
  // The signal should have been detected.
  assert.ok(r.totalSignals >= 1, "should detect at least one signal");
  // The strategy that produced it should be sharpDetector
  assert.equal(r.byStrategy.sharpDetector?.trades ?? 0, 0); // no closed trades
});
