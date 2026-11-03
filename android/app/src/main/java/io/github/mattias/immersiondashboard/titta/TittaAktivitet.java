package io.github.mattias.immersiondashboard.titta;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Intent;
import android.content.IntentSender;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.format.DateUtils;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executors;

/** Settings for watching on the phone: notification access, Google Drive, and which channels count as Japanese. */
public class TittaAktivitet extends Activity {
    private static final int GOOGLE = 1;
    private LinearLayout lista;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        lista = new LinearLayout(this);
        lista.setOrientation(LinearLayout.VERTICAL);
        int p = dp(16);
        lista.setPadding(p, p, p, p);
        ScrollView s = new ScrollView(this);
        s.setFitsSystemWindows(true);
        s.addView(lista);
        setContentView(s);
    }

    @Override protected void onResume() {
        super.onResume();
        rita();
    }

    private int dp(int x) { return Math.round(x * getResources().getDisplayMetrics().density); }

    private TextView text(CharSequence t, float storlek, boolean fet) {
        TextView v = new TextView(this);
        v.setText(t);
        v.setTextSize(storlek);
        if (fet) v.setTypeface(Typeface.DEFAULT_BOLD);
        v.setPadding(0, dp(6), 0, dp(6));
        lista.addView(v);
        return v;
    }

    private void knapp(String t, View.OnClickListener l) {
        Button k = new Button(this);
        k.setText(t);
        k.setAllCaps(false);
        k.setOnClickListener(l);
        lista.addView(k);
    }

    private boolean harAtkomst() {
        String s = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return s != null && s.contains(new ComponentName(this, TittaTjanst.class).flattenToString());
    }

    private void rita() {
        lista.removeAllViews();
        Logg l = Logg.av(this);
        text("Watching on this phone", 22, true);
        text("Counts Japanese video while it plays in YouTube, Netflix and Twitch, and uploads it to the dashboard's hidden app folder in "
            + "Google Drive. The dashboard shows it under Netflix, YouTube and Twitch after the next sync.", 14, false);

        text("1. Notification access", 17, true);
        if (harAtkomst()) text("On. Only media sessions are read: what plays, not your notifications.", 14, false);
        else {
            text("Needed to see what other apps play. No notifications are read.", 14, false);
            knapp("Allow notification access", v -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
            if (Build.VERSION.SDK_INT >= 33) {
                text("If the switch is greyed out: open App info, tap ⋮ and choose Allow restricted settings, then try again.", 13, false);
                knapp("Open App info", v -> startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))));
            }
        }

        text("2. Google Drive", 17, true);
        long senast = l.drive.optLong("senast");
        String fel = l.drive.optString("fel");
        // A successful upload is the proof of a connection; an error after it means it no longer works.
        boolean ansluten = senast > 0 && fel.isEmpty();
        if (ansluten) text("✓ Connected. Last upload " + DateUtils.getRelativeTimeSpanString(senast) + ".", 14, false).setTextColor(0xFF81C784);
        else text(senast > 0 ? "Last upload " + DateUtils.getRelativeTimeSpanString(senast) + "." : "Not connected.", 14, false);
        if (!fel.isEmpty()) text(fel, 13, false).setTextColor(0xFFE57373);
        knapp(ansluten ? "Connect again" : "Connect Google Drive", v -> anslut());
        knapp("Upload now", v -> ladda());

        text("3. Channels and shows, last 30 days", 17, true);
        text("Titles or channels with kana or kanji count by themselves. Tap a row to choose: Japanese, not Japanese, or automatic.", 13, false);
        for (final Rad r : rader(l)) {
            TextView v = text(r.text(), 15, false);
            v.setPadding(0, dp(10), 0, dp(10));
            v.setOnClickListener(x -> {
                // Automatic → Japanese → Not Japanese → automatic.
                Logg.av(this).valj(r.nyckel, r.val == null ? Boolean.TRUE : r.val ? Boolean.FALSE : null);
                rita();
            });
        }

        text("What the apps report", 17, true);
        JSONObject s = l.senaste;
        if (s.length() == 0) text("Nothing yet. Play something in YouTube, Netflix or Twitch.", 13, false);
        for (Iterator<String> it = s.keys(); it.hasNext(); ) {
            String k = it.next();
            text(k + "\n" + s.optString(k), 12, false).setTypeface(Typeface.MONOSPACE);
        }
    }

    private static final class Rad {
        String nyckel, sajt, namn;
        Boolean val, auto;
        double sek;
        String text() {
            boolean ja = val != null ? val : Boolean.TRUE.equals(auto);
            String hur = val != null ? (val ? "Japanese (your choice)" : "Not Japanese (your choice)") : ja ? "Japanese (automatic)" : "Not counted (tap if Japanese)";
            return String.format(Locale.ROOT, "%s %s · %s\n%d min · %s", ja ? "✓" : "·", sajt, namn, Math.round(sek / 60), hur);
        }
    }

    private static List<Rad> rader(Logg l) {
        JSONObject[] k = l.kopia();
        Map<String, Rad> per = new LinkedHashMap<>();
        for (Iterator<String> it = k[0].keys(); it.hasNext(); ) {
            JSONObject p = k[0].optJSONObject(it.next());
            if (p == null || p.isNull("kanal")) continue;
            String n = Regler.valNyckel(p.optString("sajt"), p.optString("kanal"));
            Rad r = per.get(n);
            if (r == null) {
                r = new Rad();
                r.nyckel = n; r.sajt = p.optString("sajt"); r.namn = p.optString("kanal");
                r.val = k[1].has(n) ? k[1].optBoolean(n) : null;
                per.put(n, r);
            }
            r.sek += p.optDouble("sek");
            if (!p.isNull("auto")) r.auto = p.optBoolean("auto");
        }
        List<Rad> ut = new ArrayList<>(per.values());
        Collections.sort(ut, (a, b) -> Double.compare(b.sek, a.sek));
        return ut;
    }

    private void anslut() {
        Identity.getAuthorizationClient(this).authorize(Drive.begaran())
            .addOnSuccessListener(r -> {
                if (r.hasResolution()) {
                    PendingIntent pi = r.getPendingIntent();
                    try { startIntentSenderForResult(pi.getIntentSender(), GOOGLE, null, 0, 0, 0); }
                    catch (IntentSender.SendIntentException e) { Logg.av(this).sattDrive("fel", e.toString()); rita(); }
                } else ladda();
            })
            .addOnFailureListener(e -> { Logg.av(this).sattDrive("fel", "Google: " + e.getMessage()); rita(); });
    }

    @Override protected void onActivityResult(int kod, int resultat, Intent data) {
        super.onActivityResult(kod, resultat, data);
        if (kod != GOOGLE) return;
        try {
            AuthorizationResult r = Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(data);
            if (r.getAccessToken() != null) ladda();
        } catch (Exception e) {
            Logg.av(this).sattDrive("fel", "Google: " + e.getMessage());
            rita();
        }
    }

    private void ladda() {
        Logg.av(this).spara();
        Executors.newSingleThreadExecutor().execute(() -> {
            Drive.ladda(getApplicationContext(), true);
            runOnUiThread(this::rita);
        });
    }
}
