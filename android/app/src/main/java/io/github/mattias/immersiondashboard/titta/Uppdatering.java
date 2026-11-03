package io.github.mattias.immersiondashboard.titta;

import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;

/**
 * Updates of the app itself. The dashboard inside it is the website and is always current, but watching on the phone
 * is part of the APK. Checks GitHub's latest release at most twice a day, tells the user with a notification and in the
 * Watching screen, and downloads and opens the new APK when the user taps Update. Android asks the user to confirm the install.
 */
final class Uppdatering {
    private Uppdatering() {}

    static final String SENASTE = "https://api.github.com/repos/mattias/immersion-dashboard/releases/latest";
    private static final long MELLAN = 12 * 3600_000L;
    private static final String KANAL = "uppdatering";
    static final String VISA = "io.github.mattias.immersiondashboard.UPPDATERA";

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("uppdatering", Context.MODE_PRIVATE); }

    static String version(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; }
        catch (PackageManager.NameNotFoundException e) { return "0"; }
    }

    /** True when the release tag (v1.2.0 or 1.2.0) is a later version than har. */
    static boolean nyare(String tag, String har) {
        String[] a = tag.replaceFirst("^v", "").split("[.-]"), b = har.split("[.-]");
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            int x = tal(a, i), y = tal(b, i);
            if (x != y) return x > y;
        }
        return false;
    }

    private static int tal(String[] d, int i) {
        try { return i < d.length ? Integer.parseInt(d[i]) : 0; } catch (NumberFormatException e) { return 0; }
    }

    /** The APK of a release from GitHub's API answer, or null. */
    static String apk(JSONObject release) {
        JSONArray a = release.optJSONArray("assets");
        for (int i = 0; a != null && i < a.length(); i++) {
            JSONObject f = a.optJSONObject(i);
            if (f != null && f.optString("name").endsWith(".apk")) return f.optString("browser_download_url");
        }
        return null;
    }

    /** The newer version waiting to be installed, as {version, apk url}, or null. */
    static String[] vantar(Context c) {
        SharedPreferences p = prefs(c);
        String v = p.getString("version", null), url = p.getString("apk", null);
        return v != null && url != null && nyare(v, version(c)) ? new String[] { v, url } : null;
    }

    /** Asks GitHub in the background, unless it was asked recently. Runs klar afterwards on that thread when it asked. */
    static void kolla(Context c, Runnable klar) {
        final Context app = c.getApplicationContext();
        SharedPreferences p = prefs(app);
        long nu = System.currentTimeMillis();
        if (nu - p.getLong("kollad", 0) < MELLAN) return;
        p.edit().putLong("kollad", nu).apply();
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                JSONObject r = new JSONObject(hamta(SENASTE));
                String v = r.optString("tag_name").replaceFirst("^v", ""), url = apk(r);
                if (url == null || !nyare(v, version(app))) return;
                // One notification per new version, not one per check.
                boolean ny = !v.equals(p.getString("version", null));
                p.edit().putString("version", v).putString("apk", url).apply();
                if (ny) meddela(app, v);
            } catch (Exception ignored) {
                // No network or GitHub is down: try again next time.
            }
            if (klar != null) klar.run();
        });
    }

    private static String hamta(String url) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        try {
            h.setRequestProperty("Accept", "application/vnd.github+json");
            h.setConnectTimeout(15_000);
            h.setReadTimeout(15_000);
            if (h.getResponseCode() != 200) throw new Exception("GitHub answered " + h.getResponseCode());
            try (InputStream in = h.getInputStream()) {
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
                return b.toString("UTF-8");
            }
        } finally { h.disconnect(); }
    }

    private static void meddela(Context c, String v) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(KANAL, "App updates", NotificationManager.IMPORTANCE_DEFAULT));
        Intent i = new Intent(c, TittaAktivitet.class).setAction(VISA).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, KANAL) : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Immersion Dashboard " + v + " is available")
            .setContentText("Tap to update.")
            .setContentIntent(pi)
            .setAutoCancel(true);
        // Without the notification permission this does nothing; the Watching screen still shows the update.
        try { nm.notify(1, b.build()); } catch (SecurityException ignored) {}
    }

    /** Downloads the APK with Android's download manager. Returns the download id; installera opens it when done. */
    static long ladda(Context c, String v, String url) {
        DownloadManager dm = c.getSystemService(DownloadManager.class);
        DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url))
            .setTitle("Immersion Dashboard " + v)
            .setMimeType("application/vnd.android.package-archive")
            .setDestinationInExternalFilesDir(c, Environment.DIRECTORY_DOWNLOADS, "Immersion-Dashboard-" + v + ".apk")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
        return dm.enqueue(r);
    }

    /** Opens Android's installer for a finished download. False when the download failed. */
    static boolean installera(Context c, long id) {
        DownloadManager dm = c.getSystemService(DownloadManager.class);
        Uri u = dm.getUriForDownloadedFile(id);
        if (u == null) return false;
        c.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(u, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
        return true;
    }
}
