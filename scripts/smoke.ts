// Smoke test against the real TxLINE API to verify the client works.

import { TxLineClient } from "../src/client/txline.js";
import { proveOdds } from "../src/solana/verify.js";

async function main() {
  console.log("[smoke] acquiring guest JWT...");
  const client = new TxLineClient();
  const fixtures = await client.getLatestFixtures().catch((e) => {
    console.log("[smoke] getLatestFixtures failed (expected without paid tier):", e.message);
    return [];
  });
  console.log(`[smoke] got ${fixtures.length} fixtures`);

  // try the free guest odds stream
  console.log("[smoke] connecting to free-tier SSE for 8s...");
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  let count = 0;
  let last: any = null;
  try {
    for await (const o of client.streamFreeTierOdds({ signal: ac.signal })) {
      count++;
      last = o;
      if (count >= 3) break;
    }
  } catch (e) {
    console.log("[smoke] stream error (expected if no live WC matches):", e.message);
  } finally {
    clearTimeout(t);
  }
  console.log(`[smoke] received ${count} odds updates`);

  if (last) {
    console.log(`[smoke] last: fixture=${last.FixtureId} bookmaker=${last.Bookmaker} pct=${last.Pct.join(",")}`);
    console.log("[smoke] proving odds on-chain...");
    try {
      const proof = await proveOdds({}, last);
      console.log(`[smoke] proof: merkleRoot=${proof.merkleRoot.slice(0, 30)}… verified=${proof.verified}`);
    } catch (e) {
      console.log("[smoke] prove error:", e.message);
    }
  }

  console.log("[smoke] done");
}

main().catch((e) => {
  console.error("[smoke] fatal:", e);
  process.exit(1);
});
