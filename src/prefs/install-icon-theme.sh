#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later

set -euo pipefail

THEME_ID="${1:-}"
DEST_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons"
TMP_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$DEST_DIR"

echo "Target directory: $DEST_DIR"

install_github_theme() {
    local name="$1"
    local repo_url="$2"
    local work_dir="$TMP_DIR/$name"

    if ! command -v git >/dev/null 2>&1; then
        echo "Error: git is required to download $name." >&2
        exit 1
    fi

    echo "Cloning $repo_url ..."
    git clone --depth=1 --progress "$repo_url" "$work_dir" 2>&1
    echo "Running installer into $DEST_DIR ..."
    bash "$work_dir/install.sh" -d "$DEST_DIR" 2>&1
}

install_yaru() {
    if command -v apt >/dev/null 2>&1 && command -v dpkg >/dev/null 2>&1; then
        echo "Downloading official yaru-theme-icon package..."
        cd "$TMP_DIR"
        apt download yaru-theme-icon 2>&1
        echo "Extracting icons..."
        dpkg -x yaru-theme-icon_*.deb "$TMP_DIR/extracted"
        echo "Copying Yaru icon variants to $DEST_DIR ..."
        cp -a "$TMP_DIR/extracted/usr/share/icons"/Yaru* "$DEST_DIR/"
        if command -v gtk-update-icon-cache >/dev/null 2>&1; then
            for dir in "$DEST_DIR"/Yaru*; do
                if [ -f "$dir/index.theme" ]; then
                    gtk-update-icon-cache -f -t "$dir" 2>&1 || true
                fi
            done
        fi
        return
    fi

    echo "apt/dpkg not found; cloning https://github.com/ubuntu/yaru.git ..."
    if ! command -v git >/dev/null 2>&1 || ! command -v meson >/dev/null 2>&1 || ! command -v ninja >/dev/null 2>&1; then
        echo "Error: git, meson, and ninja are required to build Yaru from source." >&2
        exit 1
    fi
    git clone --depth=1 --progress https://github.com/ubuntu/yaru.git "$TMP_DIR/yaru" 2>&1
    meson setup "$TMP_DIR/yaru-build" "$TMP_DIR/yaru" \
        --prefix="${XDG_DATA_HOME:-$HOME/.local}" \
        -Ddefault=false -Dicons=true 2>&1
    ninja -C "$TMP_DIR/yaru-build" install 2>&1
}

case "$THEME_ID" in
    mactahoe)
        install_github_theme "MacTahoe-icon-theme" "https://github.com/vinceliuice/MacTahoe-icon-theme.git"
        ;;
    win11)
        install_github_theme "Win11-icon-theme" "https://github.com/yeyushengfan258/Win11-icon-theme.git"
        ;;
    tela-circle)
        install_github_theme "Tela-circle-icon-theme" "https://github.com/vinceliuice/Tela-circle-icon-theme.git"
        ;;
    yaru)
        install_yaru
        ;;
    *)
        echo "Usage: $0 {mactahoe|win11|tela-circle|yaru}" >&2
        exit 2
        ;;
esac

echo "Done! Installed $THEME_ID in $DEST_DIR."
