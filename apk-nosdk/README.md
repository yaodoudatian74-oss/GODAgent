# No‑SDK APK build

Builds a signed **`GODAgent.apk`** without Google's Android SDK or Gradle, for
environments where Google's SDK hosts (`dl.google.com` / `maven.google.com`)
are firewalled.

It produces a tiny **WebView** APK (no Capacitor, no androidx) that bundles the
standalone GODAgent web app (`assets/www`) and loads it offline from
`file:///android_asset/www/index.html`.

```bash
apk-nosdk/build.sh      # → apk-nosdk/GODAgent.apk  (~100 KB, signed, with icon)
```

## How it works (and what it avoids)

It uses the **official** Android build tools from Debian/Ubuntu plus a dexer and
a framework `android.jar` from Maven Central — so `aapt` compiles a real
`resources.arsc` and the launcher icon works on‑device.

| Need | Google SDK path (blocked here) | This build |
|---|---|---|
| Compile resources + manifest (incl. the launcher icon) | `aapt2` from Google Maven | **`aapt`** from the Ubuntu `aapt` package (`apt-get install aapt`) |
| Align | `zipalign` (SDK) | **`zipalign`** from the Ubuntu package |
| Dex bytecode | `d8` (Google Maven) | `dalvik-dx` from **Maven Central** |
| Compile against the framework | platform `android.jar` (SDK) | `com.google.android:android` from **Maven Central** — the 4.1.1.4 jar ships the framework `resources.arsc`, which `aapt -I` needs |
| Sign | `apksigner` (SDK) | `jarsigner` v1 (JDK); `targetSdkVersion 28` keeps a v1 signature installable on Android 5–14 |

Verified with `aapt dump badging` (shows `application: label='GODAgent'
icon='res/mipmap-*/ic_launcher.png'`) and `androguard` (`get_app_icon`,
`is_valid_APK`, `is_signed_v1`).

## Limitations

- No on‑device install test here (no emulator). Validated with `aapt dump
  badging` + androguard only.
- Self‑signed key (`ks.jks`); regenerating it changes the signature, so uninstall
  any previously installed GODAgent before reinstalling.

## Files

- `AndroidManifest.xml` — plain‑text manifest (aapt compiles it); `android:icon`
  → `@mipmap/ic_launcher`.
- `src/com/godagent/app/MainActivity.java` — the WebView host activity.
- `build.sh` — install aapt/zipalign → fetch dexer + framework jar → build web →
  compile/dex → `aapt package` → `aapt add` dex → zipalign → sign.
- `mkmanifest.py`, `mkarsc.py`, `zipalign.py` — a pure‑Python fallback (binary
  manifest + resources.arsc + align) kept for environments without `aapt`.
