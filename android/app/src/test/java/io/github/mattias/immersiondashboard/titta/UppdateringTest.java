package io.github.mattias.immersiondashboard.titta;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

public class UppdateringTest {
    @Test public void comparesVersions() {
        assertTrue(Uppdatering.nyare("v1.1.2", "1.1.1"));
        assertTrue(Uppdatering.nyare("1.2.0", "1.1.9"));
        assertTrue(Uppdatering.nyare("v1.10.0", "1.9.0"));
        assertTrue(Uppdatering.nyare("v2.0", "1.9.9"));
        assertFalse(Uppdatering.nyare("v1.1.1", "1.1.1"));
        assertFalse(Uppdatering.nyare("v1.1.0", "1.1.1"));
        assertFalse(Uppdatering.nyare("v1.1", "1.1.0"));
    }

    @Test public void findsTheApk() throws Exception {
        JSONObject r = new JSONObject("{\"assets\":[{\"name\":\"Immersion-Dashboard-1.2.0-x64-setup.exe\",\"browser_download_url\":\"https://x/a.exe\"},"
            + "{\"name\":\"Immersion-Dashboard-1.2.0.apk\",\"browser_download_url\":\"https://x/a.apk\"}]}");
        assertEquals("https://x/a.apk", Uppdatering.apk(r));
        assertNull(Uppdatering.apk(new JSONObject("{\"assets\":[]}")));
    }
}
