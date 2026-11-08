package io.github.mattias.immersiondashboard.titta;

import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.TreeMap;

/**
 * Listening Practice, the listening app: reads its statistics through its read-only content provider (the user allows it once
 * with Android's own dialog) so that Drive.laddaLyssna can upload them as immersion-listening.json. Listening Practice itself
 * sends nothing anywhere. One entry per (date, language, kind) with totals, the same fields as the file its Export makes.
 */
final class Lyssna {
    private Lyssna() {}

    static final String FIL = "immersion-listening.json";
    static final String PERMISSION = "dev.lovkvist.listening.permission.READ_STATISTICS";
    static final String MYNDIGHET = "dev.lovkvist.listening.statistics";

    /** Whether Listening Practice (a version with the statistics provider) is installed. */
    static boolean installerad(Context c) {
        return c.getPackageManager().resolveContentProvider(MYNDIGHET, 0) != null;
    }

    static boolean tillat(Context c) {
        return c.checkSelfPermission(PERMISSION) == PackageManager.PERMISSION_GRANTED;
    }

    /** The rows of the provider as entries, or an IOException with something to show the user. Not on the main thread. */
    static JSONArray las(Context c) throws IOException, JSONException {
        if (!installerad(c)) throw new IOException("Listening Practice is not installed, or is older than 0.11.0.");
        if (!tillat(c)) throw new IOException("Not allowed to read Listening Practice yet.");
        JSONArray ut = new JSONArray();
        try (Cursor k = c.getContentResolver().query(Uri.parse("content://" + MYNDIGHET + "/entries"), null, null, null, null)) {
            if (k == null) throw new IOException("Listening Practice did not answer.");
            int datum = k.getColumnIndexOrThrow("date"), sprak = k.getColumnIndexOrThrow("language"), slag = k.getColumnIndexOrThrow("kind"),
                meningar = k.getColumnIndexOrThrow("sentences"), spelningar = k.getColumnIndexOrThrow("plays"), klar = k.getColumnIndexOrThrow("clear"),
                sek = k.getColumnIndexOrThrow("seconds"), aktiv = k.getColumnIndexOrThrow("active");
            while (k.moveToNext()) {
                ut.put(new JSONObject().put("date", k.getString(datum)).put("language", k.getString(sprak)).put("kind", k.getString(slag))
                    .put("sentences", k.getInt(meningar)).put("plays", k.getInt(spelningar)).put("clear", k.getInt(klar))
                    .put("seconds", k.getDouble(sek)).put("active", k.getDouble(aktiv)));
            }
        } catch (SecurityException e) {
            throw new IOException("Not allowed to read Listening Practice yet.");
        }
        return ut;
    }

    /**
     * The file to upload: the entries of the file that is there, with those just read on top. Rows are totals, so a newer one
     * replaces an older one, except that a row with less listening than the one in the file does not (Listening Practice's data
     * may have been cleared or reinstalled, and what was heard stays heard).
     */
    static JSONObject slaIhop(JSONObject fil, JSONArray nya, String nu, String enhet) throws JSONException {
        TreeMap<String, JSONObject> alla = new TreeMap<>();
        JSONArray har = fil == null ? null : fil.optJSONArray("entries");
        for (int n = 0; har != null && n < har.length(); n++) lagg(alla, har.getJSONObject(n));
        for (int n = 0; n < nya.length(); n++) lagg(alla, nya.getJSONObject(n));
        JSONArray entries = new JSONArray();
        for (JSONObject p : alla.values()) entries.put(p);
        return new JSONObject().put("app", "listening-practice").put("version", 1).put("updated", nu).put("device", enhet).put("entries", entries);
    }

    private static void lagg(TreeMap<String, JSONObject> alla, JSONObject p) {
        String k = p.optString("date") + "|" + p.optString("language") + "|" + p.optString("kind");
        JSONObject gammal = alla.get(k);
        if (gammal == null || p.optDouble("seconds") >= gammal.optDouble("seconds")) alla.put(k, p);
    }
}
