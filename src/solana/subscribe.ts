// Full on-chain subscribe + off-chain API token activation flow.
// This is the only way to use the "free tier" from a public network —
// the docs' claim of a "guest stream" at oracle.txodds.com does not work
// in public DNS, so we use the main API at txline.txodds.com with a real
// X-Api-Token obtained via the proper on-chain subscription flow.

import * as anchor from "@coral-xyz/anchor";
import {
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    ComputeBudgetProgram,
} from "@solana/web3.js";
import {
    getAssociatedTokenAddressSync,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    createSyncNativeInstruction,
    getAccount,
    getMint,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import axios from "axios";
import type { TxLineConfig } from "../types/index.js";
import { getGuestJwt, makeBaseUrl } from "../client/auth.js";
import { getConnectionWithFallback, redactUrl } from "./connection.js";

const DEFAULT_PROGRAM_ID = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const DEFAULT_DEVNET_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const DEFAULT_TOKEN_MINT = new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"); // mainnet
const DEFAULT_DEVNET_TOKEN_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"); // devnet

export interface SubscribeOptions {
    serviceLevelId: 1 | 12; // 1 = 60s delayed, 12 = real-time World Cup (both FREE)
    weeks: number; // must be multiple of 4
    leagues?: number[]; // empty = standard bundle
    wallet?: Keypair; // defaults to ~/.config/solana/id.json
    rpcUrl?: string;
}

export interface SubscribeResult {
    txSig: string;
    apiToken: string;
    expiresAt: number;
    programId: PublicKey;
    tokenMint: PublicKey;
    wallet: PublicKey;
    serviceLevelId: number;
    weeks: number;
}

/**
 * Load a Solana keypair from a file. Default location is the Solana CLI
 * standard: ~/.config/solana/id.json
 */
export async function loadWallet(path?: string): Promise<Keypair> {
    const candidates = [
        path,
        process.env.SOLANA_KEYPAIR_PATH,
        process.env.SOLANA_WALLET,
        join(homedir(), ".config", "solana", "id.json"),
    ].filter((p): p is string => typeof p === "string" && p.length > 0);
    for (const p of candidates) {
        if (existsSync(p)) {
            const data = JSON.parse(await readFile(p, "utf8")) as number[];
            return Keypair.fromSecretKey(Uint8Array.from(data));
        }
    }
    throw new Error(
        `No Solana keypair found. Looked in: ${candidates.join(", ")}. ` +
            `Pass one via --wallet /path/to/id.json, $SOLANA_KEYPAIR_PATH, or $SOLANA_WALLET.`
    );
}

function getProgramId(config: TxLineConfig): PublicKey {
    if (config.programId) return new PublicKey(config.programId);
    return config.devnet ? DEFAULT_DEVNET_PROGRAM_ID : DEFAULT_PROGRAM_ID;
}

function getTokenMint(config: TxLineConfig): PublicKey {
    if (config.tokenMint) return new PublicKey(config.tokenMint);
    return config.devnet ? DEFAULT_DEVNET_TOKEN_MINT : DEFAULT_TOKEN_MINT;
}

async function getConnection(
    config: TxLineConfig,
    overrideRpc?: string
): Promise<anchor.web3.Connection> {
    const { conn, safeUrl, fromFallback } = await getConnectionWithFallback(
        !!config.devnet,
        overrideRpc ?? config.rpcUrl
    );
    if (fromFallback) {
        console.error(
            `[sports-workbench] default RPC unreachable, using fallback: ${safeUrl}`
        );
    }
    return conn;
}

/**
 * Step 1: Subscribe on-chain to the free tier.
 * Calls the `subscribe` instruction on the txoracle program.
 * For Service Level 1 (60s-delayed odds) and Service Level 12 (real-time
 * World Cup odds) the cost is 0 TxL tokens — only SOL for gas.
 *
 * Returns the transaction signature.
 */
export async function subscribeOnChain(
    config: TxLineConfig,
    opts: SubscribeOptions
): Promise<{ txSig: string; programId: PublicKey; tokenMint: PublicKey }> {
    const wallet = opts.wallet ?? (await loadWallet());
    const connection = await getConnection(config, opts.rpcUrl);
    const programId = getProgramId(config);
    const tokenMint = getTokenMint(config);

    // Derive PDAs
    const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pricing_matrix")],
        programId
    );
    const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_treasury_v2")],
        programId
    );
    const tokenTreasuryVault = getAssociatedTokenAddressSync(
        tokenMint,
        tokenTreasuryPda,
        true,
        TOKEN_2022_PROGRAM_ID
    );
    const userTokenAccount = getAssociatedTokenAddressSync(
        tokenMint,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
    );

    // Build a minimal Anchor-style instruction manually using the IDL.
    // (We avoid the full Anchor workspace to keep the dependency surface small.)
    // Discriminator for `subscribe` instruction: first 8 bytes of sha256("global:subscribe")
    // Verified against the on-chain devnet program IDL (anchor idl fetch).
    const discriminator = Buffer.from([
        0xfe, 0x1c, 0xbf, 0x8a, 0x9c, 0xb3, 0xb7, 0x35,
    ]);

    // Args: service_level_id (u16 LE) + weeks (u8)
    const args = Buffer.alloc(2 + 1);
    args.writeUInt16LE(opts.serviceLevelId, 0);
    args.writeUInt8(opts.weeks, 2);
    const data = Buffer.concat([discriminator, args]);

    const keys = [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // user
        { pubkey: pricingMatrixPda, isSigner: false, isWritable: false }, // pricing_matrix
        { pubkey: tokenMint, isSigner: false, isWritable: false }, // token_mint
        { pubkey: userTokenAccount, isSigner: false, isWritable: true }, // user_token_account
        { pubkey: tokenTreasuryVault, isSigner: false, isWritable: true }, // token_treasury_vault
        { pubkey: tokenTreasuryPda, isSigner: false, isWritable: false }, // token_treasury_pda
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associated_token_program
    ];

    const ix = new Transaction();

    // Ensure the user's Token-2022 ATA exists BEFORE the subscribe instruction
    // (the program will fail if user_token_account is not initialized)
    const ataInfo = await connection.getAccountInfo(userTokenAccount);
    if (!ataInfo) {
        ix.add(
            createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                userTokenAccount,
                wallet.publicKey,
                tokenMint,
                TOKEN_2022_PROGRAM_ID
            )
        );
    }

    ix.add({
        programId,
        keys,
        data,
    });

    // Bump compute budget for the CPI-heavy subscribe
    ix.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));

    ix.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    ix.feePayer = wallet.publicKey;
    ix.sign({ ...wallet, publicKey: wallet.publicKey, secretKey: wallet.secretKey });

    const sig = await connection.sendRawTransaction(ix.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(sig, "confirmed");
    return { txSig: sig, programId, tokenMint };
}

