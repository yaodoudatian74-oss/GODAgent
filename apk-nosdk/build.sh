#!/usr/bin/env bash
# Build a signed GODAgent APK without Google's Android SDK.
#
# Google's SDK hosts (dl.google.com / maven.google.com) are firewalled in the
# authoring environment, so Gradle can't run. Instead we use the official
# Android build tools packaged by Debian/Ubuntu (aapt, zipalign) plus a dexer
# and a framework android.jar (with resources) from Maven Central. aapt compiles
# a real resources.arsc + binary manifest, so the launcher icon works on-device.
#
# Produces a minimal WebView APK that bundles the standalone GODAgent web app
# (assets/www) and runs fully offline.
#
# Needs: apt (for aapt/zipalign), JDK (javac/jar/jarsigner/keytool), python3, curl.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Ensuring official aapt + zipalign (Debian/Ubuntu packages)"
if ! command -v aapt >/dev/null || ! command -v zipalign >/dev/null; then
  apt-get update -qq && apt-get install -y --no-install-recommends aapt zipalign
fi

echo "==> Fetching dexer + framework android.jar from Maven Central"
fetch() { for a in 1 2 3 4 5; do c=$(curl -s --max-time 120 -o "$2" -w "%{http_code}" "$1"); s=$(stat -c%s "$2" 2>/dev/null||echo 0); [ "$c" = 200 ] && [ "$s" -gt 100000 ] && return 0; sleep 15; done; echo "fetch failed: $1" >&2; return 1; }
[ -f android.jar ] || fetch https://repo1.maven.org/maven2/com/google/android/android/4.1.1.4/android-4.1.1.4.jar android.jar
[ -f dx.jar ] || fetch https://repo1.maven.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar dx.jar

echo "==> Building standalone web bundle"
( cd ../web && VITE_STANDALONE=1 VITE_SINGLEFILE=1 npx vite build --base=./ --outDir dist-artifact >/dev/null )

echo "==> Staging assets + density launcher icons (from the GODAgent logo)"
rm -rf assets res classes build && mkdir -p assets/www/computer-apps classes
# whole single-file build: index.html + ONNX Runtime .wasm (on-device AI) + computer apps + icons
cp -r ../web/dist-artifact/. assets/www/ && rm -f assets/www/sw.js
python3 - <<'PY'
from PIL import Image
im=Image.open('../web/public/icons/icon-512.png').convert('RGBA')
import os
for d,sz in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    os.makedirs(f'res/mipmap-{d}',exist_ok=True)
    im.resize((sz,sz),Image.LANCZOS).save(f'res/mipmap-{d}/ic_launcher.png')
PY

echo "==> Compiling + dexing MainActivity"
javac -source 8 -target 8 -classpath android.jar -d classes src/com/godagent/app/*.java 2>/dev/null
java -cp dx.jar com.android.dx.command.Main --dex --min-sdk-version=21 --output=classes.dex classes/

echo "==> aapt package (compiles resources.arsc + binary manifest + assets)"
aapt package -f -M AndroidManifest.xml -S res -A assets -I android.jar -F base.apk
aapt add base.apk classes.dex >/dev/null

echo "==> zipalign + sign (v1; targetSdk 28 installs on Android 5-14)"
zipalign -f 4 base.apk GODAgent.apk
[ -f ks.jks ] || keytool -genkeypair -keystore ks.jks -storepass godagent -keypass godagent \
  -alias godagent -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=GODAgent, O=GODAgent, C=JP" >/dev/null 2>&1
jarsigner -keystore ks.jks -storepass godagent -keypass godagent \
  -sigalg SHA256withRSA -digestalg SHA-256 GODAgent.apk godagent >/dev/null
jarsigner -verify GODAgent.apk | tail -1
echo "==> Icon check:"; aapt dump badging GODAgent.apk | grep -E "application:|launchable-activity"
echo "==> Done: $(pwd)/GODAgent.apk"
echo "    NOTE: regenerating ks.jks changes the signature — uninstall any prior GODAgent first."
