package com.sanvtto.tv;

import static org.robolectric.Shadows.shadowOf;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Looper;
import android.view.View;

import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.TimeUnit;

import org.robolectric.shadows.ShadowPackageManager;

final class TestUtil {
    private TestUtil() {}

    static final String[][] FAKE_APPS = {
            {"com.netflix.ninja", "Netflix", "#E50914"},
            {"com.google.android.youtube.tv", "YouTube", "#FF0000"},
            {"com.amazon.amazonvideo.livingroom", "Prime Video", "#00A8E1"},
            {"com.disney.disneyplus", "Disney+", "#113CCF"},
            {"com.globo.globotv", "Globoplay", "#FB0234"},
            {"com.spotify.tv.android", "Spotify", "#1DB954"},
            {"com.plexapp.android", "Plex", "#E5A00D"},
            {"com.android.tv.settings", "Configurações", "#8E8E93"},
            {"org.videolan.vlc", "VLC", "#FF8800"},
            {"com.example.weather", "Clima", "#4A90D9"},
            {"com.example.music", "Música", "#FA2D48"},
            {"com.example.photos", "Fotos", "#F5A623"},
    };

    /** Instala apps falsos com ícone colorido, como se fossem apps de TV. */
    static void installFakeApps(Context c, int extra) {
        ShadowPackageManager spm = shadowOf(c.getPackageManager());
        int n = FAKE_APPS.length + extra;
        for (int i = 0; i < n; i++) {
            String pkg = i < FAKE_APPS.length ? FAKE_APPS[i][0] : "com.example.extra" + i;
            String label = i < FAKE_APPS.length ? FAKE_APPS[i][1] : "App Extra " + i;
            String color = i < FAKE_APPS.length ? FAKE_APPS[i][2] : "#5856D6";
            ComponentName cn = new ComponentName(pkg, pkg + ".Main");

            ApplicationInfo ai = new ApplicationInfo();
            ai.packageName = pkg;
            ai.name = label;
            ai.nonLocalizedLabel = label;
            PackageInfo pi = new PackageInfo();
            pi.packageName = pkg;
            pi.applicationInfo = ai;
            spm.installPackage(pi);

            ActivityInfo act = spm.addActivityIfNotPresent(cn);
            act.nonLocalizedLabel = label;
            act.applicationInfo = ai;
            IntentFilter f = new IntentFilter(Intent.ACTION_MAIN);
            f.addCategory(i % 3 == 2 ? Intent.CATEGORY_LAUNCHER : Intent.CATEGORY_LEANBACK_LAUNCHER);
            spm.addIntentFilterForActivity(cn, f);
            try {
                spm.setApplicationIcon(pkg, icon(c, android.graphics.Color.parseColor(color)));
            } catch (Throwable ignored) {
            }
        }
    }

    static BitmapDrawable icon(Context c, int color) {
        Bitmap b = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(20);
        g.setBounds(8, 8, 88, 88);
        g.draw(cv);
        return new BitmapDrawable(c.getResources(), b);
    }

    /** Espera a thread de I/O do app e depois processa a fila da thread principal. */
    static void settle() throws Exception {
        for (int i = 0; i < 4; i++) {
            ArtStore.IO.submit(() -> { }).get(20, TimeUnit.SECONDS);
            shadowOf(Looper.getMainLooper()).idle();
        }
    }

    /** Salva um "print" da view para conferência visual. */
    static File screenshot(View root, String name) throws Exception {
        int w = root.getWidth(), h = root.getHeight();
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        root.draw(new Canvas(b));
        File dir = new File("target/screenshots");
        dir.mkdirs();
        File f = new File(dir, name + ".png");
        FileOutputStream os = new FileOutputStream(f);
        b.compress(Bitmap.CompressFormat.PNG, 100, os);
        os.close();
        return f;
    }

    static void writeJpeg(File f, int w, int h, int seed) throws Exception {
        Bitmap b = ArtStore.generated(seed, w, h);
        f.getParentFile().mkdirs();
        FileOutputStream os = new FileOutputStream(f);
        b.compress(Bitmap.CompressFormat.JPEG, 90, os);
        os.close();
    }

    static boolean hasPermission(Context c, String perm) {
        return c.checkPermission(perm, android.os.Process.myPid(), android.os.Process.myUid())
                == PackageManager.PERMISSION_GRANTED;
    }
}
