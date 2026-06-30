// Example: run a verifiable backtest against the free World Cup tier.

import { Backtester } from "../src/backtest/engine.js";

async function main() {
  const bt = new Backtester();
  const report = await bt.run({
    strategy: "sharpDetector",
    thresholdPct: 2,
    fromDate: Date.parse("2026-06-01"),
    toDate: Date.parse("2026-07-10"),
    startingBankroll: 10000,
    positionSize: 0.02,
    verifyOnChain: true,
  });

  console.log("=".repeat(60));
  console.log("VERIFIABLE SPORTS BACKTEST REPORT");
  console.log("=".repeat(60));
  console.log(`Strategy:        ${report.config.strategy}`);
  console.log(`Threshold:       ${report.config.thresholdPct}%`);
  console.log(`Date range:      ${new Date(report.config.fromDate).toISOString()} → ${new Date(report.config.toDate).toISOString()}`);
  console.log("-".repeat(60));
  console.log(`Total signals:   ${report.totalSignals}`);
  console.log(`Closed trades:   ${report.totalTrades}`);
  console.log(`Win rate:        ${(report.winRate * 100).toFixed(1)}%`);
  console.log(`Total P&L:       $${report.totalPnl.toFixed(2)} (${(report.totalPnlPct * 100).toFixed(2)}%)`);
  console.log(`Max drawdown:    ${(report.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`Sharpe:          ${report.sharpeRatio.toFixed(2)}`);
  console.log(`Sortino:         ${report.sortinoRatio.toFixed(2)}`);
  console.log(`Profit factor:   ${report.profitFactor.toFixed(2)}`);
  console.log(`Avg win:         ${(report.avgWinPct * 100).toFixed(2)}%`);
  console.log(`Avg loss:        ${(report.avgLossPct * 100).toFixed(2)}%`);
  console.log("-".repeat(60));
  console.log(`VERIFIED SIGNALS: ${report.verifiedSignals}`);
  console.log(`UNVERIFIED:       ${report.unverifiedSignals}`);
  console.log("-".repeat(60));
  console.log("PROOF ARTIFACTS (first 5):");
  for (const a of report.proofArtifacts.slice(0, 5)) {
    console.log(`  signal=${a.signalId.slice(0, 20)}...`);
    console.log(`    messageId:    ${a.messageId}`);
    console.log(`    onChainTx:    ${a.onChainTx || "(verify on devnet)"}`);
    console.log(`    merkleRoot:   ${a.merkleRoot.slice(0, 24)}...`);
  }
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Backtest failed:", err.message);
  process.exit(1);
});
