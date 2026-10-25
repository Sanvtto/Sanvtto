package com.sanvtto.tv;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Lista os apps instalados na TV, com banner/ícone já carregados. */
final class AppRepo {

    static final class App {
        String pkg;
        ComponentName component;
        String label;
        Drawable banner;
        Drawable icon;
        int color;
        boolean leanback;
    }

    /** Apps que viram favoritos na primeira abertura, se estiverem instalados. */
    private static final String[] DEFAULT_FAVORITES = {
            "com.netflix.ninja",
            "com.google.android.youtube.tv",
            "com.amazon.amazonvideo.livingroom",
            "com.disney.disneyplus",
            "com.globo.globotv",
            "com.wbd.stream",
            "com.hbo.hbonow",
            "com.spotify.tv.android",
            "com.plexapp.android",
            "com.apple.atve.androidtv.appletv",
    };

    private AppRepo() {}

    /** Carrega todos os apps. Pode demorar: chame fora da thread principal. */
    static List<App> load(Context c) {
        PackageManager pm = c.getPackageManager();
        Map<String, App> byPkg = new LinkedHashMap<>();
        collect(c, pm, Intent.CATEGORY_LEANBACK_LAUNCHER, true, byPkg);
        collect(c, pm, Intent.CATEGORY_LAUNCHER, false, byPkg);

        List<App> apps = new ArrayList<>(byPkg.values());
        final Collator col = Collator.getInstance(new Locale("pt", "BR"));
        col.setStrength(Collator.PRIMARY);
        Collections.sort(apps, new Comparator<App>() {
            @Override
            public int compare(App a, App b) { return col.compare(a.label, b.label); }
        });
        return apps;
    }

    private static void collect(Context c, PackageManager pm, String category, boolean leanback,
                                Map<String, App> out) {
        Intent i = new Intent(Intent.ACTION_MAIN).addCategory(category);
        List<ResolveInfo> list = pm.queryIntentActivities(i, 0);
        for (ResolveInfo ri : list) {
            ActivityInfo ai = ri.activityInfo;
            if (ai == null || c.getPackageName().equals(ai.packageName)) continue;
            if (out.containsKey(ai.packageName)) continue;
            App a = new App();
            a.pkg = ai.packageName;
            a.component = new ComponentName(ai.packageName, ai.name);
            a.leanback = leanback;
            CharSequence l = ri.loadLabel(pm);
            a.label = l == null ? ai.packageName : l.toString().trim();
            try {
                a.banner = ai.loadBanner(pm);
                if (a.banner == null) a.banner = ai.applicationInfo.loadBanner(pm);
            } catch (Throwable ignored) {
            }
            try {
                a.icon = ri.loadIcon(pm);
            } catch (Throwable ignored) {
            }
            a.color = dominantColor(a.icon);
            out.put(a.pkg, a);
        }
    }

    static Intent launchIntent(Context c, App a) {
        PackageManager pm = c.getPackageManager();
        Intent i = pm.getLeanbackLaunchIntentForPackage(a.pkg);
        if (i == null) i = pm.getLaunchIntentForPackage(a.pkg);
        if (i == null) i = new Intent(Intent.ACTION_MAIN).setComponent(a.component);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return i;
    }

    static List<String> defaultFavorites(List<App> apps) {
        List<String> out = new ArrayList<>();
        for (String p : DEFAULT_FAVORITES) {
            for (App a : apps) if (a.pkg.equals(p)) out.add(p);
        }
        for (int i = 0; out.size() < 5 && i < apps.size(); i++) {
            App a = apps.get(i);
            if (a.leanback && !out.contains(a.pkg)) out.add(a.pkg);
        }
        return out;
    }

    /** Cor média do ícone, escurecida, usada como fundo do card quando o app não tem banner. */
    private static int dominantColor(Drawable d) {
        if (d == null) return 0xFF2C2C2E;
        try {
            Bitmap b = Bitmap.createBitmap(12, 12, Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(b);
            if (d instanceof BitmapDrawable && ((BitmapDrawable) d).getBitmap() != null) {
                Bitmap src = ((BitmapDrawable) d).getBitmap();
                cv.drawBitmap(Bitmap.createScaledBitmap(src, 12, 12, true), 0, 0, null);
            } else {
                d.setBounds(0, 0, 12, 12);
                d.draw(cv);
            }
            long r = 0, g = 0, bl = 0, n = 0;
            for (int y = 0; y < 12; y++) {
                for (int x = 0; x < 12; x++) {
                    int p = b.getPixel(x, y);
                    if (Color.alpha(p) < 128) continue;
                    r += Color.red(p);
                    g += Color.green(p);
                    bl += Color.blue(p);
                    n++;
                }
            }
            b.recycle();
            if (n == 0) return 0xFF2C2C2E;
            float[] hsv = new float[3];
            Color.RGBToHSV((int) (r / n), (int) (g / n), (int) (bl / n), hsv);
            hsv[1] = Math.min(hsv[1], 0.75f);
            hsv[2] = Math.min(Math.max(hsv[2] * 0.55f, 0.16f), 0.42f);
            return Color.HSVToColor(hsv);
        } catch (Throwable t) {
            return 0xFF2C2C2E;
        }
    }
}
