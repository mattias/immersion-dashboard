package io.github.mattias.immersiondashboard.titta;

import android.content.Context;

import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Tasks;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

/**
 * Uploads the phone's Japanese watching as immersion-phone.json to the dashboard's hidden app folder in Google Drive,
 * next to immersion-web.json from the browser extension. Same Google Cloud project, Android OAuth client (package + signing SHA-1).
 */
final class Drive {
    private Drive() {}

    static final String FIL = "immersion-phone.json";
    private static final String API = "https://www.googleapis.com";

    static AuthorizationRequest begaran() {
        return AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope("https://www.googleapis.com/auth/drive.appdata"))).build();
    }

    /** A token without asking, or null when the user has to connect in the settings screen first. Not on the main thread. */
    static String token(Context c) throws Exception {
        AuthorizationResult r = Tasks.await(Identity.getAuthorizationClient(c).authorize(begaran()), 30, TimeUnit.SECONDS);
        return r.hasResolution() ? null : r.getAccessToken();
    }

    /** Uploads when something changed since the last upload, or always with tvinga. Returns an error message, or null. */
    static synchronized String ladda(Context c, boolean tvinga) {
        Logg l = Logg.av(c);
        if (!tvinga && !l.drive.optBoolean("osynkat")) return null;
        l.sattDrive("osynkat", false);
        try {
            String t = token(c);
            if (t == null) throw new IOException("Not connected to Google Drive.");
            try { skriv(c, t, l); }
            catch (Obehorig e) {
                // An expired token: drop it and try once more with a new one.
                GoogleAuthUtil.clearToken(c, t);
                t = token(c);
                if (t == null) throw new IOException("Not connected to Google Drive.");
                skriv(c, t, l);
            }
            l.sattDrive("senast", System.currentTimeMillis());
            l.sattDrive("fel", "");
            return null;
        } catch (Exception e) {
            l.sattDrive("osynkat", true);
            String fel = e.getMessage() != null ? e.getMessage() : e.toString();
            l.sattDrive("fel", fel);
            return fel;
        }
    }

    private static void skriv(Context c, String t, Logg l) throws Exception {
        String q = URLEncoder.encode("name = '" + FIL + "'", "UTF-8");
        JSONArray filer = new JSONObject(anrop(t, "GET", API + "/drive/v3/files?spaces=appDataFolder&fields=files(id)&q=" + q, null, null))
            .optJSONArray("files");
        String id = filer != null && filer.length() > 0 ? filer.getJSONObject(0).getString("id") : null;
        JSONObject fil = id == null ? null : new JSONObject(anrop(t, "GET", API + "/drive/v3/files/" + id + "?alt=media", null, null));
        JSONObject[] k = l.kopia();
        String kropp = Regler.slaIhop(fil, k[0], k[1], nu()).toString();
        if (id != null) {
            anrop(t, "PATCH", API + "/upload/drive/v3/files/" + id + "?uploadType=media", "application/json", kropp);
            return;
        }
        String grans = "immersion" + Long.toHexString(System.nanoTime());
        String meta = new JSONObject().put("name", FIL).put("parents", new JSONArray().put("appDataFolder")).toString();
        String body = "--" + grans + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta + "\r\n--" + grans
            + "\r\nContent-Type: application/json\r\n\r\n" + kropp + "\r\n--" + grans + "--";
        anrop(t, "POST", API + "/upload/drive/v3/files?uploadType=multipart", "multipart/related; boundary=" + grans, body);
    }

    private static final class Obehorig extends IOException {
        Obehorig() { super("Google Drive said 401."); }
    }

    private static String anrop(String t, String metod, String url, String typ, String kropp) throws IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        try {
            // HttpURLConnection has no PATCH; Google's APIs take the override header.
            if (metod.equals("PATCH")) { h.setRequestMethod("POST"); h.setRequestProperty("X-HTTP-Method-Override", "PATCH"); }
            else h.setRequestMethod(metod);
            h.setConnectTimeout(20000);
            h.setReadTimeout(30000);
            h.setRequestProperty("Authorization", "Bearer " + t);
            if (kropp != null) {
                h.setDoOutput(true);
                h.setRequestProperty("Content-Type", typ);
                try (OutputStream ut = h.getOutputStream()) { ut.write(kropp.getBytes(StandardCharsets.UTF_8)); }
            }
            int kod = h.getResponseCode();
            if (kod == 401) throw new Obehorig();
            String svar = las(kod < 400 ? h.getInputStream() : h.getErrorStream());
            if (kod >= 400) throw new IOException("Google Drive " + kod + ": " + svar);
            return svar;
        } finally { h.disconnect(); }
    }

    private static String las(InputStream in) throws IOException {
        if (in == null) return "";
        try (InputStream i = in) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = i.read(buf)) > 0; ) b.write(buf, 0, n);
            return b.toString("UTF-8");
        }
    }

    private static String nu() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date());
    }
}
