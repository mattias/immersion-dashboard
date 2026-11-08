package io.github.mattias.immersiondashboard.titta;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

import java.util.concurrent.Executors;

/** Uploads Listening Practice's statistics now and then, once the user has allowed reading them. Needs a network. */
public class LyssnaJobb extends JobService {
    private static final int ID = 4711;

    /** Schedules the upload every six hours (it also survives a restart of the phone), unless that is already done. */
    static void planera(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null || js.getPendingJob(ID) != null) return;
        try {
            js.schedule(new JobInfo.Builder(ID, new ComponentName(c, LyssnaJobb.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(6 * 60 * 60 * 1000L).setPersisted(true).build());
        } catch (RuntimeException ignored) {
            // The upload then happens only when the screen is opened.
        }
    }

    @Override public boolean onStartJob(JobParameters p) {
        Executors.newSingleThreadExecutor().execute(() -> {
            if (Lyssna.installerad(this) && Lyssna.tillat(this)) Drive.laddaLyssna(getApplicationContext());
            jobFinished(p, false);
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters p) { return true; }
}
