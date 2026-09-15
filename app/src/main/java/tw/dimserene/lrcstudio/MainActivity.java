package tw.dimserene.lrcstudio;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.View;
import android.view.DisplayCutout;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.graphics.Insets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.List;

public final class MainActivity extends Activity {
    private static final String OFFICIAL = "com.google.android.apps.youtube.music";
    private static final String REVANCED = "app.revanced.android.apps.youtube.music";
    private volatile String selectedPackage = REVANCED;
    private String playerName() { return REVANCED.equals(selectedPackage) ? "YouTube Music ReVanced" : "YouTube Music"; }
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;
    private MediaSessionManager manager;
    private volatile MediaController controller;
    private boolean listening = false, resumed = false;
    private volatile String latest = "{}";
    private String exportText = "";
    private volatile long seekPendingUntil = 0;
    private final MediaController.Callback callback = new MediaController.Callback() {
        @Override public void onPlaybackStateChanged(PlaybackState state) { seekPendingUntil = 0; publish(); }
        @Override public void onMetadataChanged(MediaMetadata metadata) { publish(); }
        @Override public void onSessionDestroyed() { disconnect(); refresh(); }
    };
    private final MediaSessionManager.OnActiveSessionsChangedListener sessions = list -> attach(list);
    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (!resumed) return;
            if (!allowed()) disconnect();
            else if (controller == null) refresh();
            publish();
            handler.postDelayed(this, 50);
        }
    };
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        String preference = getPreferences(MODE_PRIVATE).getString("player_package", REVANCED);
        selectedPackage = OFFICIAL.equals(preference) ? OFFICIAL : REVANCED;
        if (saved != null) exportText = saved.getString("export", "");
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        manager = (MediaSessionManager) getSystemService(MEDIA_SESSION_SERVICE);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(16,16,25));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setDomStorageEnabled(false);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"https".equals(uri.getScheme()) || !"app.local".equals(uri.getHost()))
                    return new WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream(new byte[0]));
                String path = uri.getPath();
                if (path == null || !path.matches("/[a-zA-Z0-9._-]+")) return null;
                String name = path.substring(1);
                try {
                    String mime = name.endsWith(".js") ? "application/javascript" : name.endsWith(".css") ? "text/css" : "text/html";
                    return new WebResourceResponse(mime, "UTF-8", getAssets().open(name));
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream(new byte[0]));
                }
            }
        });
        setContentView(web);
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // Keep the camera cutout and keyboard safe, without reserving hidden bars.
                // Transient system bars overlay the editor instead of shifting the lyrics.
                Insets safe = insets.getInsets(WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            }
            DisplayCutout cutout = insets.getDisplayCutout();
            int left = cutout == null ? 0 : cutout.getSafeInsetLeft();
            int top = cutout == null ? 0 : cutout.getSafeInsetTop();
            int right = cutout == null ? 0 : cutout.getSafeInsetRight();
            int bottom = cutout == null ? 0 : cutout.getSafeInsetBottom();
            v.setPadding(Math.max(left, insets.getSystemWindowInsetLeft()),
                Math.max(top, insets.getSystemWindowInsetTop()),
                Math.max(right, insets.getSystemWindowInsetRight()),
                Math.max(bottom, insets.getSystemWindowInsetBottom()));
            return insets.consumeSystemWindowInsets();
        });
        applyImmersiveMode();
        web.loadUrl("https://app.local/index.html");
    }
    @Override protected void onResume() { super.onResume(); applyImmersiveMode(); resumed = true; refresh(); handler.removeCallbacks(ticker); handler.post(ticker); }
    /** Hide both system bars, with edge-swipe access preserved by Android. */
    @SuppressWarnings("deprecation")
    private void applyImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController bars = getWindow().getInsetsController();
            if (bars != null) {
                bars.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                bars.hide(WindowInsets.Type.systemBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
        if (web != null) web.requestApplyInsets();
    }
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersiveMode();
    }
    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        if (web != null) web.post(this::applyImmersiveMode);
    }
    @Override protected void onPause() { resumed = false; handler.removeCallbacks(ticker); super.onPause(); }
    @Override protected void onSaveInstanceState(Bundle out) { out.putString("export", exportText); super.onSaveInstanceState(out); }
    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        disconnect();
        if (listening) manager.removeOnActiveSessionsChangedListener(sessions);
        web.removeJavascriptInterface("Android"); web.destroy(); super.onDestroy();
    }
    private ComponentName component() { return new ComponentName(this, MusicAccessService.class); }
    private boolean allowed() {
        return ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).isNotificationListenerAccessGranted(component());
    }
    private void refresh() {
        if (!allowed()) { disconnect(); return; }
        try {
            if (!listening) { manager.addOnActiveSessionsChangedListener(sessions, component(), handler); listening = true; }
            attach(manager.getActiveSessions(component()));
        } catch (SecurityException e) { disconnect(); listening = false; }
    }
    private void disconnect() { if (controller != null) controller.unregisterCallback(callback); controller = null; seekPendingUntil = 0; }
    private void attach(List<MediaController> list) {
        MediaController chosen = null;
        if (list != null) for (MediaController c : list) {
            if (selectedPackage.equals(c.getPackageName())) {
                if (chosen == null) chosen = c;
                if (c.getPlaybackState() != null && c.getPlaybackState().getState() == PlaybackState.STATE_PLAYING) { chosen = c; break; }
            }
        }
        if (controller != null && chosen != null && controller.getSessionToken().equals(chosen.getSessionToken())) return;
        disconnect(); controller = chosen;
        if (controller != null) controller.registerCallback(callback, handler);
        publish();
    }
    private String snapshotJson() {
        MediaController controller = this.controller;
        JSONObject j = new JSONObject();
        try {
            j.put("playerName", playerName()); j.put("playerPackage", selectedPackage);
            j.put("permission", allowed()); j.put("connected", controller != null);
            if (controller != null) {
                PlaybackState s = controller.getPlaybackState(); MediaMetadata m = controller.getMetadata();
                String title = m == null ? "" : safe(m.getString(MediaMetadata.METADATA_KEY_TITLE));
                String artist = m == null ? "" : safe(m.getString(MediaMetadata.METADATA_KEY_ARTIST));
                String id = m == null ? "" : safe(m.getString(MediaMetadata.METADATA_KEY_MEDIA_ID));
                long duration = m == null ? 0 : m.getLong(MediaMetadata.METADATA_KEY_DURATION);
                j.put("title", title); j.put("artist", artist); j.put("duration", duration);
                j.put("trackKey", controller.getPackageName() + "|" + id + "|" + title + "|" + artist + "|" + duration);
                boolean remote = controller.getPlaybackInfo() != null && controller.getPlaybackInfo().getPlaybackType() == MediaController.PlaybackInfo.PLAYBACK_TYPE_REMOTE;
                j.put("remote", remote);
                if (s != null) {
                    long now = SystemClock.elapsedRealtime(), position = s.getPosition();
                    boolean playing = s.getState() == PlaybackState.STATE_PLAYING;
                    boolean valid = position >= 0 && (playing || s.getState() == PlaybackState.STATE_PAUSED) && (!playing || (s.getLastPositionUpdateTime() > 0 && s.getLastPositionUpdateTime() <= now)) && !remote && now >= seekPendingUntil;
                    if (playing && s.getLastPositionUpdateTime() > 0 && s.getLastPositionUpdateTime() <= now && position >= 0)
                        position += (long) ((now - s.getLastPositionUpdateTime()) * s.getPlaybackSpeed());
                    position = Math.max(0, position); if (duration > 0) position = Math.min(duration, position);
                    j.put("position", position); j.put("valid", valid); j.put("playing", playing);
                    j.put("canSeek", (s.getActions() & PlaybackState.ACTION_SEEK_TO) != 0 && !remote);
                    j.put("canPlay", (s.getActions() & (PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PLAY_PAUSE)) != 0);
                    j.put("canPause", (s.getActions() & (PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE)) != 0);
                }
            }
        } catch (Exception ignored) { }
        return j.toString();
    }
    private void publish() {
        latest = snapshotJson();
        web.evaluateJavascript("window.onPlayer && window.onPlayer(" + latest + ")", null);
    }
    private static String safe(String s) { return s == null ? "" : s; }
    private void message(String s) { web.evaluateJavascript("window.notify && window.notify(" + JSONObject.quote(s) + ")", null); }
    private final class Bridge {
        @JavascriptInterface public String snapshot() { return snapshotJson(); }
        @JavascriptInterface public String loadDraft() { return getPreferences(MODE_PRIVATE).getString("draft", ""); }
        @JavascriptInterface public boolean saveDraft(String json) { if (json.length() > 8000000) return false; getPreferences(MODE_PRIVATE).edit().putString("draft", json).apply(); return true; }
        @JavascriptInterface public void permission() { runOnUiThread(() -> new AlertDialog.Builder(MainActivity.this)
            .setTitle("連接 YouTube Music")
            .setMessage("請在下一頁開啟「拍點 LRC」的通知存取權。Android 將此權限授予整個通知監聽服務；本 App 只使用它取得 YouTube Music 媒體進度，不讀取通知內容，也沒有網路權限。你可隨時在系統設定撤銷。")
            .setNegativeButton("取消", null).setPositiveButton("前往設定", (d,w) -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))).show()); }
        @JavascriptInterface public void choosePlayer() { runOnUiThread(() -> {
            String[] names = {"YouTube Music ReVanced", "YouTube Music 官方版"};
            new AlertDialog.Builder(MainActivity.this)
                .setTitle("選擇音樂播放器")
                .setSingleChoiceItems(names, REVANCED.equals(selectedPackage) ? 0 : 1, (dialog, which) -> {
                    String next = which == 0 ? REVANCED : OFFICIAL;
                    if (!next.equals(selectedPackage)) {
                        disconnect();
                        selectedPackage = next;
                        getPreferences(MODE_PRIVATE).edit().putString("player_package", next).apply();
                        refresh(); publish();
                        message("已選擇 " + playerName() + "，請播放歌曲後重新連結歌詞");
                    }
                    dialog.dismiss();
                }).setNegativeButton("取消", null).show();
        }); }
        @JavascriptInterface public void openMusic() { runOnUiThread(() -> {
            Intent launch = getPackageManager().getLaunchIntentForPackage(selectedPackage);
            if (launch == null) message("找不到 " + playerName() + "，請確認已安裝，或到更多工具切換播放器"); else startActivity(launch);
        }); }
        @JavascriptInterface public void transport(String action, long target) { runOnUiThread(() -> {
            if (!allowed() || controller == null) { message("尚未連接 YouTube Music"); return; }
            PlaybackState s = controller.getPlaybackState(); if (s == null) return;
            try {
                if ("seek".equals(action) && (s.getActions() & PlaybackState.ACTION_SEEK_TO) != 0) {
                    seekPendingUntil = SystemClock.elapsedRealtime() + 1500; publish(); controller.getTransportControls().seekTo(Math.max(0, target));
                } else if ("play".equals(action) && (s.getActions() & (PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PLAY_PAUSE)) != 0) controller.getTransportControls().play();
                else if ("pause".equals(action) && (s.getActions() & (PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE)) != 0) controller.getTransportControls().pause();
                else message("播放器目前不支援這項操作");
            } catch (Exception e) { message("播放器沒有接受操作，請回 YouTube Music 確認"); }
        }); }
        @JavascriptInterface public void importFile() { runOnUiThread(() -> {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
            startActivityForResult(i, 10);
        }); }
        @JavascriptInterface public void exportFile(String name, String text) { runOnUiThread(() -> {
            exportText = text;
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("text/plain").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(i, 11);
        }); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (result != RESULT_OK || data == null || data.getData() == null) return;
        try {
            if (request == 10) {
                try (InputStream in = getContentResolver().openInputStream(data.getData()); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                    if (in == null) throw new Exception();
                    byte[] buffer = new byte[8192]; int n;
                    while ((n = in.read(buffer)) != -1) { if (bytes.size() + n > 2000000) throw new IllegalArgumentException("檔案超過 2 MB"); bytes.write(buffer, 0, n); }
                    String text = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
                    web.evaluateJavascript("window.receiveImport(" + JSONObject.quote(text) + ")", null);
                }
            } else if (request == 11) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    if (out == null) throw new Exception(); out.write(exportText.getBytes(StandardCharsets.UTF_8));
                }
                message("檔案已匯出"); exportText = "";
            }
        } catch (Exception e) { message(request == 10 ? "匯入失敗：請使用 UTF-8 編碼、2 MB 以下的文字檔" : "儲存失敗，草稿仍保留在 App 中"); }
    }
}
