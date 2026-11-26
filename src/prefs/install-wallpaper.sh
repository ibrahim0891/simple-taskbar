#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later

set -euo pipefail

PACK_ID="${1:-}"
DEST_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/backgrounds"
TMP_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if ! command -v git >/dev/null 2>&1; then
    echo "Error: git is required to download wallpapers." >&2
    exit 1
fi

copy_images() {
    local src_dir="$1"
    local dest_dir="$2"
    mkdir -p "$dest_dir"
    find "$src_dir" -not -path '*/.git/*' -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) -print0 | \
        while IFS= read -r -d '' img; do
            cp -f "$img" "$dest_dir/"
        done
}

case "$PACK_ID" in
    mactahoe)
        echo "Cloning MacTahoe wallpapers..."
        git clone --depth=1 --filter=blob:none --sparse --progress \
            https://github.com/vinceliuice/MacTahoe-gtk-theme.git "$TMP_DIR/mactahoe" 2>&1
        git -C "$TMP_DIR/mactahoe" sparse-checkout set wallpaper 2>&1
        echo "Installing to $DEST_ROOT/mactahoe ..."
        copy_images "$TMP_DIR/mactahoe/wallpaper" "$DEST_ROOT/mactahoe"
        ;;
    windows11)
        echo "Cloning Windows 11 wallpapers..."
        git clone --depth=1 --progress \
            https://github.com/viridivn/windows11wallpapers.git "$TMP_DIR/windows11" 2>&1
        echo "Installing to $DEST_ROOT/windows11 ..."
        copy_images "$TMP_DIR/windows11" "$DEST_ROOT/windows11"
        ;;
    windows10)
        echo "Cloning Windows 10 wallpapers..."
        git clone --depth=1 --progress \
            https://github.com/thedoggybrad/Windows-10-22H2-Web-Folder.git "$TMP_DIR/windows10" 2>&1
        echo "Installing to $DEST_ROOT/windows10 ..."
        copy_images "$TMP_DIR/windows10/Web/Wallpaper" "$DEST_ROOT/windows10"
        copy_images "$TMP_DIR/windows10/Web/Screen" "$DEST_ROOT/windows10"
        ;;
    ubuntu)
        echo "Cloning Ubuntu Noble Numbat wallpapers..."
        git clone --depth=1 --progress \
            https://github.com/joaoamaral/NobleNumbatWallpapers.git "$TMP_DIR/ubuntu" 2>&1
        echo "Installing to $DEST_ROOT/ubuntu ..."
        copy_images "$TMP_DIR/ubuntu" "$DEST_ROOT/ubuntu"
        ;;
    *)
        echo "Usage: $0 {mactahoe|windows11|windows10|ubuntu}" >&2
        exit 2
        ;;
esac

echo "Done! Installed $PACK_ID wallpapers to $DEST_ROOT/$PACK_ID."