/**
 * Step 2: Activate the API token by signing the activation message.
 * The signature proves the wallet owns the subscription.
 *
 * Retries 3x on 5xx (server-side blips), fails fast on 4xx (real client errors).
 * Returns a long-lived X-Api-Token (30 days).
 */
export async function activateApiToken(
    config: TxLineConfig,
    txSig: string,
    wallet: Keypair,
    leagues: number[] = []
): Promise<{ apiToken: string; expiresAt: number }> {
    const jwt = await getGuestJwt(config);
    // makeBaseUrl already includes /api; we only want /api/token/activate
    // relative to the host root, so strip the trailing /api
    const base = makeBaseUrl(config).replace(/\/api$/, "");
    const message = new TextEncoder().encode(
        `${txSig}:${leagues.join(",")}:${jwt}`
    );
    const sigBytes = nacl.sign.detached(message, wallet.secretKey);
    const walletSignature = Buffer.from(sigBytes).toString("base64");

    const url = `${base}/api/token/activate`;
    let res: any;
    let lastErr: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            res = await axios.post(
                url,
                { txSig, walletSignature, leagues },
                {
                    headers: { Authorization: `Bearer ${jwt}` },
                    timeout: 30_000,
                }
            );
            break;
        } catch (e: any) {
            lastErr = e;
            const status = e?.response?.status;
            const body = e?.response?.data;
            if (status && status < 500) {
                // 4xx — server rejected our request, no point retrying
                throw new Error(
                    `Activation rejected (HTTP ${status}): ${
                        typeof body === "string" ? body : JSON.stringify(body)
                    }`
                );
            }
            if (attempt < 3) {
                const wait = attempt * 2;
                console.error(
                    `[sports-workbench] activation HTTP ${status ?? "ERR"}, retrying in ${wait}s (attempt ${attempt}/3)...`
                );
                await new Promise((r) => setTimeout(r, wait * 1000));
            }
        }
    }
    if (!res) {
        const status = lastErr?.response?.status;
        const body = lastErr?.response?.data;
        throw new Error(
            `Activation failed after 3 attempts (HTTP ${status ?? "ERR"}): ${
                typeof body === "string" ? body : JSON.stringify(body)
            }`
        );
    }
    const apiToken = (res.data as any).token ?? (res.data as any);
    // The token is usually a long string; we don't know its exact TTL
    // but the docs say 30 days. Refresh before expiry.
    const expiresAt =
        (res.data as any).expiresAt ?? Date.now() + 30 * 24 * 60 * 60 * 1000;
    return { apiToken, expiresAt };
}

/**
 * Convenience: do the full subscribe + activate flow end-to-end.
 * Returns the API token ready to use with the main API.
 */
export async function subscribeAndActivate(
    config: TxLineConfig,
    opts: SubscribeOptions
): Promise<SubscribeResult> {
    const wallet = opts.wallet ?? (await loadWallet());
    const { txSig, programId, tokenMint } = await subscribeOnChain(config, {
        ...opts,
        wallet,
    });
    const { apiToken, expiresAt } = await activateApiToken(
        config,
        txSig,
        wallet,
        opts.leagues ?? []
    );
    return {
        txSig,
        apiToken,
        expiresAt,
        programId,
        tokenMint,
        wallet: wallet.publicKey,
        serviceLevelId: opts.serviceLevelId,
        weeks: opts.weeks,
    };
}
