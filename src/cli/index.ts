#!/usr/bin/env node
// @srivtx/sports-workbench CLI — backtest, signal, and verify on-chain

import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as { version: string };

import { Backtester } from "../backtest/engine.js";
import { TxlineTrader, readStoredSignals } from "../agent/workbench.js";
import { proveOdds } from "../solana/verify.js";
import { TxLineClient } from "../client/txline.js";
import { STRATEGIES } from "../backtest/strategies.js";
import { printBanner } from "./banner.js";
import type { BacktestConfig, TxLineConfig } from "../types/index.js";

const program = new Command();
program
  .name("sports-workbench")
  .description("Verifiable sports trading workbench for TxLINE")
  .version(pkg.version);

// Print the banner before help/version so the binary feels alive.
const maybePrintBanner = (cmd: Command) => {
  if (process.argv.length <= 2 || process.argv.includes("-h") || process.argv.includes("--help")) {
    printBanner();
  }
  cmd.outputHelp();
};
program.addHelpText("beforeAll", () => "");
program.parseOptions(process.argv);
if (process.argv.length <= 2) {
  printBanner();
}

function readConfig(opts: any): TxLineConfig {
  return {
    apiBase: opts.apiBase,
    devnet: !!opts.devnet,
    jwt: process.env.TXLINE_JWT,
    apiToken: process.env.TXLINE_API_TOKEN,
    privateKey: process.env.TXLINE_PRIVATE_KEY,
    walletPubkey: process.env.TXLINE_WALLET_PUBKEY,
    rpcUrl: process.env.SOLANA_RPC_URL,
  };
}

program
  .command("strategies")
  .description("List all built-in strategies")
  .action(() => {
    for (const [name, s] of Object.entries(STRATEGIES)) {
      console.log(`\n[${name}]`);
      console.log(`  ${s.describe()}`);
    }
  });

program
  .command("backtest")
  .description("Run a verifiable backtest over a date range")
  .requiredOption("-s, --strategy <name>", "strategy name (momentum|meanReversion|sharpDetector)")
  .requiredOption("--from <date>", "from date (YYYY-MM-DD)")
  .requiredOption("--to <date>", "to date (YYYY-MM-DD)")
  .option("-t, --threshold <pct>", "threshold in %", "2.0")
  .option("--bankroll <usd>", "starting bankroll USD", "10000")
  .option("--position <fraction>", "position size fraction (0.02 = 2%)", "0.02")
  .option("--no-verify", "skip on-chain Merkle proof fetching (faster)")
  .option("--devnet", "use devnet")
  .option("--api-base <url>", "override API base")
  .option("--market <type>", "market type filter (e.g. MatchWinner)")
  .option("--out <file>", "write JSON report to file")
  .action(async (opts) => {
    const cfg = readConfig(opts);
    const fromMs = new Date(opts.from).getTime();
    const toMs = new Date(opts.to).getTime() + 86_400_000 - 1;
    const bt = new Backtester(cfg);
    const report = await bt.run({
      strategy: opts.strategy,
      thresholdPct: Number(opts.threshold),
      fromDate: fromMs,
      toDate: toMs,
      startingBankroll: Number(opts.bankroll),
      positionSize: Number(opts.position),
      verifyOnChain: opts.verify !== false,
      marketType: opts.market,
    } as BacktestConfig);

    const json = JSON.stringify(report, null, 2);
    if (opts.out) {
      const fs = await import("node:fs/promises");
      await fs.writeFile(opts.out, json);
      console.error(`[sports-workbench] wrote report to ${opts.out}`);
    } else {
      console.log(json);
    }
  });

program
  .command("signal")
  .description("Start the autonomous agent and stream verifiable signals")
  .requiredOption("-s, --strategy <name>", "strategy name")
  .option("-t, --threshold <pct>", "threshold in %", "2.0")
  .option("--devnet", "use devnet")
  .option("--state <path>", "path to local signal store", ".sports-workbench-state.json")
  .option("--api-token <token>", "X-Api-Token (or set TXLINE_API_TOKEN env)")
  .action(async (opts) => {
    const cfg = readConfig(opts);
    if (opts.apiToken) cfg.apiToken = opts.apiToken;
    const trader = new TxlineTrader({
      ...cfg,
      strategy: opts.strategy,
      thresholdPct: Number(opts.threshold),
      statePath: opts.state,
    });
    const ac = new AbortController();
    process.on("SIGINT", () => ac.abort());
    try {
      await trader.start(ac.signal);
    } catch (e: any) {
      if (e?.name !== "AbortError") throw e;
      const n = (await trader.loadState()).length;
      console.error(`[sports-workbench] stopped. ${n} signal(s) saved to ${opts.state}`);
      console.error(`[sports-workbench] verify the latest: sports-workbench verify --devnet --state ${opts.state}`);
    }
  });

