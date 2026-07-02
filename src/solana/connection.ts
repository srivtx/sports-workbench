// Fallback RPC resolution: try the default Solana public RPC first, fall back
// to Helius (maintained by sports-workbench) and other public RPCs on failure.
// The Helius key is published with the CLI so the tool works out of the box
// for every user, even when the public Solana RPC is unreachable.
import { Connection } from "@solana/web3.js";

const HELIUS_KEY = "c8d30888-d115-47a3-81d5-d9ff54adf341";

const FALLBACKS: Record<"devnet" | "mainnet", string[]> = {
    devnet: [
        "https://api.devnet.solana.com",
        `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
        "https://rpc.ankr.com/solana_devnet",
    ],
    mainnet: [
        "https://api.mainnet-beta.solana.com",
        `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
        "https://rpc.ankr.com/solana",
    ],
};

/**
 * Redact an API key from a URL for safe logging.
 * Replaces `?api-key=...` or `&api-key=...` values with `***`.
 */
export function redactUrl(url: string): string {
    return url.replace(/([?&])(api-key|api_key)=([^&]+)/g, "$1$2=***");
}

/**
 * Resolve a working Solana Connection. Tries the list in order, first healthy
 * wins. If `overrideUrl` is provided, use it directly without a health check.
 *
 * Returns { conn, url, safeUrl, fromFallback } so callers can log which RPC
 * served them without leaking the API key.
 */
export async function getConnectionWithFallback(
    devnet: boolean,
    overrideUrl?: string
): Promise<{
    conn: Connection;
    url: string;
    safeUrl: string;
    fromFallback: boolean;
}> {
    if (overrideUrl) {
        return {
            conn: new Connection(overrideUrl, "confirmed"),
            url: overrideUrl,
            safeUrl: redactUrl(overrideUrl),
            fromFallback: false,
        };
    }
    const list = FALLBACKS[devnet ? "devnet" : "mainnet"];
    const tried: string[] = [];
    for (const url of list) {
        try {
            const conn = new Connection(url, "confirmed");
            await Promise.race([
                conn.getSlot(),
                new Promise<never>((_, rej) =>
                    setTimeout(() => rej(new Error("timeout")), 3000)
                ),
            ]);
            const fromFallback = url !== list[0];
            return { conn, url, safeUrl: redactUrl(url), fromFallback };
        } catch (e: any) {
            tried.push(`${redactUrl(url)} (${e?.message || "unreachable"})`);
        }
    }
    throw new Error(
        `No working ${devnet ? "devnet" : "mainnet"} RPC found.\n` +
            `Tried:\n  ${tried.join("\n  ")}\n` +
            `Pass one via --rpc <url> or set $SOLANA_RPC_URL`
    );
}
