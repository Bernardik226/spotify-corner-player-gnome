#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
domain='corner-player@bernardik226.github.io'

translated="$(LC_ALL=pt_BR.UTF-8 LANGUAGE=pt_BR \
    TEXTDOMAINDIR="$repo_dir/locale" \
    gettext --domain="$domain" 'Screen side')"
test "$translated" = 'Lado da tela'

fallback="$(LC_ALL=pt_BR.UTF-8 LANGUAGE=fr \
    TEXTDOMAINDIR="$repo_dir/locale" \
    gettext --domain="$domain" 'Screen side')"
test "$fallback" = 'Screen side'
