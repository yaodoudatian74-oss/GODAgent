#!/usr/bin/env bash
# Build a signed GODAgent APK WITHOUT the Android SDK.
#
# Why: the authoring environment can't reach Google's Android SDK hosts
# (dl.google.com / maven.google.com are firewalled), so Gradle + aapt2 are
# unavailable. This builds a minimal WebView APK using only pieces reachable
# from Maven Central (a dexer + an android.jar stub) plus a hand-written binary
# AndroidManifest.xml. The whole GODAgent standalone web app is bundled in
# assets/www and runs fully offline.
#
# Needs: JDK (javac, jar, jarsigner, keytool), python3, curl, and the built
# standalone web bundle at ../web/dist-artifact/ (run the single-file build
# first — see below). Validated here with androguard; not test-installed
# (no emulator in this environment).
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Fetching toolchain from Maven Central (retries for rate limits)"
fetch() { # url out
  for a in 1 2 3 4 5; do
    code=$(curl -s --max-time 120 -o "$2" -w "%{http_code}" "$1")
    sz=$(stat -c%s "$2" 2>/dev/null || echo 0)
    [ "$code" = "200" ] && [ "$sz" -gt 100000 ] && return 0
    echo "   retry $a ($code, $sz bytes)"; sleep 15
  done; echo "failed to fetch $1" >&2; return 1
}
[ -f android.jar ] || fetch https://repo1.maven.org/maven2/com/google/android/android/4.1.1.4/android-4.1.1.4.jar android.jar
[ -f dx.jar ] || fetch https://repo1.maven.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar dx.jar

echo "==> Building the standalone web bundle"
( cd ../web && VITE_STANDALONE=1 VITE_SINGLEFILE=1 npx vite build --outDir dist-artifact >/dev/null )

echo "==> Staging assets + launcher icon"
rm -rf assets classes && mkdir -p assets/www/computer-apps classes res/mipmap
cp ../web/dist-artifact/index.html assets/www/index.html
cp ../web/dist-artifact/computer-apps/* assets/www/computer-apps/
cp ../web/public/icons/icon-192.png res/mipmap/ic_launcher.png

echo "==> Compiling + dexing MainActivity"
javac -source 8 -target 8 -classpath android.jar -d classes src/com/godagent/app/MainActivity.java 2>/dev/null
java -cp dx.jar com.android.dx.command.Main --dex --min-sdk-version=21 --output=classes.dex classes/

echo "==> Generating binary AndroidManifest.xml + resources.arsc (icon)"
python3 mkmanifest.py AndroidManifest.xml
python3 mkarsc.py resources.arsc

echo "==> Assembling APK (arsc + icon stored uncompressed)"
python3 - <<'PY'
import zipfile, os
z = zipfile.ZipFile('GODAgent.apk', 'w', zipfile.ZIP_DEFLATED)
z.write('AndroidManifest.xml')
z.writestr(zipfile.ZipInfo('resources.arsc'), open('resources.arsc','rb').read(), compress_type=zipfile.ZIP_STORED)
z.write('classes.dex')
zi = zipfile.ZipInfo('res/mipmap/ic_launcher.png'); zi.compress_type = zipfile.ZIP_STORED
z.writestr(zi, open('res/mipmap/ic_launcher.png','rb').read())
for r,_,fs in os.walk('assets'):
    for f in fs: p=os.path.join(r,f); z.write(p, p.replace(os.sep,'/'))
z.close()
PY

echo "==> Signing (v1; targetSdk 28 so v1 installs on Android 5-14)"
[ -f ks.jks ] || keytool -genkeypair -keystore ks.jks -storepass godagent -keypass godagent \
  -alias godagent -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=GODAgent, O=GODAgent, C=JP" >/dev/null 2>&1
jarsigner -keystore ks.jks -storepass godagent -keypass godagent \
  -sigalg SHA256withRSA -digestalg SHA-256 GODAgent.apk godagent >/dev/null
jarsigner -verify GODAgent.apk | tail -1
echo "==> Done: $(pwd)/GODAgent.apk"
