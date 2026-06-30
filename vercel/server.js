// Vercel-style serverless handler: serves a single-page demo
// and proxies calls to the TxLINE API (so the browser doesn't need
// to handle the guest JWT and CORS).

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const TXLINE_API = "https://txline.txodds.com";
// The reference example's guest subdomain (oracle.txodds.com) is not in
// public DNS, so we use the main API for all calls.

let cachedJwt = null;
let cachedAt = 0;
async function getGuestJwt() {
  if (cachedJwt && Date.now() - cachedAt < 25 * 24 * 60 * 60 * 1000) return cachedJwt;
  const res = await fetch(`${TXLINE_API}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`auth failed: ${res.status}`);
  const j = await res.json();
  cachedJwt = j.token;
  cachedAt = Date.now();
  return cachedJwt;
}

async function txlineFetch(path, init = {}) {
  const jwt = await getGuestJwt();
  const headers = { ...(init.headers || {}), Authorization: `Bearer ${jwt}` };
  return fetch(`${TXLINE_API}${path}`, { ...init, headers });
}

async function guestFetch(path, init = {}) {
  // All free-tier calls go to the main API host
  return txlineFetch(path, init);
}

function send(res, status, body, type = "application/json") {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.statusCode = 204;
      return res.end();
    }

    // API proxy
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/fixtures") {
        // free guest endpoint
        try {
          // the guest /api/guest/odds/snapshot doesn't list fixtures,
          // so we attempt the paid endpoint and fall back to a friendly
          // empty response if no API token is configured
          const r = await txlineFetch("/api/fixtures/snapshot/latest");
          if (r.status === 403 || r.status === 401) {
            return send(res, 200, []);
          }
          return send(res, r.status, await r.text());
        } catch (e) {
          return send(res, 200, []);
        }
      }
      if (url.pathname === "/api/odds") {
        const id = url.searchParams.get("fixtureId");
        if (!id) return send(res, 400, { error: "missing fixtureId" });
        try {
          const r = await txlineFetch(`/api/odds/live/${id}`);
          if (r.status === 403 || r.status === 401) {
            return send(res, 200, []);
          }
          return send(res, r.status, await r.text());
        } catch (e) {
          return send(res, 200, []);
        }
      }
      if (url.pathname === "/api/guest-odds") {
        // free-tier guest odds snapshot
        try {
          const r = await guestFetch("/odds/snapshot");
          return send(res, r.status, await r.text());
        } catch (e) {
          return send(res, 200, []);
        }
      }
      if (url.pathname === "/api/validation") {
        const messageId = url.searchParams.get("messageId");
        const ts = url.searchParams.get("ts");
        if (!messageId || !ts) return send(res, 400, { error: "missing messageId or ts" });
        const r = await txlineFetch(`/api/odds/validation?messageId=${messageId}&ts=${ts}`);
        return send(res, r.status, await r.text());
      }
      if (url.pathname === "/api/prove") {
        // POST { messageId, ts, fixtureId, ...odds } → { settlementReceipt, merkleRoot }
        const body = await jsonBody(req);
        const r = await txlineFetch(
          `/api/odds/validation?messageId=${encodeURIComponent(body.messageId)}&ts=${body.ts}`
        );
        const validation = await r.json();
        const programId = "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA";
        const epochDay = Math.floor(body.ts / 86_400_000);
        const subTreeRoot =
          typeof validation.summary.oddsSubTreeRoot === "string"
            ? validation.summary.oddsSubTreeRoot
            : "0x" + Buffer.from(validation.summary.oddsSubTreeRoot).toString("hex");
        const receipt = {
          messageId: body.messageId,
          ts: body.ts,
          fixtureId: validation.summary.fixtureId,
          updateStats: validation.summary.updateStats,
          subTreeProof: validation.subTreeProof,
          mainTreeProof: validation.mainTreeProof,
          subTreeRoot,
          programId,
          epochDay,
          generatedAt: Date.now(),
        };
        // deterministic mock tx for demo
        const hash = crypto
          .createHash("sha256")
          .update(JSON.stringify(receipt))
          .digest("hex");
        receipt.mockSignature = hash;
        return send(res, 200, receipt);
      }
      if (url.pathname === "/api/strategies") {
        return send(res, 200, [
          {
            name: "momentum",
            description:
              "Follow the move. Fire when implied probability for the home team rises >thresholdPct in the rolling window.",
          },
          {
            name: "meanReversion",
            description:
              "Fade the move. Fire when implied probability for an outcome moves >thresholdPct in either direction; bet on reversion.",
          },
          {
            name: "sharpDetector",
            description:
              "Detect ANY significant odds shift. Fire when max abs deltaPct across all outcomes > threshold within the rolling window. Tracks whether the call predicted the outcome.",
          },
        ]);
      }
      return send(res, 404, { error: "not found" });
    }

    // Static index
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
      return send(res, 200, html, "text/html");
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

function jsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, () =>
    console.log(`[sports-workbench] demo listening on :${PORT}`)
  );
}
module.exports = server;
