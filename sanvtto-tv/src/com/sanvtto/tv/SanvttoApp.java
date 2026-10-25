package com.sanvtto.tv;

import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;

/**
 * Proteção contra travamentos: se o app fechar sozinho 2 vezes em pouco tempo,
 * a tela inicial abre em "modo seguro" (lista simples de apps), para a TV nunca
 * ficar sem tela inicial.
 */
public final class SanvttoApp extends Application {
    private static final long WINDOW_MS = 2 * 60 * 1000;

    @Override
    public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                recordCrash(this, e);
            } catch (Throwable ignored) {
            }
            if (previous != null) previous.uncaughtException(t, e);
        });
    }

    private static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences("crash", Context.MODE_PRIVATE);
    }

    static void recordCrash(Context c, Throwable e) {
        SharedPreferences sp = sp(c);
        long now = System.currentTimeMillis();
        int count = now - sp.getLong("last", 0) < WINDOW_MS ? sp.getInt("count", 0) + 1 : 1;
        // commit() e não apply(): o processo vai morrer logo em seguida
        sp.edit().putLong("last", now).putInt("count", count)
                .putString("error", String.valueOf(e)).commit();
    }

    static boolean shouldUseSafeMode(Context c) {
        SharedPreferences sp = sp(c);
        return sp.getInt("count", 0) >= 2
                && System.currentTimeMillis() - sp.getLong("last", 0) < 30 * 60 * 1000;
    }

    static String lastError(Context c) {
        return sp(c).getString("error", "");
    }

    static void clearCrashes(Context c) {
        sp(c).edit().clear().commit();
    }
}
