package com.lbp.balancesheetsquare;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final String APP_PREFIX = "https://appassets.androidplatform.net/assets/www/";
    private static final int REQUEST_SAVE_PDF = 4102;
    private static final int MAX_PDF_BYTES = 12 * 1024 * 1024;

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private byte[] pendingPdf;
    private String pendingFilename;
    private boolean showingOfflinePage;

    @Override
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(11, 31, 58));
        getWindow().setNavigationBarColor(Color.rgb(244, 247, 251));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(244, 247, 251));
        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(0, insets.getSystemWindowInsetTop(), 0, insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setBlockNetworkLoads(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setWebViewClient(new AppWebViewClient());
        webView.loadUrl(APP_URL);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                this::handleBack
            );
        }
    }

    private void handleBack() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            finish();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    private boolean openExternal(Uri uri) {
        if (uri != null && uri.toString().startsWith(APP_PREFIX)) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception error) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void showOfflinePage() {
        if (showingOfflinePage) return;
        showingOfflinePage = true;
        try (InputStream stream = getAssets().open("offline.html");
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = stream.read(buffer)) != -1) output.write(buffer, 0, read);
            String html = output.toString(StandardCharsets.UTF_8.name());
            webView.loadDataWithBaseURL(APP_URL, html, "text/html", "UTF-8", null);
        } catch (IOException error) {
            Toast.makeText(this, R.string.offline_unavailable, Toast.LENGTH_LONG).show();
        }
    }

    private byte[] decodePdf(String base64) {
        try {
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            if (data.length == 0 || data.length > MAX_PDF_BYTES) return null;
            return data;
        } catch (IllegalArgumentException error) {
            return null;
        }
    }

    private String safeFilename(String filename) {
        String cleaned = filename == null ? "balance-sheet-square.pdf" : filename.replaceAll("[^a-zA-Z0-9._-]", "-");
        if (!cleaned.toLowerCase().endsWith(".pdf")) cleaned += ".pdf";
        return cleaned;
    }

    private class AppWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return openExternal(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return openExternal(Uri.parse(url));
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (url != null && url.startsWith(APP_PREFIX)) showingOfflinePage = false;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showOfflinePage();
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void sharePdf(String base64, String filename) {
            byte[] data = decodePdf(base64);
            if (data == null) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, R.string.pdf_failed, Toast.LENGTH_LONG).show());
                return;
            }

            try {
                File directory = new File(getCacheDir(), "reports");
                if (!directory.exists() && !directory.mkdirs()) throw new IOException("Cannot create report directory");
                File file = new File(directory, safeFilename(filename));
                try (FileOutputStream output = new FileOutputStream(file)) {
                    output.write(data);
                }

                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", file);
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("application/pdf");
                intent.putExtra(Intent.EXTRA_STREAM, uri);
                intent.setClipData(ClipData.newUri(getContentResolver(), file.getName(), uri));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(intent, getString(R.string.share_report))));
            } catch (IOException error) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, R.string.pdf_failed, Toast.LENGTH_LONG).show());
            }
        }

        @JavascriptInterface
        public void savePdf(String base64, String filename) {
            byte[] data = decodePdf(base64);
            if (data == null) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, R.string.pdf_failed, Toast.LENGTH_LONG).show());
                return;
            }
            pendingPdf = data;
            pendingFilename = safeFilename(filename);
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/pdf");
                intent.putExtra(Intent.EXTRA_TITLE, pendingFilename);
                startActivityForResult(intent, REQUEST_SAVE_PDF);
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_SAVE_PDF) return;
        if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingPdf != null) {
            try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                if (output == null) throw new IOException("No output stream");
                output.write(pendingPdf);
                Toast.makeText(this, R.string.pdf_saved, Toast.LENGTH_SHORT).show();
            } catch (IOException error) {
                Toast.makeText(this, R.string.pdf_failed, Toast.LENGTH_LONG).show();
            }
        }
        pendingPdf = null;
        pendingFilename = null;
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
