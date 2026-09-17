#!/usr/bin/env bash
#
# Rasterise the app icons from assets/logo/icon.svg and icon-round.svg.
#
# This is the only place in the project that turns vectors into bitmaps, and
# it exists because app icons give no alternative:
#
#   - iOS asset catalogues take PNG only. There is no vector option.
#   - Android's legacy launcher icons (API 24-25, below our minSdk+2) are PNG.
#     From API 26 the adaptive icon in mipmap-anydpi-v26 is used instead, and
#     that is a pure VectorDrawable -- see res/drawable/ic_launcher_foreground.xml.
#
# Everything else in the app draws the mark as a vector at runtime.
#
# Requires rsvg-convert (brew install librsvg).

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert not found. Install it with: brew install librsvg" >&2
  exit 1
fi

SQUARE=assets/logo/icon.svg
ROUND=assets/logo/icon-round.svg
ANDROID_RES=android/app/src/main/res
IOS_ICONS=ios/AthenaPhone/Images.xcassets/AppIcon.appiconset

render() { # svg size out
  rsvg-convert "$1" -w "$2" -h "$2" -o "$3"
}

echo "Android legacy launcher icons (API 24-25 only)"
# mdpi hdpi xhdpi xxhdpi xxxhdpi
for pair in "mdpi 48" "hdpi 72" "xhdpi 96" "xxhdpi 144" "xxxhdpi 192"; do
  set -- $pair
  density=$1 size=$2
  mkdir -p "$ANDROID_RES/mipmap-$density"
  render "$SQUARE" "$size" "$ANDROID_RES/mipmap-$density/ic_launcher.png"
  render "$ROUND"  "$size" "$ANDROID_RES/mipmap-$density/ic_launcher_round.png"
  echo "  mipmap-$density  ${size}px"
done

echo "iOS app icon set"
mkdir -p "$IOS_ICONS"
for size in 40 58 60 80 87 120 180 1024; do
  render "$SQUARE" "$size" "$IOS_ICONS/icon-${size}.png"
  echo "  icon-${size}.png"
done

echo
echo "Done. iOS icons must be opaque with no alpha channel; icon.svg paints a"
echo "full-bleed background rect, so they are."
