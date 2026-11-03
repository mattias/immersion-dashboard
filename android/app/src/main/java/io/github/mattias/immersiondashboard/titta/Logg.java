package io.github.mattias.immersiondashboard.titta;

import android.content.Context;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;

/**
 * What the phone has seen, kept in one JSON file in the app's private storage:
 * poster = seconds per (day, app, video), val = the user's choices per channel or show,
 * senaste = the last raw metadata per app (shown in the settings screen, to see what an app gives),
 * drive = the time and outcome of the last upload.
 */
final class Logg {
    private static Logg inst;
    private final File fil;
    final JSONObject poster, val, senaste, drive;
    private boolean andrad;

    static synchronized Logg av(Context c) {
        if (inst == null) inst = new Logg(new File(c.getFilesDir(), "titta.json"));
        return inst;
    }

    private Logg(File fil) {
        this.fil = fil;
        JSONObject j;
        try (FileInputStream in = new FileInputStream(fil)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
            j = new JSONObject(b.toString("UTF-8"));
        } catch (Exception e) { j = new JSONObject(); }
        poster = del(j, "poster"); val = del(j, "val"); senaste = del(j, "senaste"); drive = del(j, "drive");
    }

    private static JSONObject del(JSONObject j, String namn) {
        JSONObject d = j.optJSONObject(namn);
        if (d == null) {
            d = new JSONObject();
            try { j.put(namn, d); } catch (JSONException ignored) {}
        }
        return d;
    }

    static String idag() { return Regler.datum(Calendar.getInstance()); }

    synchronized void lagg(Regler.Info i, double sek, double aktiv) {
        try { Regler.lagg(poster, idag(), i, sek, aktiv); drive.put("osynkat", true); andrad = true; } catch (JSONException ignored) {}
    }

    synchronized void sattSenaste(String paket, String text) {
        try { if (!text.equals(senaste.optString(paket))) { senaste.put(paket, text); andrad = true; } } catch (JSONException ignored) {}
    }

    /** true = Japanese, false = not, null = let the title decide. */
    synchronized void valj(String nyckel, Boolean ja) {
        if (ja == null) val.remove(nyckel);
        else try { val.put(nyckel, ja.booleanValue()); } catch (JSONException ignored) {}
        try { drive.put("osynkat", true); } catch (JSONException ignored) {}
        andrad = true;
        spara();
    }

    synchronized void sattDrive(String nyckel, Object varde) {
        try { drive.put(nyckel, varde); } catch (JSONException ignored) {}
        andrad = true;
        spara();
    }

    synchronized boolean andrad() { return andrad; }

    synchronized void spara() {
        if (!andrad) return;
        Regler.rensa(poster, val, idag());
        try {
            JSONObject j = new JSONObject().put("poster", poster).put("val", val).put("senaste", senaste).put("drive", drive);
            File tmp = new File(fil.getPath() + ".tmp");
            try (FileOutputStream ut = new FileOutputStream(tmp)) { ut.write(j.toString().getBytes(StandardCharsets.UTF_8)); }
            if (!tmp.renameTo(fil)) throw new IOException("rename");
            andrad = false;
        } catch (JSONException | IOException ignored) {}
    }

    /** A copy to read outside the lock. */
    synchronized JSONObject[] kopia() {
        try { return new JSONObject[] { new JSONObject(poster.toString()), new JSONObject(val.toString()) }; }
        catch (JSONException e) { return new JSONObject[] { new JSONObject(), new JSONObject() }; }
    }
}
