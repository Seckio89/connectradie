package com.connectradie.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        // 1. Kill overscroll glow and horizontal scrollbar
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setVerticalScrollBarEnabled(true);

        // 2. Force the viewport to device width (prevents content from expanding)
        WebSettings settings = webView.getSettings();
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(false);
        settings.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.TEXT_AUTOSIZING);

        // 3. Inject CSS on every page load to prevent horizontal overflow.
        //    IMPORTANT: Do NOT set overflow-x on html/body — Android WebView
        //    treats it as overflow:hidden (both axes), killing vertical scroll.
        //    Only constrain #root and use max-width to prevent horizontal blowout.
        //
        //    NOTE: this custom WebViewClient replaces Capacitor's default
        //    BridgeWebViewClient, which is why we must re-implement
        //    shouldOverrideUrlLoading below — otherwise tel:/mailto:/sms:/geo:
        //    links fall through to the WebView and fail with
        //    net::ERR_UNKNOWN_URL_SCHEME instead of opening the native app.
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(
                    "(function() {" +
                    "  var s = document.createElement('style');" +
                    "  s.textContent = '" +
                    "    html, body { " +
                    "      max-width: 100vw !important; " +
                    "      width: 100% !important; " +
                    "    } " +
                    "    #root { " +
                    "      overflow-x: hidden !important; " +
                    "      max-width: 100vw !important; " +
                    "      width: 100% !important; " +
                    "    } " +
                    "    * { max-width: 100vw !important; } " +
                    "  ';" +
                    "  document.head.appendChild(s);" +
                    "})();", null);
            }

            // API 24+: hand non-http(s) schemes to the OS (dialer, email, SMS, maps…)
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleExternalScheme(view, request.getUrl().toString());
            }

            // API 23 fallback (deprecated signature, still called on older devices)
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternalScheme(view, url);
            }
        });

        // 4. Block horizontal scroll gestures entirely
        webView.setOnTouchListener(new View.OnTouchListener() {
            private float startX;
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                if (event.getAction() == MotionEvent.ACTION_DOWN) {
                    startX = event.getX();
                } else if (event.getAction() == MotionEvent.ACTION_MOVE) {
                    // If user tries to scroll horizontally, reset scroll to 0
                    if (v.getScrollX() != 0) {
                        v.scrollTo(0, v.getScrollY());
                    }
                }
                return false; // let the WebView still handle vertical scroll
            }
        });
    }

    /**
     * Keep http(s) navigation inside the WebView (so the SPA works), but hand
     * every other scheme — tel:, mailto:, sms:, geo:, whatsapp:, intent:, etc. —
     * to the OS via an ACTION_VIEW intent so the phone dialer / email / maps app
     * opens instead of the WebView failing with ERR_UNKNOWN_URL_SCHEME.
     */
    private boolean handleExternalScheme(WebView view, String url) {
        if (url == null) return false;
        if (url.startsWith("http://") || url.startsWith("https://")) {
            return false; // let the WebView load it normally (in-app navigation)
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            view.getContext().startActivity(intent);
        } catch (Exception e) {
            // No app can handle this scheme — swallow so the WebView doesn't
            // navigate to it and show an error page.
        }
        return true;
    }

    /**
     * Android back button / back swipe: navigate the WebView's history (i.e. go
     * to the previous in-app page) when there is history to go back to, and only
     * fall back to the default behaviour (leaving the app) at the root.
     */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
