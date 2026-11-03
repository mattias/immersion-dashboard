package io.github.mattias.immersiondashboard.titta;

import android.content.ComponentName;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.service.notification.NotificationListenerService;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Counts time while YouTube, YouTube Music, Netflix or Twitch plays on the phone. Notification access is only what lets the app
 * see other apps' media sessions; no notifications are read. Active = the screen is on, otherwise passive.
 */
public class TittaTjanst extends NotificationListenerService {
    static final Set<String> APPAR = new HashSet<>(Arrays.asList(Regler.YOUTUBE, Regler.YTMUSIC, Regler.NETFLIX, Regler.TWITCH));
    private static final long TICK = 10_000, MAX_STEG = 30_000, UPPLADDNING = 5 * 60_000, MIN_MELLAN = 60_000;

    private static final class Spel {
        final MediaController c;
        MediaController.Callback cb;
        Regler.Info info;
        long fran; // When the current stretch of playing started, 0 while not playing.
        Spel(MediaController c) { this.c = c; }
    }

    private final Handler h = new Handler(Looper.getMainLooper());
    private final Map<MediaSession.Token, Spel> spel = new HashMap<>();
    private final ExecutorService bakgrund = Executors.newSingleThreadExecutor();
    private MediaSessionManager msm;
    private PowerManager power;
    private boolean spelade;
    private long senastUpp;
    private final Runnable tick = this::rakna;
    private final MediaSessionManager.OnActiveSessionsChangedListener lyssnare = this::sessioner;

    @Override public void onListenerConnected() {
        msm = getSystemService(MediaSessionManager.class);
        power = getSystemService(PowerManager.class);
        ComponentName jag = new ComponentName(this, TittaTjanst.class);
        msm.addOnActiveSessionsChangedListener(lyssnare, jag, h);
        sessioner(msm.getActiveSessions(jag));
    }

    @Override public void onListenerDisconnected() {
        rakna();
        if (msm != null) msm.removeOnActiveSessionsChangedListener(lyssnare);
        for (Spel s : spel.values()) s.c.unregisterCallback(s.cb);
        spel.clear();
        h.removeCallbacks(tick);
        Logg.av(this).spara();
        ladda();
    }

    private void sessioner(List<MediaController> lista) {
        rakna();
        Set<MediaSession.Token> nu = new HashSet<>();
        for (MediaController c : lista == null ? new ArrayList<MediaController>() : lista) {
            if (!APPAR.contains(c.getPackageName())) continue;
            nu.add(c.getSessionToken());
            if (spel.containsKey(c.getSessionToken())) continue;
            final Spel s = new Spel(c);
            s.cb = new MediaController.Callback() {
                @Override public void onPlaybackStateChanged(PlaybackState state) { rakna(); }
                @Override public void onMetadataChanged(MediaMetadata m) { rakna(); }
                @Override public void onSessionDestroyed() { rakna(); }
            };
            c.registerCallback(s.cb, h);
            spel.put(c.getSessionToken(), s);
        }
        for (MediaSession.Token t : new ArrayList<>(spel.keySet())) {
            if (nu.contains(t)) continue;
            Spel s = spel.remove(t);
            s.c.unregisterCallback(s.cb);
        }
        rakna();
    }

    /** Gives the time since the last count to what was playing then, and reads what plays now. */
    private void rakna() {
        h.removeCallbacks(tick);
        long nu = SystemClock.elapsedRealtime();
        boolean aktiv = power != null && power.isInteractive(), spelar = false;
        Logg logg = Logg.av(this);
        for (Spel s : spel.values()) {
            if (s.fran > 0 && s.info != null) {
                double sek = Math.min(nu - s.fran, MAX_STEG) / 1000.0;
                logg.lagg(s.info, sek, aktiv ? sek : 0);
            }
            s.info = las(s.c);
            PlaybackState st = s.c.getPlaybackState();
            boolean p = st != null && st.getState() == PlaybackState.STATE_PLAYING && st.getPlaybackSpeed() > 0;
            s.fran = p ? nu : 0;
            spelar |= p;
        }
        if (spelar) h.postDelayed(tick, TICK);
        if ((spelade && !spelar) || (spelar && nu - senastUpp > UPPLADDNING)) {
            logg.spara();
            if (nu - senastUpp > MIN_MELLAN) { senastUpp = nu; ladda(); }
        }
        spelade = spelar;
    }

    private void ladda() {
        bakgrund.execute(() -> Drive.ladda(getApplicationContext(), false));
    }

    private Regler.Info las(MediaController c) {
        MediaMetadata m = c.getMetadata();
        if (m == null) return null;
        // Everything the app gives, for the settings screen: shows what Netflix and Twitch actually expose.
        StringBuilder rad = new StringBuilder();
        for (String k : m.keySet()) {
            CharSequence v = m.getText(k);
            if (v != null && v.length() > 0) rad.append(k.replace("android.media.metadata.", "")).append(" = ").append(v).append('\n');
        }
        Logg.av(this).sattSenaste(c.getPackageName(), rad.toString().trim());
        return Regler.info(c.getPackageName(), forsta(m, MediaMetadata.METADATA_KEY_TITLE, MediaMetadata.METADATA_KEY_DISPLAY_TITLE),
            forsta(m, MediaMetadata.METADATA_KEY_ARTIST, MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE),
            forsta(m, MediaMetadata.METADATA_KEY_ALBUM), forsta(m, MediaMetadata.METADATA_KEY_MEDIA_ID));
    }

    private static String forsta(MediaMetadata m, String... nycklar) {
        for (String k : nycklar) {
            CharSequence v = m.getText(k);
            if (v != null && v.toString().trim().length() > 0) return v.toString();
        }
        return null;
    }
}
