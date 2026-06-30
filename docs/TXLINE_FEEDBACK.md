# TxLINE Feedback (built into the hackathon submission)

## What we liked

- **30-day guest JWT.** One call to `POST /auth/guest/start`, you're authenticated for 30 days. We cache in-process; re-acquires automatically on 401. This is the right design for a hackathon — no wallet needed for read-only.
- **Free World Cup tier is generous.** Service Level 1 (60s-delayed odds) and Service Level 12 (real-time World Cup) are both free. No TxL tokens. We built the entire agent on the free tier.
- **SSE stream is well-designed.** `Last-Event-ID` header for resume, `id` in the format `timestamp:index`, heartbeat events for keep-alive. The `eventsource-parser` ecosystem maps cleanly onto this.
- **3-level Merkle hierarchy.** Hourly/daily/5-min batches → main root on-chain → sub-tree roots for individual records → proofs. This is the cleanest data-anchoring model we've seen.
- **`/api/odds/validation?messageId=…&ts=…`** returns exactly what we need for a `validate_odds` view call: the canonicalized sub-tree root + the proof path. No manual reconstruction needed.
- **OpenAPI spec is in the repo** (`/tx-on-chain/openapi.json` etc). Reference examples are well-typed TypeScript.
- **Schema is normalized across competitions.** Same JSON shape for odds, scores, fixtures — we built one client, used it everywhere.
- **`fetchOddsValidation` includes the `odds` record itself** in the response. Saves a round-trip when you want both the proof AND the underlying record.
- **Free tier covers the 8 biggest soccer leagues** (EPL, La Liga, Bundesliga, Serie A, Ligue 1, UCL, etc.) plus World Cup. We can demo against real data, not synthetic.

## What we'd want next

- **An `npm` package for the OpenAPI spec.** Currently the only TypeScript reference is the `tx-on-chain` repo's `examples/` directory. Publishing `@txodds/client` (with the IDL bundled) would let every hackathon participant skip the boilerplate.
- **A `validate_odds.view()` helper in the SDK.** Right now the proof is fetched and bundled, but to actually call `validate_odds` you need to import the IDL, build an Anchor program, and re-derive the PDAs. A `proveOdds({ messageId, ts }) → { ok: true, onChainTx }` helper in the SDK would make "verifiable" one call instead of three.
- **A `Backtest` endpoint** that does the historical replay server-side. We had to walk `for d = fromEpochDay; d <= toEpochDay; d++ { for h = 0; h < 24; h++ { for i = 0; i < 12; i++ ... }}` from the client side. A single `GET /api/odds/backtest?from=…&to=…&fixtureId=…` would be much faster.
- **Free tier stream rate is too low for some strategies.** 60s sample rate is fine for sharpDetector (we want 60s windows), but a `meanReversion` strategy with a 5s window won't work on the free tier. Would be nice if the free tier had a "burst" option (e.g. 5s sampling for 1 minute, then 60s cooldown).
- **No Python SDK.** Most sports quant work is in Python (pandas, polars, numpy). Right now the only way to use TxLINE from Python is to write the HTTP client by hand from the OpenAPI spec.
- **The on-chain program `txoracle` is a single Anchor workspace.** Would be nice to have a "permissioned" mode where a builder could deploy their own program that just CPI's into `validate_odds` for a specific market type.
- **The hackathon-specific free tier is great but unclear how long it lasts.** "Free until July 19 23:59 UTC" is hackathon-only. What's the path after?
- **Docs for the on-chain error codes** are scattered across the `docs/` folder. A single `ERROR_CODES.md` would help.

## Bugs we hit

### 1. The free-tier guest SSE subdomains (`oracle.txodds.com` and `oracle-dev.txodds.com`) are not in public DNS

When we run `sports-workbench signal` on a fresh machine, we get `getaddrinfo ENOTFOUND oracle.txodds.com` even though `txline.txodds.com` resolves fine. The reference example at `tx-on-chain/backup/examples/streaming/stream_odds.ts` points to `https://oracle-dev.txodds.com` for the auth, activate, and stream endpoints — but this subdomain is **not in public DNS from any network we tested** (8.8.8.8, 1.1.1.1, ISP default, corporate). Only `txline.txodds.com` (mainnet) and `txline-dev.txodds.com` (devnet) resolve via CloudFront.

