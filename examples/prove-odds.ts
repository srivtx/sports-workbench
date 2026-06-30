// Example: generate a Verifiable Settlement Receipt for any odds update.

import { proveOdds } from "../src/solana/verify.js";
import { TxLineClient } from "../src/client/txline.js";

async function main() {
  const client = new TxLineClient();
  // Fetch the latest odds for any live fixture
  const fixtures = await client.getLatestFixtures();
  console.log(`Found ${fixtures.length} fixtures`);
  if (fixtures.length === 0) {
    console.log("No live fixtures right now");
    return;
  }
  const fixtureId = fixtures[0].fixtureId;
  const odds = await client.getLiveOddsForFixture(fixtureId);
  if (odds.length === 0) {
    console.log(`No odds for fixture ${fixtureId} right now`);
    return;
  }
  const o = odds[0];
  console.log(`Proving odds for fixture=${o.FixtureId} bookmaker=${o.Bookmaker} messageId=${o.MessageId}`);
  const proof = await proveOdds({}, o);
  console.log(JSON.stringify(proof, null, 2));
}

main().catch((err) => {
  console.error("Prove failed:", err);
  process.exit(1);
});
