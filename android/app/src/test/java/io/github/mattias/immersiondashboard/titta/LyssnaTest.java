package io.github.mattias.immersiondashboard.titta;

import static org.junit.Assert.assertEquals;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class LyssnaTest {
    private static JSONObject rad(String datum, String sprak, String slag, int meningar, double sek) throws Exception {
        return new JSONObject().put("date", datum).put("language", sprak).put("kind", slag).put("sentences", meningar)
            .put("plays", 0).put("clear", 0).put("seconds", sek).put("active", sek);
    }

    @Test public void newerTotalsReplaceOlderOnes() throws Exception {
        JSONObject fil = new JSONObject().put("entries", new JSONArray().put(rad("2026-11-07", "ja", "anki", 5, 100)).put(rad("2026-11-08", "ja", "anki", 2, 30)));
        JSONArray nya = new JSONArray().put(rad("2026-11-08", "ja", "anki", 9, 240)).put(rad("2026-11-08", "ja", "song", 1, 20));
        JSONObject ut = Lyssna.slaIhop(fil, nya, "2026-11-08T10:00:00.000Z", "Pixel");
        assertEquals("listening-practice", ut.getString("app"));
        JSONArray e = ut.getJSONArray("entries");
        assertEquals(3, e.length());
        assertEquals("2026-11-07", e.getJSONObject(0).getString("date"));
        assertEquals(240.0, e.getJSONObject(1).getDouble("seconds"), 0.001);
        assertEquals("song", e.getJSONObject(2).getString("kind"));
    }

    @Test public void clearedDataDoesNotLowerWhatWasHeard() throws Exception {
        JSONObject fil = new JSONObject().put("entries", new JSONArray().put(rad("2026-11-08", "ja", "anki", 9, 240)));
        JSONObject ut = Lyssna.slaIhop(fil, new JSONArray().put(rad("2026-11-08", "ja", "anki", 1, 10)), "x", "Pixel");
        assertEquals(240.0, ut.getJSONArray("entries").getJSONObject(0).getDouble("seconds"), 0.001);
    }

    @Test public void worksWithoutAFileYet() throws Exception {
        JSONObject ut = Lyssna.slaIhop(null, new JSONArray().put(rad("2026-11-08", "ja", "video", 3, 60)), "x", "Pixel");
        assertEquals(1, ut.getJSONArray("entries").length());
    }
}
