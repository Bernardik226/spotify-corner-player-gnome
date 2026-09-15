#!/usr/bin/env bash
set -euo pipefail

uuid='corner-player@bernardik226.github.io'
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
data_dir="${XDG_DATA_HOME:-${HOME}/.local/share}"
extension_dir="${data_dir}/gnome-shell/extensions/${uuid}"

for required_command in glib-compile-schemas gnome-extensions install; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        printf 'Missing required command: %s\n' "$required_command" >&2
        exit 1
    fi
done

mkdir -p \
    "$extension_dir/locale/pt_BR/LC_MESSAGES" \
    "$extension_dir/schemas"
install -m 0644 \
    "$project_dir/extension.js" \
    "$project_dir/metadata.json" \
    "$project_dir/mpris.js" \
    "$project_dir/playerState.js" \
    "$project_dir/stylesheet.css" \
    "$extension_dir/"
install -m 0644 \
    "$project_dir/schemas/org.gnome.shell.extensions.spotify-corner-player.gschema.xml" \
    "$extension_dir/schemas/"
install -m 0644 \
    "$project_dir/locale/pt_BR/LC_MESSAGES/corner-player@bernardik226.github.io.mo" \
    "$extension_dir/locale/pt_BR/LC_MESSAGES/"

glib-compile-schemas "$extension_dir/schemas"

if gnome-extensions enable "$uuid"; then
    printf 'Corner Player for Spotify installed and enabled.\n'
else
    printf 'Corner Player for Spotify installed. GNOME will enable it after the next login.\n'
fi

printf 'Log out and back in once to load new or updated extension code.\n'
