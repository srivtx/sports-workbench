// Guest JWT auth — required for ALL endpoints
// Free tier (Service Level 1 or 12) does NOT need an X-Api-Token after this

import axios, { type AxiosInstance } from "axios";
import type { TxLineConfig } from "../types/index.js";

const MAINNET_AUTH = "https://txline.txodds.com/auth/guest/start";
const DEVNET_AUTH = "https://txline-dev.txodds.com/auth/guest/start";

const MAINNET_API = "https://txline.txodds.com/api";
const DEVNET_API = "https://txline-dev.txodds.com/api";

let cachedJwt: { token: string; expiresAt: number } | null = null;

export function makeBaseUrl(config: TxLineConfig): string {
  return config.apiBase ?? (config.devnet ? DEVNET_API : MAINNET_API);
}

export function makeAuthUrl(config: TxLineConfig): string {
  return config.devnet ? DEVNET_AUTH : MAINNET_AUTH;
}

/**
 * Acquire a guest JWT. JWT is valid for 30 days; we cache in-process.
 * Re-acquires automatically if expired.
 */
export async function getGuestJwt(config: TxLineConfig): Promise<string> {
  if (config.jwt) return config.jwt;
  if (cachedJwt && cachedJwt.expiresAt > Date.now() + 60_000) {
    return cachedJwt.token;
  }

  const authUrl = makeAuthUrl(config);
  const res = await axios.post<{ token: string }>(authUrl, undefined, {
    timeout: 15_000,
  });
  const token = res.data.token;
  // 30 days minus 1 hour safety margin
  cachedJwt = { token, expiresAt: Date.now() + 29 * 24 * 60 * 60 * 1000 };
  return token;
}

export function makeHttp(config: TxLineConfig): AxiosInstance {
  const baseURL = makeBaseUrl(config);
  return axios.create({
    baseURL,
    timeout: 30_000,
    headers: { "Content-Type": "application/json" },
  });
}
