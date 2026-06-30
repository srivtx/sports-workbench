#!/usr/bin/env bash
# @srivtx/sports-workbench installer — ONE-LINER that:
#   1. Sets up a user-owned npm prefix (no sudo needed)
#   2. Installs the package globally so `sports-workbench` works as a command
#   3. Optionally drops the SKILL.md into Claude/Codex skill directories
#
# Usage:
#   curl -fsSL https://sports-workbench.srivtx.xyz/install.sh | bash
#
# Flags (set as env vars before piping):
#   SKILL=1           also install the SKILL.md into ~/.claude/ and ~/.codex/
#   PREFIX=~/myprefix override the npm prefix (default: ~/.npm-global)
#   NO_INSTALL=1      skip the npm install (just set up PATH/prefix)

set -euo pipefail

PACKAGE="@srivtx/sports-workbench"
PREFIX="${PREFIX:-$HOME/.npm-global}"
BIN_DIR="$PREFIX/bin"
SHELL_NAME="$(basename "${SHELL:-/bin/zsh}")"
RC_FILE="$HOME/.${SHELL_NAME}rc"

# Colors (best-effort, no-op if not a tty)
if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_OFF=$'\033[0m'; C_BOLD=$'\033[1m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_OFF=""; C_BOLD=""
fi
say()  { printf "%b\n" "$*"; }
ok()   { say "${C_OK}  ✓${C_OFF} $*"; }
warn() { say "${C_WARN}  !${C_OFF} $*"; }
err()  { say "${C_ERR}  ✗${C_OFF} $*" >&2; }

say ""
say "${C_BOLD}sports-workbench installer${C_OFF}"
say "─────────────────────────────"

# ── 0. Sanity: node + npm
if ! command -v node >/dev/null 2>&1; then
  err "Node.js is not installed. Install it from https://nodejs.org or via 'brew install node'."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  err "npm is not installed. Install Node.js (which bundles npm)."
  exit 1
fi
NODE_VERSION="$(node -v)"
ok "Node $NODE_VERSION, npm $(npm -v)"

# ── 1. Detect (or set up) a writable npm prefix
NEED_PREFIX_FIX=0
# Try a tiny test: can we install a throwaway package globally?
TEST_DIR="$(mktemp -d)"
if npm install -g --prefix "$TEST_DIR" "npm@latest" --silent >/dev/null 2>&1; then
  rm -rf "$TEST_DIR"
  ok "Global npm install works without changes (no sudo needed)"
else
  rm -rf "$TEST_DIR"
  NEED_PREFIX_FIX=1
fi

CURRENT_PREFIX="$(npm config get prefix 2>/dev/null || echo "")"
if [ "$NEED_PREFIX_FIX" = "1" ] || [ ! -w "$CURRENT_PREFIX" ] || [ "$CURRENT_PREFIX" = "/usr/local" ]; then
  if [ "$NEED_PREFIX_FIX" = "0" ]; then
    warn "Default npm prefix ($CURRENT_PREFIX) is not user-writable"
  fi
  say "  → Setting up user-owned prefix at $PREFIX"
  mkdir -p "$PREFIX"
  npm config set prefix "$PREFIX"
  ok "npm prefix set to $PREFIX"
else
  ok "Using existing npm prefix ($CURRENT_PREFIX)"
  PREFIX="$CURRENT_PREFIX"
fi

# ── 2. Make sure $PREFIX/bin is on PATH (persist in shell rc)
PATH_LINE="export PATH=\"$PREFIX/bin:\$PATH\""
case ":$PATH:" in
  *":$PREFIX/bin:"*) ok "$PREFIX/bin is already on PATH" ;;
  *)
    if [ -w "$RC_FILE" ] || [ ! -f "$RC_FILE" ]; then
      if ! grep -qF "$PREFIX/bin" "$RC_FILE" 2>/dev/null; then
        echo "" >> "$RC_FILE"
        echo "# added by sports-workbench installer" >> "$RC_FILE"
        echo "$PATH_LINE" >> "$RC_FILE"
        ok "Added $PREFIX/bin to PATH in $RC_FILE"
      else
        ok "PATH already configured in $RC_FILE"
      fi
    else
      warn "$RC_FILE is not writable. Add this line manually:"
      say "    $PATH_LINE"
    fi
    export PATH="$PREFIX/bin:$PATH"
    ;;
esac

# ── 3. Install the package
if [ "${NO_INSTALL:-0}" = "1" ]; then
  ok "Skipped npm install (NO_INSTALL=1)"
else
  say "  → Installing $PACKAGE globally..."
  if npm install -g "$PACKAGE" --silent 2>&1 | tail -5; then
    ok "Installed $PACKAGE"
  else
    err "npm install failed. Try: npm install -g $PACKAGE (with NO_INSTALL=1 if you just want the prefix)"
    exit 1
  fi
fi

# ── 4. Verify the binary works
if command -v sports-workbench >/dev/null 2>&1; then
  VERSION="$(sports-workbench --version 2>/dev/null || echo 'unknown')"
  ok "sports-workbench $VERSION is on PATH"
else
  warn "sports-workbench binary not found on PATH. You may need to:"
  say "    source $RC_FILE"
fi

# ── 5. Optionally install the skill
if [ "${SKILL:-0}" = "1" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/SKILL.md" ]; then
    for D in "$HOME/.claude/skills/sports-workbench" "$HOME/.codex/skills/sports-workbench"; do
      mkdir -p "$D"
      cp "$SCRIPT_DIR/SKILL.md" "$D/"
      cp "$SCRIPT_DIR/README.md" "$D/" 2>/dev/null || true
    done
    ok "Installed SKILL.md into Claude and Codex skill directories"
  else
    warn "SKILL=1 requested but no SKILL.md found next to install.sh"
  fi
fi

say ""
say "${C_BOLD}Done!${C_OFF} Try:"
say "    sports-workbench --version"
say "    sports-workbench subscribe --devnet --level 1 --weeks 4"
say "    sports-workbench signal --strategy sharpDetector --threshold 0.5 --devnet"
say ""
say "Or use the zero-install form (no PATH needed):"
say "    npx -p @srivtx/sports-workbench sports-workbench --version"
say ""
say "If 'sports-workbench' is still not found, run:  ${C_BOLD}source $RC_FILE${C_OFF}"
say ""
