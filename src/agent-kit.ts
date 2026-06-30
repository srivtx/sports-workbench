// Drop-in plugin for solana-agent-kit (sendaifun/solana-agent-kit).
// Usage:
//   import { TxlinePlugin } from "@srivtx/sports-workbench/agent-kit";
//   agent.use(new TxlinePlugin({ strategy: "sharpDetector", thresholdPct: 2 }));

import { TxLineClient } from "./client/txline.js";
import { Backtester } from "./backtest/engine.js";
import { STRATEGIES } from "./backtest/strategies.js";
import { proveOdds } from "./solana/verify.js";
import type { BacktestConfig, Signal, StrategyName, TxLineConfig } from "./types/index.js";

export interface TxlinePluginConfig extends TxLineConfig {
  strategy: StrategyName;
  thresholdPct: number;
  marketType?: string;
}

export class TxlinePlugin {
  name = "txline";
  methods: any;

  constructor(private config: TxlinePluginConfig) {
    this.methods = {
      /** Run a verifiable backtest over a date range */
      backtestOdds: async (agent: unknown, params: Omit<BacktestConfig, "strategy" | "thresholdPct" | "marketType">) => {
        const bt = new Backtester(this.config);
        return bt.run({
          ...params,
          strategy: this.config.strategy,
          thresholdPct: this.config.thresholdPct,
          marketType: this.config.marketType,
          verifyOnChain: params.verifyOnChain ?? true,
        });
      },
      /** Describe the active strategy */
      describeStrategy: async (_agent: unknown) => {
        const s = STRATEGIES[this.config.strategy];
        return { name: s.name, description: s.describe() };
      },
      /** Live signal — connects to the SSE stream and returns the first sharp move it sees */
      findSharpMove: async (
        _agent: unknown,
        params: { fixtureId?: number; timeoutMs?: number } = {}
      ) => {
        const client = new TxLineClient(this.config);
        const start = Date.now();
        const history: any[] = [];
        const s = STRATEGIES[this.config.strategy];
        for await (const o of client.streamFreeTierOdds({ fixtureId: params.fixtureId })) {
          history.push(o);
          const sig = s.evaluate(
            { thresholdPct: this.config.thresholdPct, marketTypeFilter: this.config.marketType },
            history,
            o
          );
          if (sig) {
            const proof = await proveOdds(this.config, o).catch(() => null);
            return { signal: sig, proof, odds: o };
          }
          if (params.timeoutMs && Date.now() - start > params.timeoutMs) return null;
        }
        return null;
      },
      /** Fetch an odds snapshot for a single fixture */
      getOdds: async (_agent: unknown, params: { fixtureId: number; asOf?: number }) => {
        const client = new TxLineClient(this.config);
        return client.getOddsSnapshot(params.fixtureId, params.asOf);
      },
      /** Fetch the current World Cup fixtures */
      getFixtures: async (_agent: unknown, params: { asOfEpochDay?: number } = {}) => {
        const client = new TxLineClient(this.config);
        return client.getLatestFixtures(params.asOfEpochDay);
      },
      /** Generate a Verifiable Settlement Receipt for a single odds update */
      proveOdds: async (_agent: unknown, params: { messageId: string; ts: number }) => {
        return proveOdds(this.config, {
          FixtureId: 0,
          MessageId: params.messageId,
          Ts: params.ts,
          Bookmaker: "",
          BookmakerId: 0,
          SuperOddsType: "",
          InRunning: false,
          PriceNames: [],
          Prices: [],
          Pct: [],
        });
      },
    };
  }
}

export default TxlinePlugin;
