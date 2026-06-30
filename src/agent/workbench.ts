// TxlineTrader = the autonomous agent. Connects to the SSE stream,
// applies a strategy, fires verifiable signals, persists to a local
// SQLite-style JSON store. Designed to be run unattended in a worker.

import { TxLineClient } from "../client/txline.js";
import { proveOdds } from "../solana/verify.js";
import { STRATEGIES, type StrategyContext } from "../backtest/strategies.js";
import type {
  Signal,
  StrategyName,
  TxLineConfig,
  OddsPayload,
} from "../types/index.js";
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export interface AgentConfig extends TxLineConfig {
  strategy: StrategyName;
  thresholdPct: number;
  marketType?: string;
  statePath?: string; // path to local JSON store
  signalWebhook?: string; // POST URL on each new signal (optional)
  live?: boolean; // default true; if false, runs in offline backtest mode
}

export interface StoredSignal extends Signal {
  receivedAt: number;
  proof?: {
    messageId: string;
    ts: number;
    merkleRoot: string;
    pda: string;
    programId: string;
    settlementReceipt: any;
  };
}

export class TxlineTrader {
  private config: AgentConfig;
  private client: TxLineClient;
  private history: OddsPayload[] = [];
  private statePath: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new TxLineClient(config);
    this.statePath = config.statePath ?? ".sports-workbench-state.json";
  }

  async loadState(): Promise<StoredSignal[]> {
    if (!existsSync(this.statePath)) return [];
    try {
      const text = await readFile(this.statePath, "utf8");
      const parsed = JSON.parse(text);
      return parsed.signals ?? [];
    } catch {
      return [];
    }
  }

  async saveState(signals: StoredSignal[]): Promise<void> {
    await writeFile(
      this.statePath,
      JSON.stringify({ signals, savedAt: Date.now() }, null, 2)
    );
  }

  /**
   * Start the agent. Connects to the SSE stream and runs forever.
   */
  async start(signal: AbortSignal): Promise<void> {
    const strategy = STRATEGIES[this.config.strategy];
    if (!strategy) throw new Error(`Unknown strategy: ${this.config.strategy}`);

    const ctx: StrategyContext = {
      thresholdPct: this.config.thresholdPct,
      marketTypeFilter: this.config.marketType,
    };

    console.error(`[sports-workbench] starting strategy=${strategy.name} threshold=${ctx.thresholdPct}%`);

    const stored = await this.loadState();
    const seen = new Set(stored.map((s) => s.id));

    for await (const odds of this.client.streamFreeTierOdds({ signal })) {
      this.history.push(odds);
      const sig = strategy.evaluate(ctx, this.history, odds);
      if (!sig) continue;
      if (seen.has(sig.id)) continue;
      seen.add(sig.id);

      const verified = await this.verify(odds, sig);
      stored.push(verified);
      await this.saveState(stored);

      console.error(
        `[sports-workbench] signal fixture=${sig.fixtureId} strategy=${sig.strategy} deltaPct=${sig.deltaPct.toFixed(
          2
        )} verified=${verified.verified}`
      );

      if (this.config.signalWebhook) {
        try {
          await fetch(this.config.signalWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(verified),
          });
        } catch (e) {
          // ignore
        }
      }
    }
  }

  private async verify(odds: OddsPayload, sig: Signal): Promise<StoredSignal> {
    try {
      const proof = await proveOdds(this.config, odds);
      return {
        ...sig,
        verified: true,
        merkleRoot: proof.merkleRoot,
        messageId: odds.MessageId,
        receivedAt: Date.now(),
        proof: proof as any,
      };
    } catch (e) {
      return {
        ...sig,
        receivedAt: Date.now(),
      };
    }
  }
}
