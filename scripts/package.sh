#!/bin/bash
# Builds distributable archives.
#  1. SocialMediaDesignAutomation-1.0.0.zip : unsigned bundle + install scripts (dev / internal use)
#  2. Optional signed .zxp when ZXPSignCmd and a certificate are available:
#       ZXPSignCmd -selfSignedCert US NY "Your Org" "Your Name" "password" cert.p12
#       ZXPSignCmd -sign dist/stage SocialMediaDesignAutomation.zxp cert.p12 "password" -tsa http://timestamp.digicert.com
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
rm -rf dist && mkdir -p dist/stage
cp -R CSXS client host dist/stage/
cp .debug dist/stage/ 2>/dev/null || true
(cd dist && zip -qr SocialMediaDesignAutomation-1.0.0.zip stage scripts ../README.md 2>/dev/null || true)
(cd "$ROOT" && zip -qr dist/SocialMediaDesignAutomation-1.0.0.zip CSXS client host scripts docs README.md .debug)
echo "Created dist/SocialMediaDesignAutomation-1.0.0.zip"
