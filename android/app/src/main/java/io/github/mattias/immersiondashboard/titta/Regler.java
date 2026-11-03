package io.github.mattias.immersiondashboard.titta;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Rules for watching on the phone, the same as in the Immersion Web extension: which video a media session
 * shows, whether it is Japanese, how seconds are stored per day and what goes up to Google Drive.
 * Pure functions, so they run in the JVM unit tests too.
 */
public final class Regler {
    private Regler() {}

    public static final String YOUTUBE = "com.google.android.youtube", NETFLIX = "com.netflix.mediaclient", TWITCH = "tv.twitch.android.app",
        YTMUSIC = "com.google.android.apps.youtube.music";

    /** What one media session shows right now. kanal is what a choice is remembered for: the channel, or the show on Netflix. */
    public static final class Info {
        public final String sajt, id, serie, titel, kanal;
        Info(String sajt, String id, String serie, String titel, String kanal) {
            this.sajt = sajt; this.id = id; this.serie = serie; this.titel = titel; this.kanal = kanal;
        }
    }

    private static String rent(String s) {
        if (s == null) return null;
        // Netflix puts zero-width no-break spaces inside its texts.
        s = s.replaceAll("[\u200b-\u200d\ufeff]", "").trim();
        return s.isEmpty() ? null : s;
    }

    /** Null for apps that are not tracked, and while the app has no title yet. */
    public static Info info(String paket, String titel, String artist, String album, String mediaId) {
        titel = rent(titel); artist = rent(artist); album = rent(album); mediaId = rent(mediaId);
        if (titel == null) return null;
        switch (paket) {
            // YouTube: title = video, artist = channel.
            case YOUTUBE: return new Info("youtube", mediaId != null ? mediaId : titel, artist, titel, artist);
            // YouTube Music: title = song, artist = artist. Choices are remembered per artist.
            case YTMUSIC: return new Info("ytmusic", mediaId != null ? mediaId : titel, artist, titel, artist);
            // Twitch only gives the channel name, as the title.
            case TWITCH: return new Info("twitch", titel.toLowerCase(Locale.ROOT), titel, artist, titel);
            case NETFLIX: {
                String serie = album != null ? album : artist != null ? artist : titel;
                return new Info("netflix", mediaId != null ? mediaId : titel, serie, titel, serie);
            }
            default: return null;
        }
    }

    // Hiragana, katakana, kanji and half-width katakana.
    private static final Pattern JAPANSKA = Pattern.compile("[\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uff66-\\uff9f]");
    public static boolean harJapanska(String s) {
        return s != null && JAPANSKA.matcher(s).find();
    }

    public static String valNyckel(String sajt, String kanal) {
        return kanal == null ? null : sajt + ":" + kanal;
    }

    /**
     * true = Japanese, null = unknown. Only the user's choice can say false. Netflix titles follow the app's
     * display language, not the audio, so a show on Netflix counts only once the user has marked it.
     */
    public static Boolean auto(Info i) {
        if (i.sajt.equals("netflix")) return null;
        return harJapanska(i.titel) || harJapanska(i.kanal) ? Boolean.TRUE : null;
    }

    public static Boolean arJapansk(JSONObject p, JSONObject val) {
        String k = valNyckel(p.optString("sajt"), p.isNull("kanal") ? null : p.optString("kanal"));
        if (k != null && val.has(k)) return val.optBoolean(k);
        return p.isNull("auto") ? null : p.optBoolean("auto");
    }

