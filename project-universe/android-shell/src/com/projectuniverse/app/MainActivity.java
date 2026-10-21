package com.projectuniverse.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Locale;

/**
 * Stage 1 Android shell for George Universal Sandbox: hosts the self-contained
 * prototype (assets/index.html) in a WebView. Fully offline; requests no permissions.
 * The Back button is routed to the page first (close panel → leave sim → exit).
 * The opening "Welcome, George" is spoken with the phone's text-to-speech engine.
 */
public class MainActivity extends Activity {
    private static final int SPACE_BLACK = 0xFF03050C;
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady;
    private String pendingSpeech;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(SPACE_BLACK);
        window.setNavigationBarColor(SPACE_BLACK);

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status != TextToSpeech.SUCCESS) return;
                tts.setLanguage(Locale.US);
                tts.setSpeechRate(0.92f);
                ttsReady = true;
                if (pendingSpeech != null) speak(pendingSpeech);
            }
        });

        web = new WebView(this);
        web.setBackgroundColor(SPACE_BLACK);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        // Lets the opening chime play without a tap first.
        settings.setMediaPlaybackRequiresUserGesture(false);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equals(uri.getScheme())) return false;
                // Any outside link opens in the user's browser, never inside the app.
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                return true;
            }
        });
        setContentView(web);
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl("file:///android_asset/index.html");
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
    }

    @Override
    protected void onPause() {
        // Stops rendering and the simulation loop while the app is in the background.
        web.onPause();
        web.pauseTimers();
        super.onPause();
    }

    private void speak(String text) {
        if (!ttsReady) { pendingSpeech = text; return; }
        pendingSpeech = null;
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "welcome");
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        web.destroy();
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("window.PU ? window.PU.handleBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) MainActivity.super.onBackPressed();
            }
        });
    }

    /** Exposed to the page as window.AndroidBridge. */
    private final class Bridge {
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { finish(); }
            });
        }

        @JavascriptInterface
        public void speak(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { MainActivity.this.speak(text); }
            });
        }
    }
}