program
  .command("verify")
  .description("Generate a Verifiable Settlement Receipt for a single odds update")
  .option("--message-id <id>", "the MessageId of the odds update")
  .option("--ts <ms>", "the timestamp of the odds update")
  .option("--state <path>", "verify a signal from this local store (default: latest)", ".sports-workbench-state.json")
  .option("--index <n>", "which stored signal to verify (0-based; default: latest)")
  .option("--devnet", "use devnet")
  .action(async (opts) => {
    let messageId: string | undefined = opts.messageId;
    let ts: number | undefined = opts.ts !== undefined ? Number(opts.ts) : undefined;

    if (messageId === undefined || ts === undefined) {
      if (opts.messageId !== undefined || opts.ts !== undefined) {
        console.error("[sports-workbench] pass both --message-id and --ts, or neither to use the local store");
        process.exit(1);
      }
      const signals = await readStoredSignals(opts.state);
      if (signals.length === 0) {
        console.error(`[sports-workbench] no signals in ${opts.state} — run: sports-workbench signal --strategy sharpDetector --state ${opts.state}`);
        process.exit(1);
      }
      const idx = opts.index !== undefined ? Number(opts.index) : signals.length - 1;
      const s = signals[idx];
      if (!s || s.messageId === undefined || s.ts === undefined) {
        console.error(`[sports-workbench] signal #${idx} has no messageId/ts — re-capture it with the latest version (${pkg.version})`);
        process.exit(1);
      }
      messageId = s.messageId;
      ts = s.ts;
      console.error(`[sports-workbench] verifying signal #${idx} fixture=${s.fixtureId} strategy=${s.strategy} deltaPct=${s.deltaPct.toFixed(2)}`);
    }

    const cfg = readConfig(opts);
    const proof = await proveOdds(cfg, {
      FixtureId: 0,
      MessageId: messageId,
      Ts: ts,
      Bookmaker: "",
      BookmakerId: 0,
      SuperOddsType: "",
      InRunning: false,
      PriceNames: [],
      Prices: [],
      Pct: [],
    });
    console.log(JSON.stringify(proof, null, 2));
  });

program
  .command("fixtures")
  .description("List the latest World Cup fixtures")
  .option("--devnet", "use devnet")
  .action(async (opts) => {
    const cfg = readConfig(opts);
    const client = new TxLineClient(cfg);
    const fs = await client.getLatestFixtures();
    console.log(JSON.stringify(fs, null, 2));
  });

program
  .command("odds")
  .description("Get the live odds snapshot for a fixture")
  .argument("<fixtureId>", "fixture id")
  .option("--devnet", "use devnet")
  .action(async (fixtureId, opts) => {
    const cfg = readConfig(opts);
    const client = new TxLineClient(cfg);
    const o = await client.getLiveOddsForFixture(Number(fixtureId));
    console.log(JSON.stringify(o, null, 2));
  });

program
  .command("subscribe")
  .description("On-chain subscribe to TxLINE free tier (0 TxL) and activate the API token")
  .option("--devnet", "use devnet")
  .option("--level <id>", "service level (1=60s delayed, 12=real-time World Cup)", "1")
  .option("--weeks <n>", "duration in weeks (multiple of 4)", "4")
  .option("--rpc <url>", "override Solana RPC")
  .option("--tx <sig>", "reuse a previous subscribe txSig (skip on-chain, just re-activate)")
  .action(async (opts) => {
    const cfg = readConfig(opts);
    if (opts.rpc) cfg.rpcUrl = opts.rpc;
    const { subscribeAndActivate, activateApiToken, loadWallet } = await import("../solana/subscribe.js");
    if (opts.tx) {
      // Re-activate with an existing txSig — no new on-chain transaction
      console.error(`[sports-workbench] re-activating with existing txSig ${opts.tx} (no on-chain tx)`);
      const wallet = await loadWallet();
      const { apiToken, expiresAt } = await activateApiToken(cfg, opts.tx, wallet, opts.leagues ?? []);
      console.log(JSON.stringify({
        txSig: opts.tx,
        apiToken,
        expiresAt: new Date(expiresAt).toISOString(),
        wallet: wallet.publicKey.toBase58(),
        hint: "Set TXLINE_API_TOKEN=<apiToken> for subsequent commands.",
      }, null, 2));
      return;
    }
    const r = await subscribeAndActivate(cfg, {
      serviceLevelId: Number(opts.level) as 1 | 12,
      weeks: Number(opts.weeks),
    });
    console.log(JSON.stringify({
      txSig: r.txSig,
      apiToken: r.apiToken,
      expiresAt: new Date(r.expiresAt).toISOString(),
      wallet: r.wallet.toBase58(),
      serviceLevelId: r.serviceLevelId,
      weeks: r.weeks,
      hint: "Set TXLINE_API_TOKEN=<apiToken> for subsequent commands. To retry activation only: sports-workbench subscribe --devnet --tx <txSig>",
    }, null, 2));
  });

program
  .command("doctor")
  .description("Check the local environment for common setup issues (Node, npm prefix, wallet, DNS, token)")
  .option("--fix", "auto-fix writable issues (e.g. set user-owned npm prefix, no sudo)")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    const { doctor } = await import("./doctor.js");
    const code = await doctor({ fix: !!opts.fix, json: !!opts.json });
    process.exit(code);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error("[sports-workbench] error:", err);
  process.exit(1);
});