    public static String datum(Calendar c) {
        return String.format(Locale.ROOT, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    /** Adds some seconds of watching to the day's entry for the video. */
    public static JSONObject lagg(JSONObject poster, String dag, Info i, double sek, double aktiv) throws JSONException {
        String k = dag + "|" + i.sajt + "|" + i.id;
        JSONObject p = poster.optJSONObject(k);
        if (p == null) {
            p = new JSONObject().put("dag", dag).put("sajt", i.sajt).put("id", i.id).put("sek", 0).put("aktiv", 0);
            poster.put(k, p);
        }
        p.put("sek", p.optDouble("sek") + sek).put("aktiv", p.optDouble("aktiv") + aktiv);
        if (i.serie != null) p.put("serie", i.serie);
        if (i.titel != null) p.put("titel", i.titel);
        if (i.kanal != null) p.put("kanal", i.kanal);
        Boolean a = auto(i);
        p.put("auto", a == null ? JSONObject.NULL : a);
        return p;
    }

    /** Entries not counted as Japanese stay on the phone for a month, so they can still be marked later. */
    public static void rensa(JSONObject poster, JSONObject val, String idag) {
        String grans = forskjut(idag, -30);
        for (Iterator<String> it = poster.keys(); it.hasNext(); ) {
            JSONObject p = poster.optJSONObject(it.next());
            if (p != null && p.optString("dag").compareTo(grans) < 0 && !Boolean.TRUE.equals(arJapansk(p, val))) it.remove();
        }
    }

    static String forskjut(String dag, int dagar) {
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(Integer.parseInt(dag.substring(0, 4)), Integer.parseInt(dag.substring(5, 7)) - 1, Integer.parseInt(dag.substring(8, 10)), 12, 0);
        c.add(Calendar.DAY_OF_MONTH, dagar);
        return datum(c);
    }

    private static final String[] SAJTER = { "youtube", "YouTube", "netflix", "Netflix", "twitch", "Twitch", "ytmusic", "YouTube Music" };
    private static String sajtNamn(String s) {
        for (int i = 0; i < SAJTER.length; i += 2) if (SAJTER[i].equals(s)) return SAJTER[i + 1];
        return s;
    }

    private static double tiondel(double x) { return Math.round(x * 10) / 10.0; }

    /** An entry as Immersion Web writes it, so the dashboard reads both files the same way. */
    static JSONObject ut(JSONObject p) throws JSONException {
        String serie = p.optString("serie", null), titel = p.optString("titel", null);
        return new JSONObject().put("date", p.getString("dag")).put("site", p.getString("sajt")).put("id", p.getString("id"))
            .put("series", serie != null ? serie : titel != null ? titel : sajtNamn(p.getString("sajt")))
            .put("title", titel == null ? JSONObject.NULL : titel).put("episode", JSONObject.NULL)
            .put("seconds", tiondel(p.optDouble("sek"))).put("active", tiondel(p.optDouble("aktiv"))).put("chars", 0);
    }

    /**
     * The file in Drive may hold entries this phone no longer has (older than a month). The phone's Japanese
     * entries replace their own older copies, and entries marked as not Japanese are taken out.
     */
    public static JSONObject slaIhop(JSONObject fil, JSONObject poster, JSONObject val, String nu) throws JSONException {
        JSONObject alla = new JSONObject();
        JSONArray har = fil == null ? null : fil.optJSONArray("entries");
        for (int n = 0; har != null && n < har.length(); n++) {
            JSONObject p = har.getJSONObject(n);
            alla.put(p.optString("date") + "|" + p.optString("site") + "|" + p.optString("id"), p);
        }
        for (Iterator<String> it = poster.keys(); it.hasNext(); ) {
            String k = it.next();
            JSONObject p = poster.getJSONObject(k);
            Boolean ja = arJapansk(p, val);
            if (Boolean.FALSE.equals(ja)) alla.remove(k);
            else if (Boolean.TRUE.equals(ja) && p.optDouble("sek") >= 1) {
                JSONObject ny = ut(p), gammal = alla.optJSONObject(k);
                if (gammal == null || ny.getDouble("seconds") >= gammal.optDouble("seconds")) alla.put(k, ny);
            }
        }
        List<String> nycklar = new ArrayList<>();
        for (Iterator<String> it = alla.keys(); it.hasNext(); ) nycklar.add(it.next());
        Collections.sort(nycklar);
        JSONArray entries = new JSONArray();
        for (String k : nycklar) entries.put(alla.get(k));
        return new JSONObject().put("app", "immersion-phone").put("version", 1).put("updated", nu).put("entries", entries);
    }
}
