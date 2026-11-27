package com.godagent.app;

import android.app.Activity;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;

// WebView host for the GODAgent standalone app (bundled in assets/www).
//
// The app is served from a virtual HTTPS origin, https://godagent.local/, whose
// requests are answered from the APK's assets. Unlike file://, this is a secure
// context, so the Cache API (where downloaded Hugging Face models are kept),
// fetch() and WebAssembly streaming all work, and CORS to huggingface.co is a
// normal cross-origin request. No extra libraries are needed.
public class MainActivity extends Activity {
  static final String HOST = "godagent.local";
  private WebView web;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setAllowFileAccess(false);
    web.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    web.setWebViewClient(new AssetClient());
    web.loadUrl("https://" + HOST + "/index.html");
    setContentView(web);
  }

  // Serves https://godagent.local/<path> from assets/www/<path>. The String
  // overload is called by every Android version (newer ones delegate to it).
  class AssetClient extends WebViewClient {
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
      String prefix = "https://" + HOST + "/";
      if (url == null || !url.startsWith(prefix)) return null;
      String path = url.substring(prefix.length());
      int cut = path.indexOf('?'); if (cut >= 0) path = path.substring(0, cut);
      cut = path.indexOf('#'); if (cut >= 0) path = path.substring(0, cut);
      if (path.length() == 0) path = "index.html";
      try {
        InputStream in = getAssets().open("www/" + path);
        return new WebResourceResponse(mime(path), mime(path).startsWith("text/") ? "utf-8" : null, in);
      } catch (Exception e) {
        return new WebResourceResponse("text/plain", "utf-8", new java.io.ByteArrayInputStream(new byte[0]));
      }
    }
  }

  static String mime(String p) {
    p = p.toLowerCase();
    if (p.endsWith(".html")) return "text/html";
    if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
    if (p.endsWith(".css")) return "text/css";
    if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
    if (p.endsWith(".wasm")) return "application/wasm";
    if (p.endsWith(".png")) return "image/png";
    if (p.endsWith(".svg")) return "image/svg+xml";
    if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
    return "application/octet-stream";
  }

  @Override
  public void onBackPressed() {
    if (web != null && web.canGoBack()) web.goBack();
    else super.onBackPressed();
  }
}
