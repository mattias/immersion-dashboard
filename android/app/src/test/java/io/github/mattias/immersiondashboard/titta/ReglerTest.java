package io.github.mattias.immersiondashboard.titta;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class ReglerTest {
    @Test public void readsEachApp() {
        Regler.Info y = Regler.info(Regler.YOUTUBE, "【初見】ゼルダ", "ホロライブ", null, null);
        assertEquals("youtube", y.sajt);
        assertEquals("【初見】ゼルダ", y.id);
        assertEquals("ホロライブ", y.serie);
        Regler.Info t = Regler.info(Regler.TWITCH, "fps_shaka", null, null, null);
        assertEquals("fps_shaka", t.id);
        assertEquals("fps_shaka", t.kanal);
        Regler.Info m = Regler.info(Regler.YTMUSIC, "夜に駆ける", "YOASOBI", "THE BOOK", null);
        assertEquals("ytmusic", m.sajt);
        assertEquals("YOASOBI", m.kanal);
        assertEquals(Boolean.TRUE, Regler.auto(m));
        assertNull(Regler.auto(Regler.info(Regler.YTMUSIC, "Idol", "YOASOBI", null, null)));
        assertNull(Regler.info("com.spotify.music", "x", "y", null, null));
        assertNull(Regler.info(Regler.YOUTUBE, " ", "y", null, null));
    }

    @Test public void japaneseByScriptOrChoice() throws Exception {
        assertTrue(Regler.harJapanska("かな"));
        assertTrue(Regler.harJapanska("漢字"));
        assertTrue(Regler.harJapanska("ｶﾀｶﾅ"));
        assertFalse(Regler.harJapanska("Me at the zoo"));
        JSONObject poster = new JSONObject(), val = new JSONObject();
        JSONObject p = Regler.lagg(poster, "2026-11-03", Regler.info(Regler.TWITCH, "fps_shaka", null, null, null), 10, 10);
        assertNull(Regler.arJapansk(p, val));
        val.put("twitch:fps_shaka", true);
        assertTrue(Regler.arJapansk(p, val));
        // Netflix titles are in the app's language, so they never count by themselves.
        Regler.Info n = Regler.info(Regler.NETFLIX, "エピソード１", "シ﻿ー﻿ズ﻿ン1-1: エピソード１", null, null);
        assertEquals("シーズン1-1: エピソード１", n.serie);
        assertNull(Regler.arJapansk(Regler.lagg(poster, "2026-11-03", n, 10, 10), val));
    }

    @Test public void uploadsOnlyJapaneseInTheWebFormat() throws Exception {
        JSONObject poster = new JSONObject(), val = new JSONObject();
        Regler.Info ja = Regler.info(Regler.YOUTUBE, "ゆっくり実況", "チャンネル", null, null);
        Regler.lagg(poster, "2026-11-03", ja, 100, 60);
        Regler.lagg(poster, "2026-11-03", ja, 20.04, 0);
        Regler.lagg(poster, "2026-11-03", Regler.info(Regler.YOUTUBE, "Me at the zoo", "jawed", null, null), 50, 50);
        // An older copy in Drive with fewer seconds is replaced; one from another day is kept.
        JSONObject fil = new JSONObject().put("entries", new JSONArray()
            .put(new JSONObject().put("date", "2026-11-03").put("site", "youtube").put("id", "ゆっくり実況").put("seconds", 5))
            .put(new JSONObject().put("date", "2026-09-01").put("site", "twitch").put("id", "x").put("seconds", 5)));
        JSONObject ut = Regler.slaIhop(fil, poster, val, "2026-11-03T12:00:00.000Z");
        assertEquals("immersion-phone", ut.getString("app"));
        JSONArray e = ut.getJSONArray("entries");
        assertEquals(2, e.length());
        JSONObject p = e.getJSONObject(1);
        assertEquals("2026-11-03", p.getString("date"));
        assertEquals("チャンネル", p.getString("series"));
        assertEquals(120.0, p.getDouble("seconds"), 0);
        assertEquals(60.0, p.getDouble("active"), 0);
        assertEquals(0, p.getInt("chars"));
        // Marking the channel as not Japanese takes its entries out of Drive.
        val.put("youtube:チャンネル", false);
        assertEquals(1, Regler.slaIhop(ut, poster, val, "x").getJSONArray("entries").length());
    }

    @Test public void keepsUnmarkedEntriesForAMonth() throws Exception {
        JSONObject poster = new JSONObject(), val = new JSONObject();
        Regler.Info en = Regler.info(Regler.TWITCH, "someone", null, null, null), ja = Regler.info(Regler.YOUTUBE, "日本語", "c", null, null);
        Regler.lagg(poster, "2026-10-01", en, 10, 0);
        Regler.lagg(poster, "2026-10-20", en, 10, 0);
        Regler.lagg(poster, "2026-10-01", ja, 10, 0);
        Regler.rensa(poster, val, "2026-11-03");
        assertEquals(2, poster.length());
        assertTrue(poster.has("2026-10-01|youtube|日本語"));
    }
}
