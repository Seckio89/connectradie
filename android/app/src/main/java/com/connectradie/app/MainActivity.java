package com.connectradie.app;

import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
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
}
