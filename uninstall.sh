#!/usr/bin/env bash
set -euo pipefail

uuid='corner-player@bernardik226.github.io'
data_dir="${XDG_DATA_HOME:-${HOME}/.local/share}"
extension_dir="${data_dir}/gnome-shell/extensions/${uuid}"

if [[ ! -d "$extension_dir" ]]; then
    printf 'Corner Player for Spotify is not installed.\n'
    exit 0
fi

if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions disable "$uuid" >/dev/null 2>&1 || true
fi

if ! command -v gio >/dev/null 2>&1; then
    printf 'Cannot move the extension to trash because gio is unavailable.\n' >&2
    exit 1
fi

gio trash "$extension_dir"
printf 'Corner Player for Spotify was disabled and moved to the trash.\n'
