#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# Baresync publish script
# Publishes npm packages and crates.io crates in dependency order.
# Skips packages whose version is already published.
# ──────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}▸${NC} $*"; }
warn()  { echo -e "${YELLOW}▸${NC} $*"; }
error() { echo -e "${RED}✖${NC} $*"; exit 1; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BARESYNC_STAGE_DIR=""

cleanup_stage_dir() {
  if [[ -n "$BARESYNC_STAGE_DIR" && -d "$BARESYNC_STAGE_DIR" ]]; then
    rm -rf "$BARESYNC_STAGE_DIR"
  fi
}

trap cleanup_stage_dir EXIT

# ── Helpers ─────────────────────────────────────────────────

npm_version_exists() {
  local pkg="$1" version="$2"
  npm view "$pkg" version 2>/dev/null | grep -q "^${version}$"
}

crates_version_exists() {
  local crate="$1" version="$2"
  cargo search "$crate" 2>/dev/null | grep -q "^${crate} = \"${version}\""
}

# ── Pre-flight checks ──────────────────────────────────────

info "Checking prerequisites..."

if ! command -v npm &>/dev/null; then
  error "npm not found. Install Node.js first."
fi

if ! command -v cargo &>/dev/null; then
  error "cargo not found. Install Rust first."
fi

if ! command -v bun &>/dev/null; then
  error "bun not found. Install bun first."
fi

# Check clean git state
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  error "Working tree is not clean. Commit or stash changes first."
fi

info "Prerequisites OK."

# ── Read versions from source ───────────────────────────────

BARESYNC_VERSION=$(grep '"version"' "$REPO_ROOT/packages/baresync/package.json" | head -1 | sed 's/.*": "\(.*\)".*/\1/')
CREATE_VERSION=$(grep '"version"' "$REPO_ROOT/packages/create-baresync/package.json" | head -1 | sed 's/.*": "\(.*\)".*/\1/')
CORE_VERSION=$(grep '^version' "$REPO_ROOT/crates/baresync-core/Cargo.toml" | head -1 | sed 's/version = "\(.*\)"/\1/')
PLUGIN_VERSION=$(grep '^version' "$REPO_ROOT/crates/tauri-plugin-baresync/Cargo.toml" | head -1 | sed 's/version = "\(.*\)"/\1/')

# ── Check what needs publishing ─────────────────────────────

PUBLISH_CORE=true
PUBLISH_PLUGIN=true
PUBLISH_NPM=true
PUBLISH_CREATE=true

if crates_version_exists "baresync-core" "$CORE_VERSION"; then
  warn "baresync-core@$CORE_VERSION already published — skipping."
  PUBLISH_CORE=false
fi

if crates_version_exists "tauri-plugin-baresync" "$PLUGIN_VERSION"; then
  warn "tauri-plugin-baresync@$PLUGIN_VERSION already published — skipping."
  PUBLISH_PLUGIN=false
fi

if npm_version_exists "baresync" "$BARESYNC_VERSION"; then
  warn "baresync@$BARESYNC_VERSION already published — skipping."
  PUBLISH_NPM=false
fi

if npm_version_exists "create-baresync" "$CREATE_VERSION"; then
  warn "create-baresync@$CREATE_VERSION already published — skipping."
  PUBLISH_CREATE=false
fi

if [[ "$PUBLISH_CORE" == false && "$PUBLISH_PLUGIN" == false && "$PUBLISH_NPM" == false && "$PUBLISH_CREATE" == false ]]; then
  info "Nothing to publish. All versions already exist."
  exit 0
fi

# Check registry logins only for registries we need to publish to
if [[ "$PUBLISH_NPM" == true || "$PUBLISH_CREATE" == true ]]; then
  npm whoami &>/dev/null || error "Not logged in to npm. Run 'npm login' first."
fi

if [[ "$PUBLISH_CORE" == true || "$PUBLISH_PLUGIN" == true ]]; then
  if [[ ! -f "$HOME/.cargo/credentials.toml" ]] && [[ -z "${CARGO_REGISTRY_TOKEN:-}" ]]; then
    error "Not logged in to crates.io. Run 'cargo login' first."
  fi
fi

info "Versions:"
info "  baresync:              $BARESYNC_VERSION $([ "$PUBLISH_NPM" == true ] && echo '→ publish' || echo '→ skip')"
info "  create-baresync:       $CREATE_VERSION $([ "$PUBLISH_CREATE" == true ] && echo '→ publish' || echo '→ skip')"
info "  baresync-core:         $CORE_VERSION $([ "$PUBLISH_CORE" == true ] && echo '→ publish' || echo '→ skip')"
info "  tauri-plugin-baresync: $PLUGIN_VERSION $([ "$PUBLISH_PLUGIN" == true ] && echo '→ publish' || echo '→ skip')"

echo ""

# ── Confirm ─────────────────────────────────────────────────

read -rp "Proceed? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  info "Aborted."
  exit 0
fi

# ── Run checks ──────────────────────────────────────────────

info "Running ultracite check..."
cd "$REPO_ROOT"
bun x ultracite check

info "Running typecheck..."
bun run typecheck

info "Checks passed."

# ── Publish crates.io (baresync-core first) ─────────────────

if [[ "$PUBLISH_CORE" == true ]]; then
  info "Publishing baresync-core $CORE_VERSION to crates.io..."
  cd "$REPO_ROOT/crates/baresync-core"
  cargo publish
  info "baresync-core published."

  # Only wait if plugin also needs publishing
  if [[ "$PUBLISH_PLUGIN" == true ]]; then
    info "Waiting 30s for crates.io index to update..."
    sleep 30
  fi
fi

if [[ "$PUBLISH_PLUGIN" == true ]]; then
  info "Publishing tauri-plugin-baresync $PLUGIN_VERSION to crates.io..."
  cd "$REPO_ROOT/crates/tauri-plugin-baresync"
  cargo publish --no-verify
  info "tauri-plugin-baresync published."
fi

# ── Publish npm (baresync first) ────────────────────────────

if [[ "$PUBLISH_NPM" == true ]]; then
  info "Building baresync..."
  cd "$REPO_ROOT/packages/baresync"
  bun run build

  info "Staging baresync package..."
  BARESYNC_STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/baresync-publish-XXXXXX")"
  cp -R "$REPO_ROOT/packages/baresync/." "$BARESYNC_STAGE_DIR/"
  rm -rf "$BARESYNC_STAGE_DIR/skills/baresync"
  mkdir -p "$BARESYNC_STAGE_DIR/skills"
  cp -R "$REPO_ROOT/skills/baresync" "$BARESYNC_STAGE_DIR/skills/"

  info "Publishing baresync $BARESYNC_VERSION to npm..."
  (
    cd "$BARESYNC_STAGE_DIR"
    npm publish --ignore-scripts
  )
  info "baresync published."
fi

if [[ "$PUBLISH_CREATE" == true ]]; then
  info "Building create-baresync..."
  cd "$REPO_ROOT/packages/create-baresync"
  bun run build

  info "Publishing create-baresync $CREATE_VERSION to npm..."
  npm publish
  info "create-baresync published."
fi

# ── Done ────────────────────────────────────────────────────

echo ""
info "Done."
