// Core types for the @srivtx/sports-workbench workbench

export type ServiceLevel = 1 | 12; // 1 = 60s delayed, 12 = real-time (World Cup)

export type MarketPeriod = "FT" | "H1" | "H2" | "Q1" | "Q2" | "Q3" | "Q4" | string;

export type GameState =
  | "NS" | "Q1" | "Q1B" | "Q2" | "HT" | "Q3" | "Q3B" | "Q4" | "F"
  | "WO" | "OT" | "OB" | "FO" | "I" | "A" | "C" | "TXCC" | "TXCS"
  | string;

export interface OddsPayload {
  FixtureId: number;
  MessageId: string;
  Ts: number;
  Bookmaker: string;
  BookmakerId: number;
  SuperOddsType: string;
  GameState?: GameState;
  InRunning: boolean;
  MarketParameters?: string;
  MarketPeriod?: MarketPeriod;
  PriceNames: string[];
  Prices: number[];
  Pct: string[]; // strictly 3 decimal places or "NA"
}

export interface OddsStreamEvent {
  id?: string;
  event?: "heartbeat" | string;
  data?: OddsPayload | string;
}

export interface OddsValidation {
  odds: OddsPayload;
  summary: {
    fixtureId: number;
    updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number };
    oddsSubTreeRoot: string;
  };
  subTreeProof: ProofNode[] | null;
  mainTreeProof: ProofNode[] | null;
}

export interface ProofNode {
  hash: string | Uint8Array;
  isRightSibling: boolean;
}

export interface Fixture {
  fixtureId: number;
  competitionId: number;
  startTime: number;
  homeTeam?: { id: number; name: string };
  awayTeam?: { id: number; name: string };
  status?: GameState;
}

export interface ScoreSnapshot {
  fixtureId: number;
  gameState: GameState;
  startTime: number;
  homeScore?: number;
  awayScore?: number;
  clock?: { running: boolean; seconds: number };
  ts: number;
}

export type StrategyName = "momentum" | "meanReversion" | "sharpDetector" | "custom";

export interface Signal {
  id: string; // uuid
  fixtureId: number;
  marketType: string;
  detectedAt: number;
  strategy: StrategyName;
  // market state at time of signal
  beforePct: number;
  afterPct: number;
  deltaPct: number;
  // verified on-chain
  verified: boolean;
  onChainTx?: string; // solana signature
  merkleRoot?: string;
  messageId?: string;
  // outcome (filled after match completes)
  outcome?: "win" | "loss" | "pending";
  finalScore?: { home: number; away: number };
}

export interface BacktestConfig {
  strategy: StrategyName;
  customStrategyCode?: string;
  fromDate: number; // unix ms
  toDate: number; // unix ms
  competitionIds?: number[];
  fixtureIds?: number[];
  startingBankroll: number;
  positionSize: number; // fraction of bankroll (e.g. 0.02 = 2%)
  thresholdPct: number; // e.g. 2.0 = 2% odds shift
  marketType?: string; // e.g. "1X2" or "MatchWinner"
  verifyOnChain: boolean;
  // walk-forward cross-validation
  walkForward?: {
    trainDays: number;
    testDays: number;
    folds: number;
  };
}

export interface Trade {
  signal: Signal;
  entryPct: number;
  exitPct?: number;
  stake: number;
  pnl?: number; // realized P&L in USD
  pnlPct?: number;
  entryTs: number;
  exitTs?: number;
  status: "open" | "closed" | "expired";
}

export interface BacktestReport {
  config: BacktestConfig;
  totalSignals: number;
  totalTrades: number;
  winRate: number; // 0-1
  totalPnl: number; // USD
  totalPnlPct: number; // fraction
  maxDrawdown: number; // fraction
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  avgWinPct: number;
  avgLossPct: number;
  byStrategy: Record<string, { trades: number; pnl: number; winRate: number }>;
  byMarket: Record<string, { trades: number; pnl: number; winRate: number }>;
  trades: Trade[];
  // cryptographic proof summary
  verifiedSignals: number;
  unverifiedSignals: number;
  proofArtifacts: Array<{
    signalId: string;
    messageId: string;
    onChainTx: string;
    merkleRoot: string;
  }>;
}

export interface TxLineConfig {
  // free tier (Service Level 1 or 12) — no payment needed for World Cup
  apiBase?: string; // defaults to "https://txline.txodds.com" (mainnet)
  devnet?: boolean;
  jwt?: string; // guest JWT (auto-acquired if not provided)
  // paid tier (only if you have TxL tokens)
  apiToken?: string; // X-Api-Token
  privateKey?: string; // bs58 or base64
  walletPubkey?: string;
  // anchor
  tokenMint?: string; // default depends on devnet flag
  rpcUrl?: string; // defaults to "https://api.mainnet-beta.solana.com"
  programId?: string; // defaults to mainnet txoracle
}
