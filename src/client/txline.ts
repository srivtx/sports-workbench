// TxLINE REST + SSE client
// All methods support the free World Cup tier (Service Level 1 or 12).
// Paid tiers add an X-Api-Token header.

import axios from "axios";
import { sseStream } from "./sse.js";
import type {
  TxLineConfig,
  OddsPayload,
  OddsStreamEvent,
  OddsValidation,
  ScoreSnapshot,
  Fixture,
} from "../types/index.js";
import { getGuestJwt, makeBaseUrl, makeHttp } from "./auth.js";

export class TxLineClient {
  private config: TxLineConfig;

  constructor(config: TxLineConfig = {}) {
    this.config = config;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const jwt = await getGuestJwt(this.config);
    const h: Record<string, string> = { Authorization: `Bearer ${jwt}` };
    if (this.config.apiToken) h["X-Api-Token"] = this.config.apiToken;
    return h;
  }

  // ========================
  // Fixtures
  // ========================

  async getFixturesByDay(epochDay: number): Promise<Fixture[]> {
    const headers = await this.authHeaders();
    // OpenAPI: /api/fixtures/snapshot takes ?competitionId= (no path param)
    const url = `${makeBaseUrl(this.config)}/fixtures/snapshot`;
    const res = await axios.get<Fixture[]>(url, { headers, params: { asOf: epochDay * 86_400_000 } });
    return res.data;
  }

  async getLatestFixtures(asOfEpochDay?: number): Promise<Fixture[]> {
    const headers = await this.authHeaders();
    // OpenAPI: /api/fixtures/snapshot (no /latest, no path param)
    const url = `${makeBaseUrl(this.config)}/fixtures/snapshot${
      asOfEpochDay ? `?asOf=${asOfEpochDay}` : ""
    }`;
    const res = await axios.get<Fixture[]>(url, { headers });
    return res.data;
  }

  async getFixtureUpdates(fixtureId: number, epochDay: number, hourOfDay = 0): Promise<unknown[]> {
    const headers = await this.authHeaders();
    // OpenAPI: /api/fixtures/updates/{epochDay}/{hourOfDay}
    const url = `${makeBaseUrl(this.config)}/fixtures/updates/${epochDay}/${hourOfDay}`;
    const res = await axios.get<unknown[]>(url, { headers });
    return res.data;
  }

  // ========================
  // Odds
  // ========================

  async getOddsSnapshot(fixtureId: number, asOf?: number): Promise<OddsPayload[]> {
    const headers = await this.authHeaders();
    const url = `${makeBaseUrl(this.config)}/odds/snapshot/${fixtureId}${
      asOf ? `?asOf=${asOf}` : ""
    }`;
    const res = await axios.get<OddsPayload[]>(url, { headers });
    return res.data;
  }

  async getLiveOddsForFixture(fixtureId: number): Promise<OddsPayload[]> {
    // OpenAPI: /api/odds/snapshot/{fixtureId} is the right path
    // (no /odds/live/{id}). Delegates to getOddsSnapshot.
    return this.getOddsSnapshot(fixtureId);
  }

  /**
   * Get a Merkle proof for a specific odds update. This is the proof that
   * is fed into the on-chain `validate_odds` instruction.
   */
  async getOddsValidation(messageId: string, ts: number): Promise<OddsValidation> {
    const headers = await this.authHeaders();
    const url = `${makeBaseUrl(this.config)}/odds/validation`;
    const res = await axios.get<OddsValidation>(url, {
      headers,
      params: { messageId, ts },
    });
    return res.data;
  }

  async getHistoricalOdds(
    epochDay: number,
    hourOfDay: number,
    interval: number
  ): Promise<OddsPayload[]> {
    const headers = await this.authHeaders();
    const url = `${makeBaseUrl(this.config)}/odds/updates/${epochDay}/${hourOfDay}/${interval}`;
    const res = await axios.get<OddsPayload[]>(url, { headers });
    return res.data;
  }

  // ========================
  // Scores
  // ========================

  async getScoreSnapshot(fixtureId: number, asOf?: number): Promise<ScoreSnapshot> {
    const headers = await this.authHeaders();
    const url = `${makeBaseUrl(this.config)}/scores/snapshot/${fixtureId}${
      asOf ? `?asOf=${asOf}` : ""
    }`;
    const res = await axios.get<ScoreSnapshot>(url, { headers });
    return res.data;
  }

  async getHistoricalScores(fixtureId: number): Promise<ScoreSnapshot[]> {
    const headers = await this.authHeaders();
    const url = `${makeBaseUrl(this.config)}/scores/historical/${fixtureId}`;
    const res = await axios.get<ScoreSnapshot[]>(url, { headers });
    return res.data;
  }

  /**
   * Free-tier live odds stream — uses the activated X-Api-Token (no extra cost
   * for Service Level 1 or 12, both 0 TxL). Falls back to the main domain
   * (txline.txodds.com / txline-dev.txodds.com) with both JWT and X-Api-Token,
   * which is the same path the reference example uses against the now-dead
   * `oracle.txodds.com` / `oracle-dev.txodds.com` subdomains.
   */
  async *streamFreeTierOdds(opts: {
    signal?: AbortSignal;
    fixtureId?: number;
  } = {}): AsyncGenerator<OddsPayload> {
    const headers = await this.authHeaders();
    const params = new URLSearchParams();
    if (opts.fixtureId) params.set("fixtureId", String(opts.fixtureId));
    const url = `${makeBaseUrl(this.config)}/odds/stream${
      params.toString() ? `?${params}` : ""
    }`;

    for await (const evt of sseStream({ url, headers, signal: opts.signal })) {
      if (evt.event === "heartbeat" || !evt.data) continue;
      try {
        const payload: OddsPayload = JSON.parse(evt.data);
        yield payload;
      } catch {
        // ignore malformed event
      }
    }
  }

  /**
   * Paid-tier real-time odds SSE stream (resumable via Last-Event-ID).
   * Requires X-Api-Token. Use for production deployments.
   */
  async *streamOdds(opts: {
    signal?: AbortSignal;
    fixtureId?: number;
    resumeFromEventId?: string;
  } = {}): AsyncGenerator<OddsStreamEvent> {
    const headers = await this.authHeaders();
    const params = new URLSearchParams();
    if (opts.fixtureId) params.set("fixtureId", String(opts.fixtureId));
    if (opts.resumeFromEventId) headers["Last-Event-ID"] = opts.resumeFromEventId;
    const url = `${makeBaseUrl(this.config)}/odds/stream${
      params.toString() ? `?${params}` : ""
    }`;

    for await (const evt of sseStream({ url, headers, signal: opts.signal })) {
      yield { id: evt.id, event: evt.event, data: evt.data };
    }
  }

  async *streamScores(opts: {
    signal?: AbortSignal;
    fixtureId?: number;
  } = {}): AsyncGenerator<unknown> {
    const headers = await this.authHeaders();
    const params = new URLSearchParams();
    if (opts.fixtureId) params.set("fixtureId", String(opts.fixtureId));
    const url = `${makeBaseUrl(this.config)}/scores/stream${
      params.toString() ? `?${params}` : ""
    }`;
    for await (const evt of sseStream({ url, headers, signal: opts.signal })) {
      if (evt.event === "heartbeat" || !evt.data) continue;
      try {
        yield JSON.parse(evt.data);
      } catch {
        // ignore
      }
    }
  }
}

export { getGuestJwt } from "./auth.js";
