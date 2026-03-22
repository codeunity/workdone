#!/usr/bin/env sh

set -eu

REPO="${WORKDONE_REPO:-codeunity/workdone}"
VERSION="${WORKDONE_VERSION:-}"
INSTALL_ROOT="${WORKDONE_INSTALL_ROOT:-$HOME/.workdone}"
BIN_DIR="$INSTALL_ROOT/bin"
BIN_NAME="workdone"
ASSET_NAME="workdone-darwin-arm64"
CHECKSUM_NAME="$ASSET_NAME.sha256"

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Install workdone for macOS Apple Silicon.

Environment overrides:
  WORKDONE_VERSION       Install a specific release tag, for example v0.1.3
  WORKDONE_REPO          Override the GitHub repo, for example owner/workdone
  WORKDONE_INSTALL_ROOT  Override the install root, defaults to ~/.workdone

Optional arguments:
  --version <tag>        Install a specific release tag
  --repo <owner/name>    Override the GitHub repo
  --install-root <path>  Override the install root
  --help                 Show this message
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      [ "$#" -ge 2 ] || fail "--version requires a value"
      VERSION="$2"
      shift 2
      ;;
    --repo)
      [ "$#" -ge 2 ] || fail "--repo requires a value"
      REPO="$2"
      shift 2
      ;;
    --install-root)
      [ "$#" -ge 2 ] || fail "--install-root requires a value"
      INSTALL_ROOT="$2"
      BIN_DIR="$INSTALL_ROOT/bin"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

OS_NAME="$(uname -s)"
ARCH_NAME="$(uname -m)"

[ "$OS_NAME" = "Darwin" ] || fail "this installer supports macOS only"
case "$ARCH_NAME" in
  arm64|aarch64) ;;
  *)
    fail "this installer currently supports macOS Apple Silicon only"
    ;;
esac

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

need_command curl
need_command shasum
need_command mktemp
need_command chmod
need_command mv
need_command awk
need_command mkdir
need_command grep

normalize_tag() {
  case "$1" in
    v*) printf '%s' "$1" ;;
    *) printf 'v%s' "$1" ;;
  esac
}

TAG=""
DOWNLOAD_BASE="https://github.com/$REPO/releases/latest/download"
LEGACY_ASSET_NAME=""
LEGACY_CHECKSUM_NAME=""

if [ -n "$VERSION" ]; then
  TAG="$(normalize_tag "$VERSION")"
  DOWNLOAD_BASE="https://github.com/$REPO/releases/download/$TAG"
  LEGACY_ASSET_NAME="workdone-$TAG-darwin-arm64"
  LEGACY_CHECKSUM_NAME="$LEGACY_ASSET_NAME.sha256"
fi

TEMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT INT TERM

download_to() {
  url="$1"
  destination="$2"
  curl -fsSL "$url" -o "$destination"
}

download_with_fallback() {
  primary_name="$1"
  fallback_name="$2"
  destination="$3"

  if download_to "$DOWNLOAD_BASE/$primary_name" "$destination"; then
    printf '%s' "$primary_name"
    return 0
  fi

  [ -n "$fallback_name" ] || return 1
  rm -f "$destination"

  if download_to "$DOWNLOAD_BASE/$fallback_name" "$destination"; then
    printf '%s' "$fallback_name"
    return 0
  fi

  return 1
}

log "Installing workdone into $INSTALL_ROOT"

DOWNLOAD_ASSET_NAME="$ASSET_NAME"
DOWNLOAD_CHECKSUM_NAME="$CHECKSUM_NAME"
BINARY_PATH="$TEMP_DIR/$ASSET_NAME"
CHECKSUM_PATH="$TEMP_DIR/$CHECKSUM_NAME"

DOWNLOAD_ASSET_NAME="$(download_with_fallback "$ASSET_NAME" "$LEGACY_ASSET_NAME" "$BINARY_PATH")" || \
  fail "failed to download release asset from $DOWNLOAD_BASE"

DOWNLOAD_CHECKSUM_NAME="$(download_with_fallback "$CHECKSUM_NAME" "$LEGACY_CHECKSUM_NAME" "$CHECKSUM_PATH")" || \
  fail "failed to download checksum from $DOWNLOAD_BASE"

EXPECTED_SHA="$(awk 'NR == 1 { print $1 }' "$CHECKSUM_PATH")"
[ -n "$EXPECTED_SHA" ] || fail "checksum file was empty"

ACTUAL_SHA="$(shasum -a 256 "$BINARY_PATH" | awk '{ print $1 }')"
[ "$EXPECTED_SHA" = "$ACTUAL_SHA" ] || fail "checksum verification failed"

mkdir -p "$BIN_DIR"

TARGET_PATH="$BIN_DIR/$BIN_NAME"
PREVIOUS_VERSION=""
if [ -x "$TARGET_PATH" ]; then
  PREVIOUS_VERSION="$("$TARGET_PATH" --version 2>/dev/null || true)"
fi

chmod +x "$BINARY_PATH"
mv "$BINARY_PATH" "$TARGET_PATH"

PROFILE_UPDATED="no"
PATH_READY="no"

case ":$PATH:" in
  *:"$BIN_DIR":*)
    PATH_READY="yes"
    ;;
esac

ensure_profile_entry() {
  profile_path="$1"
  entry="$2"

  mkdir -p "$(dirname "$profile_path")"
  if [ -f "$profile_path" ] && grep -F "$entry" "$profile_path" >/dev/null 2>&1; then
    return 0
  fi

  {
    printf '\n# Added by workdone installer\n'
    printf '%s\n' "$entry"
  } >> "$profile_path"
  PROFILE_UPDATED="yes"
}

SHELL_NAME="${SHELL##*/}"
case "$SHELL_NAME" in
  zsh)
    ensure_profile_entry "$HOME/.zprofile" "export PATH=\"$BIN_DIR:\$PATH\""
    ;;
  bash)
    ensure_profile_entry "$HOME/.bash_profile" "export PATH=\"$BIN_DIR:\$PATH\""
    ;;
  fish)
    ensure_profile_entry "$HOME/.config/fish/conf.d/workdone.fish" "fish_add_path \"$BIN_DIR\""
    ;;
  *)
    ensure_profile_entry "$HOME/.profile" "export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac

INSTALLED_VERSION="$("$TARGET_PATH" --version 2>/dev/null || true)"
[ -n "$INSTALLED_VERSION" ] || fail "installed binary did not return a version"

log "Installed $INSTALLED_VERSION at $TARGET_PATH"

if [ -n "$PREVIOUS_VERSION" ]; then
  log "Replaced previous install: $PREVIOUS_VERSION"
fi

if [ "$PROFILE_UPDATED" = "yes" ]; then
  log "Updated your shell startup configuration"
fi

if [ "$PATH_READY" = "yes" ]; then
  log "PATH already includes $BIN_DIR"
else
  log "Added $BIN_DIR to your shell startup configuration"
  if [ "$PROFILE_UPDATED" = "yes" ]; then
    log "Open a new terminal session, or source your shell profile, before running workdone by name."
  else
    log "Restart your terminal session if workdone is not yet on PATH."
  fi
fi
