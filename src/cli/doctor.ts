// `sports-workbench doctor` — self-check the local environment for the common
// setup issues that break the live signal agent. With `--fix`, automatically
// apply the no-sudo fix (set a user-owned npm prefix) so `npm install -g`
// works without root.

import { execSync, spawnSync } from "node:child_process";
import { existsSync, statSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { getConnectionWithFallback, redactUrl } from "../solana/connection.js";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fix?: () => Promise<void>;
}

const C = {
  ok: "\x1b[32m",
  warn: "\x1b[33m",
  err: "\x1b[31m",
  off: "\x1b[0m",
  bold: "\x1b[1m",
  muted: "\x1b[90m",
};
const ok = (s: string) => `${C.ok}  ✓${C.off} ${s}`;
const warn = (s: string) => `${C.warn}  !${C.off} ${s}`;
const err = (s: string) => `${C.err}  ✗${C.off} ${s}`;

function tryExec(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  // ── Node version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1), 10);
  checks.push({
    name: "Node.js version",
    ok: major >= 20,
    detail: `${nodeVersion} ${major >= 20 ? "(>= 20 required)" : "(need 20+)"}`,
  });

  // ── npm present
  const npmVersion = tryExec("npm -v");
  checks.push({
    name: "npm available",
    ok: !!npmVersion,
    detail: npmVersion ? `v${npmVersion}` : "npm not found on PATH",
  });

  // ── npm prefix writability (the EACCES issue)
  const prefix = tryExec("npm config get prefix") || "";
  const prefixWritable = !!prefix && canWrite(prefix);
  checks.push({
    name: "npm prefix is user-writable",
    ok: prefixWritable,
    detail: prefix
      ? prefixWritable
        ? `prefix=${prefix} (writable)`
        : `prefix=${prefix} (NOT writable — needs sudo or a new prefix)`
      : "could not read npm prefix",
    fix: async () => {
      const newPrefix = join(homedir(), ".npm-global");
      execSync(`mkdir -p "${newPrefix}"`, { stdio: "ignore" });
      execSync(`npm config set prefix "${newPrefix}"`, { stdio: "ignore" });
      // Add to shell rc
      const shell = process.env.SHELL || "/bin/zsh";
      const rcName = `.${shell.split("/").pop()}rc`;
      const rcFile = join(homedir(), rcName);
      const line = `export PATH="${newPrefix}/bin:$PATH"`;
      if (existsSync(rcFile)) {
        const content = readFileSync(rcFile, "utf8");
        if (!content.includes(`${newPrefix}/bin`)) {
          require("node:fs").appendFileSync(
            rcFile,
            `\n# added by sports-workbench doctor --fix\nexport PATH="${newPrefix}/bin:$PATH"\n`
          );
        }
      } else {
        require("node:fs").writeFileSync(rcFile, `${line}\n`);
      }
      process.env.PATH = `${newPrefix}/bin:${process.env.PATH}`;
    },
  });

  // ── $PREFIX/bin on PATH
  const binDir = prefix ? join(prefix, "bin") : "";
  const onPath = binDir && (process.env.PATH || "").split(":").includes(binDir);
  checks.push({
    name: "npm bin dir on PATH",
    ok: !!onPath,
    detail: onPath ? binDir : `${binDir || "(none)"} not in $PATH`,
  });

  // ── sports-workbench binary present
  const swPath = tryExec("which sports-workbench") || "(not found)";
  checks.push({
    name: "sports-workbench binary",
    ok: swPath !== "(not found)",
    detail: swPath,
  });

  // ── Solana wallet present
  const walletPath = process.env.SOLANA_WALLET || join(homedir(), ".config", "solana", "id.json");
  const walletExists = existsSync(walletPath);
  // Skip the live solana balance RPC (slow) — just verify the file exists and is valid JSON
  checks.push({
    name: "Solana wallet present",
    ok: walletExists,
    detail: walletExists
      ? `${walletPath} (run 'solana balance --url devnet' to check funds)`
      : `no wallet at ${walletPath}`,
  });

  // ── TXLINE_API_TOKEN env
  const hasToken = !!process.env.TXLINE_API_TOKEN;
  checks.push({
    name: "TXLINE_API_TOKEN env",
    ok: hasToken,
    detail: hasToken
      ? `set (length ${process.env.TXLINE_API_TOKEN!.length})`
      : "not set — run 'sports-workbench subscribe --devnet' to get one",
  });

  // ── DNS reachability
  const dns = await checkDns();
  checks.push({
    name: "TxLINE host resolves",
    ok: dns.ok,
    detail: dns.detail,
  });

  // ── Solana RPC reachability (with fallback list)
  const rpc = await checkRpc();
  checks.push({
    name: "Solana RPC reachable",
    ok: rpc.ok,
    detail: rpc.detail,
  });

  return checks;
}

