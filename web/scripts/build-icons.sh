#!/usr/bin/env bash
# Rasterises public/favicon.svg into the PNG icons iOS and the web manifest need.
# iOS ignores SVG touch icons and rounds corners itself, so the PNGs are full-bleed
# squares. The maskable icon shrinks the artwork into the 80% safe zone so Android
# launchers can crop it to any shape. Needs rsvg-convert (brew install librsvg).
set -euo pipefail
cd "$(dirname "$0")/.."
src=public/favicon.svg
out=public/icons
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Square corners for every raster icon.
sed 's/ rx="144"//' "$src" > "$tmp/square.svg"
# Maskable: same square, artwork scaled from 1.12 to 0.92.
sed 's/scale(1.12)/scale(0.92)/' "$tmp/square.svg" > "$tmp/maskable.svg"

rsvg-convert -w 180 -h 180 "$tmp/square.svg" -o "$out/apple-touch-icon.png"
rsvg-convert -w 192 -h 192 "$tmp/square.svg" -o "$out/icon-192.png"
rsvg-convert -w 512 -h 512 "$tmp/square.svg" -o "$out/icon-512.png"
rsvg-convert -w 512 -h 512 "$tmp/maskable.svg" -o "$out/maskable-512.png"
ls -l "$out"
