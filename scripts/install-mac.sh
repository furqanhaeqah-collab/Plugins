#!/bin/bash
# Installs the panel for the current user (macOS) and enables unsigned CEP panels.
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.smda.illustrator"

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/CSXS" "$SRC/client" "$SRC/host" "$DEST/"
[ -f "$SRC/.debug" ] && cp "$SRC/.debug" "$DEST/"

for v in 9 10 11 12 13; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

echo "Installed to: $DEST"
echo "Restart Illustrator, then open Window > Extensions > Social Media Automation."
