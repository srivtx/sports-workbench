import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as { version: string };

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const S_GRAD = [
  "\x1b[38;2;195;250;100m",
  "\x1b[38;2;188;253;70m",
  "\x1b[38;2;182;255;60m",
  "\x1b[38;2;215;245;40m",
  "\x1b[38;2;240;222;40m",
  "\x1b[38;2;220;200;30m",
];

const W_GRAD = [
  "\x1b[38;2;175;228;252m",
  "\x1b[38;2;145;222;250m",
  "\x1b[38;2;115;222;252m",
  "\x1b[38;2;94;230;255m",
  "\x1b[38;2;120;158;232m",
  "\x1b[38;2;145;125;220m",
];

const WORDMARK = "\x1b[38;2;155;230;40m" + BOLD;
const TAGLINE_LIGHT = "\x1b[38;2;160;160;170m";
const TAGLINE_DIM = "\x1b[38;2;120;120;130m";

// S in ANSI Shadow (7 wide × 6 tall)
const S = [
  "███████╗",
  "██╔════╝",
  "███████╗",
  "╚════██║",
  "███████║",
  "╚══════╝",
];

// W in ANSI Shadow (16 wide × 6 tall)
const W = [
  "██╗    ██╗",
  "██║    ██║",
  "██║ █╗ ██║",
  "██║███╗██║",
  "╚███╔███╔╝",
  " ╚══╝╚══╝",
];

const SW = S.map((s, i) => s + "    " + W[i]);

const BANNER: string[] = [
  ...SW,
  "",
  `sports-workbench  v${pkg.version}`,
  "verifiable sports trading on solana · free tier · 0 TxL",
];

const COLOR_BANNER: string[] = BANNER.map((line, i) => {
  if (i < 6) {
    const sPart = line.slice(0, 7);
    const wPart = line.slice(11);
    return S_GRAD[i] + sPart + RESET + W_GRAD[i] + wPart + RESET;
  }
  if (i === 7) {
    return WORDMARK + line + RESET;
  }
  if (i === 8) return TAGLINE_LIGHT + line + RESET;
  return TAGLINE_DIM + line + RESET;
});

const PLAIN_BANNER = BANNER.slice();

export function printBanner(opts: { plain?: boolean } = {}): void {
  const isTTY = Boolean(process.stdout?.isTTY);
  const useColor = isTTY && !opts.plain && !process.env.NO_COLOR;
  const lines = useColor ? COLOR_BANNER : PLAIN_BANNER;

  for (const line of lines) {
    process.stdout.write(line + "\n");
  }
  process.stdout.write("\n");
}

export function brandLine(): string {
  const isTTY = Boolean(process.stdout?.isTTY);
  const useColor = isTTY && !process.env.NO_COLOR;
  if (!useColor) return "◆ SPORTS ── WORKBENCH";
  return `${S_GRAD[2]}◆${RESET} ${S_GRAD[2]}SPORTS${RESET}${TAGLINE_DIM} ── ${RESET}${W_GRAD[3]}WORKBENCH${RESET}`;
}