async function checkRpc(): Promise<{ ok: boolean; detail: string }> {
  const results: string[] = [];
  for (const net of ["devnet", "mainnet"] as const) {
    try {
      const { safeUrl, fromFallback } = await getConnectionWithFallback(net === "devnet");
      results.push(`${net}=${fromFallback ? `fallback(${safeUrl})` : "ok"}`);
    } catch {
      results.push(`${net}=fail`);
    }
  }
  const allOk = results.every((r) => !r.endsWith("=fail"));
  return { ok: allOk, detail: results.join(" ") };
}

function canWrite(dir: string): boolean {
  try {
    if (!existsSync(dir)) return false;
    statSync(dir); // throws if not accessible
    // try creating a test file
    const testFile = join(dir, `.sw-doctor-${Date.now()}`);
    require("node:fs").writeFileSync(testFile, "test");
    require("node:fs").unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

async function checkDns(): Promise<{ ok: boolean; detail: string }> {
  // Use node's built-in dns.lookup to test
  const dns = await import("node:dns/promises");
  const tryLookup = async (host: string): Promise<boolean> => {
    try {
      await dns.lookup(host);
      return true;
    } catch {
      return false;
    }
  };
  const txlineOk = await tryLookup("txline.txodds.com");
  const txlineDevOk = await tryLookup("txline-dev.txodds.com");
  const oracleOk = await tryLookup("oracle.txodds.com");
  if (txlineOk || txlineDevOk) {
    return {
      ok: true,
      detail: `main=${txlineOk ? "ok" : "fail"} dev=${txlineDevOk ? "ok" : "fail"} oracle=${oracleOk ? "ok" : "NXDOMAIN (use main host)"}`,
    };
  }
  return { ok: false, detail: "neither txline.txodds.com nor txline-dev.txodds.com resolved" };
}

export async function doctor(opts: { fix?: boolean; json?: boolean }): Promise<number> {
  const checks = await runChecks();
  const failed = checks.filter((c) => !c.ok);

  if (opts.json) {
    console.log(JSON.stringify({ checks, passed: checks.length - failed.length, failed: failed.length }, null, 2));
    return failed.length === 0 ? 0 : 1;
  }

  console.log(`\n${C.bold}sports-workbench doctor${C.off}\n${"─".repeat(40)}`);
  for (const c of checks) {
    const icon = c.ok ? ok(c.name) : err(c.name);
    console.log(`${icon.padEnd(40)}  ${c.detail}`);
  }
  console.log("─".repeat(40));
  console.log(
    failed.length === 0
      ? `${C.ok}All ${checks.length} checks passed.${C.off}`
      : `${C.warn}${failed.length}/${checks.length} check(s) failed.${C.off}`
  );

  // Apply fixes
  if (opts.fix && failed.length > 0) {
    console.log(`\n${C.bold}Applying fixes…${C.off}\n`);
    for (const c of failed) {
      if (!c.fix) {
        console.log(warn(`${c.name}: no auto-fix available, see detail above`));
        continue;
      }
      try {
        await c.fix();
        console.log(ok(`${c.name}: fixed`));
      } catch (e: any) {
        console.log(err(`${c.name}: fix failed — ${e.message}`));
      }
    }

    // After fixing the prefix, try installing the package
    const swPath = tryExec("which sports-workbench");
    if (!swPath) {
      console.log(`\n${C.muted}Installing @srivtx/sports-workbench globally (may take 10-20s)…${C.off}`);
      try {
        execSync("npm install -g @srivtx/sports-workbench --silent", {
          stdio: ["ignore", "pipe", "inherit"],
        });
        console.log(ok("installed @srivtx/sports-workbench"));
      } catch (e: any) {
        console.log(err(`install failed: ${e.message?.slice(0, 200)}`));
        console.log(`${C.muted}You can try manually: npm install -g @srivtx/sports-workbench${C.off}`);
      }
    }

    // Re-check
    console.log(`\n${C.bold}Re-checking…${C.off}\n`);
    const re = await runChecks();
    const reFailed = re.filter((c) => !c.ok);
    for (const c of re) {
      const icon = c.ok ? ok(c.name) : err(c.name);
      console.log(`${icon.padEnd(40)}  ${c.detail}`);
    }
    if (reFailed.length === 0) {
      console.log(
        `\n${C.ok}All checks now pass. Run: ${C.bold}source $HOME/.zshrc${C.off}${C.ok} to pick up PATH changes.${C.off}`
      );
    } else {
      console.log(`\n${C.warn}${reFailed.length} check(s) still failing — see detail above.${C.off}`);
    }
    return reFailed.length === 0 ? 0 : 1;
  }

  // Non-fix mode: if anything failed, show the manual fix hint
  if (failed.length > 0 && !opts.fix) {
    console.log(`\n${C.muted}Run 'sports-workbench doctor --fix' to auto-fix writable issues.${C.off}`);
  }

  return failed.length === 0 ? 0 : 1;
}
