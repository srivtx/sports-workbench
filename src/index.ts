// Public package entry point

export { TxLineClient, getGuestJwt } from "./client/txline.js";
export { getGuestJwt as guestJwt, makeBaseUrl, makeAuthUrl, makeHttp } from "./client/auth.js";
export { Backtester } from "./backtest/engine.js";
export { STRATEGIES, momentumStrategy, meanReversionStrategy, sharpDetectorStrategy } from "./backtest/strategies.js";
export { proveOdds, verifyOddsView, fetchOddsValidation, getConnection, getProgramId } from "./solana/verify.js";
export { subscribeAndActivate, subscribeOnChain, activateApiToken, loadWallet } from "./solana/subscribe.js";
export type { SubscribeOptions, SubscribeResult } from "./solana/subscribe.js";
export { TxlineTrader } from "./agent/workbench.js";
export type { AgentConfig, StoredSignal } from "./agent/workbench.js";
export { TxlinePlugin } from "./agent-kit.js";
export type { TxlinePluginConfig } from "./agent-kit.js";
export * from "./types/index.js";