**Workaround we shipped:** Use the main `txline-dev.txodds.com` host (or `txline.txodds.com` for mainnet) for `auth/guest/start`, `api/token/activate`, and `odds/stream` — pass BOTH `Authorization: Bearer <jwt>` and `X-Api-Token: <apiToken>` headers. The server accepts the same call on the main domain. `sports-workbench signal` does this automatically once you run `sports-workbench subscribe --devnet` first.

### 2. The devnet `subscribe` on-chain instruction needs the account order from the **deployed program**, not the IDL

The on-chain IDL declares the account order as `token_program, system_program, associated_token_program` — but the deployed devnet program actually checks `token_program, system_program=SystemProgram.programId, associated_token_program=ASSOCIATED_TOKEN_PROGRAM_ID`, which matches the IDL. **However**, the discriminator we computed from the IDL (`sha256("global:subscribe")[:8] = 0xfe 0x1c 0xbf 0x8a 0x9c 0xb3 0xb7 0x35`) was wrong by one byte initially because of a stale build. The correct discriminator is now in `src/solana/subscribe.ts` and verified against `anchor idl fetch 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J --provider.cluster devnet`.

The `weeks` argument must be a multiple of 4 (`InvalidWeeks` error code 6041) — a 1-week subscription will be rejected. We default to `--weeks 4`.

### 3. `txline-dev.txodds.com` does expose `/api/token/activate` for devnet

(matchmind said otherwise in their feedback — but as of 2026-06-26, it works. The trick is to call `auth/guest/start` first to get a JWT, then sign the canonical message `<txSig>:<leagues>:<jwt>` with the wallet, then POST to `/api/token/activate` with the signed payload. We get a real `txoracle_api_<hex>` token back, valid 30 days. Tested on our devnet wallet `6vTYvzm1dwqJreoYHEiUqitnfyDoLmp3seVX6fjFwVFp` and it streams live odds for the World Cup / 8 soccer leagues.)

### 4. The `makeBaseUrl` helper returns `…/api` so `${base}/api/token/activate` becomes `…/api/api/token/activate` (double `/api`)

A subtle bug for anyone using `makeBaseUrl` directly. We fixed it in `activateApiToken` by stripping the trailing `/api` from `makeBaseUrl` before appending `/api/token/activate`. Worth fixing in the official SDK too.

### 5. The `tweetnacl` npm package's ESM export is `{ default: ... }`, not the named exports

`import * as nacl from "tweetnacl"` gives you `{ default: <the lib> }` in pure ESM, so `nacl.sign.detached` is `undefined`. Use `import nacl from "tweetnacl"` instead. We hit this when the activate call started failing with `Cannot read properties of undefined (reading 'detached')`.

### Other findings

- The free tier requires a Token-2022 ATA creation even for $0 subscriptions. We create the ATA in the same transaction as the `subscribe` instruction (the on-chain program will refuse to run if the user's Token-2022 ATA is not initialized).
- `/api/odds/validation` returns the sub-tree root as a hex string in some responses and a `Buffer` in others — minor inconsistency.
- The SSE stream's `data:` lines can contain multi-line JSON (the parser is supposed to concat them, but some of our first attempts broke because we treated each line as a separate event).

## How we used the API in our submission

| Endpoint | Calls in 24h |
|---|---|
| `/auth/guest/start` | 1 (cached) |
| `/fixtures/snapshot/{epochDay}` | 30 (one per day in a 30-day backtest) |
| `/odds/updates/{epochDay}/{hour}/{interval}` | 30 × 24 × 12 = 8,640 (every 5-min interval) |
| `/odds/validation?messageId=…&ts=…` | 1 per detected signal (~50-200) |
| `oracle.txodds.com/api/guest/odds/stream` | 1 long-lived SSE connection for the live agent |

Total: under 10k API calls, all on the free tier.

## Net

`@srivtx/sports-workbench` would not have been possible without the free tier. The free tier is the single most important decision TxODDS made for this hackathon. It removed every barrier between a builder and a working verifiable signal agent.

Thank you TxODDS team.
