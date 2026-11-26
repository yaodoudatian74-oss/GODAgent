#!/usr/bin/env bash
# Build the GODAgent Android APK locally. Requires: Node 20+, JDK 17, and the
# Android SDK (ANDROID_HOME set, with build-tools + platform 34). The APK runs
# fully offline (standalone web build bundled inside).
#
# Usage:  scripts/build-apk.sh        # → GODAgent.apk in repo root
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  echo "ERROR: ANDROID_HOME / ANDROID_SDK_ROOT not set. Install the Android SDK first." >&2
  echo "In this authoring environment the SDK host (dl.google.com) is firewalled, so" >&2
  echo "use the GitHub Actions workflow (.github/workflows/android-apk.yml) instead." >&2
  exit 1
fi
SDK="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"

echo "==> Building standalone web bundle"
( cd web && npm ci && VITE_STANDALONE=1 npx vite build --base=./ --outDir dist-standalone )

echo "==> Syncing into the Android project"
( cd web && npx cap sync android )

echo "==> Gradle assembleRelease"
( cd web/android && chmod +x gradlew && ./gradlew --no-daemon assembleRelease || ./gradlew --no-daemon assembleDebug )

BT="$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)"
UNSIGNED=$(find web/android/app/build/outputs/apk -name '*-release-unsigned.apk' | head -1 || true)
DEBUG=$(find web/android/app/build/outputs/apk -name '*-debug.apk' | head -1 || true)
OUT="$PWD/GODAgent.apk"

if [ -n "$UNSIGNED" ]; then
  [ -f ks.jks ] || keytool -genkeypair -v -keystore ks.jks -storepass godagent -keypass godagent \
    -alias godagent -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=GODAgent, O=GODAgent, C=JP"
  "$BT/zipalign" -f 4 "$UNSIGNED" aligned.apk
  "$BT/apksigner" sign --ks ks.jks --ks-pass pass:godagent --key-pass pass:godagent --out "$OUT" aligned.apk
  "$BT/apksigner" verify --verbose "$OUT"
elif [ -n "$DEBUG" ]; then
  cp "$DEBUG" "$OUT"
else
  echo "No APK produced" >&2; exit 1
fi
echo "==> Done: $OUT"
