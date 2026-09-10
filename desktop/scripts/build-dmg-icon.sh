#!/bin/bash
# Build the DMG volume icon from the Kingfisher project icon.
#
# The mounted disk image in Finder should not look like a generic
# developer disk. macOS reads the .VolumeIcon.icns at the root of
# the mounted image; electron-builder copies whatever file we point
# it at into that position. We use the app icon unchanged, because
# the volume IS the installer for this app, and any other artwork
# would be a step away from the brand.
#
# macOS requires the icon to be at least 512x512 to be used as a
# volume icon, and a full .icns with every size produces a sharper
# result in the Finder sidebar. The script does not depend on
# anything outside macOS stdlib.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ICON="$HERE/../build/icon.png"
ICNS_OUT="$HERE/../build/dmg/icon.icns"
TMP_DIR="$(mktemp -d)"
ICONSET_DIR="$TMP_DIR/kingfisher.iconset"

trap "rm -rf $TMP_DIR" EXIT

mkdir -p "$(dirname "$ICNS_OUT")"
mkdir -p "$ICONSET_DIR"

# iconutil needs an .iconset with the specific filenames it converts.
# We only ship the sizes Finder actually uses for a volume icon.
sizes=(16 32 64 128 256 512 1024)
for size in "${sizes[@]}"; do
  out="$ICONSET_DIR/icon_${size}x${size}.png"
  sips -z "$size" "$size" "$PROJECT_ICON" --out "$out" > /dev/null
done

# The 512x512@2x is a 1024x1024 file that Finder uses on Retina
# sidebar surfaces. Same source PNG, different filename.
cp "$ICONSET_DIR/icon_1024x1024.png" "$ICONSET_DIR/icon_512x512@2x.png"

iconutil -c icns "$ICONSET_DIR" -o "$ICNS_OUT"
echo "wrote $ICNS_OUT"
