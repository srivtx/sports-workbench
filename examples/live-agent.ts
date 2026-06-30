// Example: live signal agent with custom webhook.

import { TxlineTrader } from "../src/agent/workbench.js";

async function main() {
  const agent = new TxlineTrader({
    strategy: "sharpDetector",
    thresholdPct: 2,
    statePath: "./my-signals.json",
    signalWebhook: process.env.SLACK_WEBHOOK_URL,
  });

  const ac = new AbortController();
  process.on("SIGINT", () => ac.abort());
  console.log("[example] starting live signal agent (Ctrl+C to stop)...");
  await agent.start(ac.signal);
}

main().catch((err) => {
  console.error("Agent failed:", err);
  process.exit(1);
});
