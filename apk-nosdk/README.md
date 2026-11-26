# No‑SDK APK build

Builds a signed **`GODAgent.apk`** without the Android SDK or Gradle, for
environments where Google's SDK hosts (`dl.google.com` / `maven.google.com`)
are unreachable.

It produces a tiny **WebView** APK (no Capacitor, no androidx) that bundles the
standalone GODAgent web app (`assets/www`) and loads it offline from
`file:///android_asset/www/index.html`.

```bash
apk-nosdk/build.sh      # → apk-nosdk/GODAgent.apk  (~80 KB, signed)
```

## How it works (and what it avoids)

| Need | Normal path (blocked here) | This build |
|---|---|---|
| Compile resources + manifest | `aapt2` (Google Maven only) | Hand‑written **binary** `AndroidManifest.xml` (`mkmanifest.py`), **no** `resources.arsc` (label is a literal string, default icon) |
| Dex bytecode | `d8` (Google Maven only) | `dalvik-dx` from **Maven Central** |
| Compile against the SDK | platform `android.jar` (SDK) | `com.google.android:android` stub from **Maven Central** (API‑15 symbols — enough for `WebView`/`Activity`) |
| Sign | `apksigner` (SDK) | `jarsigner` v1 (JDK); `targetSdkVersion 28` keeps a v1 signature installable on Android 5–14 |

The hand‑written manifest is validated with `androguard` (`AXMLPrinter` round‑trip
and `APK.is_valid_APK()`), which confirms the package, label, min/target SDK and
the `MAIN`/`LAUNCHER` activity parse correctly.

## Limitations

- No on‑device install test here (no emulator/SDK). Structure is validated with
  androguard only.
- Self‑signed debug‑style key.
- This is the fallback for a firewalled environment. With the Android SDK, prefer
  the Capacitor build (`scripts/build-apk.sh`) or the CI workflow
  (`.github/workflows/android-apk.yml`), which produce a v2‑signed APK with the
  official toolchain.

## Files

- `mkmanifest.py` — binary AXML generator for the minimal manifest.
- `src/com/godagent/app/MainActivity.java` — the WebView host activity.
- `build.sh` — fetch toolchain → build web → compile/dex → manifest → zip → sign.
