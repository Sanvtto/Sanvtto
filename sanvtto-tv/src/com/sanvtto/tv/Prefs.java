package com.sanvtto.tv;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Configurações do usuário, guardadas em SharedPreferences. */
final class Prefs {
    static final int THEME_AUTO = 0, THEME_LIGHT = 1, THEME_DARK = 2;
    static final int SOURCE_BOTH = 0, SOURCE_MUSEUMS = 1, SOURCE_PHOTOS = 2;
    static final int FRAME_FULL = 0, FRAME_WHITE_MAT = 1, FRAME_BLACK_MAT = 2, FRAME_WOOD = 3, FRAME_BLACK = 4;

    private final SharedPreferences sp;

    Prefs(Context c) {
        sp = c.getApplicationContext().getSharedPreferences("sanvtto", Context.MODE_PRIVATE);
    }

    int theme() { return sp.getInt("theme", THEME_AUTO); }
    /** Minutos sem uso na tela inicial até abrir o modo quadro (0 = nunca). */
    int idleMinutes() { return sp.getInt("idleMin", 10); }
    int artSource() { return sp.getInt("artSource", SOURCE_BOTH); }
    int frameStyle() { return sp.getInt("frameStyle", FRAME_WHITE_MAT); }
    /** Minutos entre trocas de obra no modo quadro. */
    int artInterval() { return sp.getInt("artInterval", 15); }
    boolean nightDim() { return sp.getBoolean("nightDim", true); }
    boolean artClock() { return sp.getBoolean("artClock", true); }
    int artIndex() { return sp.getInt("artIndex", 0); }
    void setArtIndex(int i) { sp.edit().putInt("artIndex", i).apply(); }
    long lastArtFetch() { return sp.getLong("lastArtFetch", 0); }
    void setLastArtFetch(long t) { sp.edit().putLong("lastArtFetch", t).apply(); }

    int getInt(String key, int def) { return sp.getInt(key, def); }
    void putInt(String key, int v) { sp.edit().putInt(key, v).apply(); }
    boolean getBool(String key, boolean def) { return sp.getBoolean(key, def); }
    void putBool(String key, boolean v) { sp.edit().putBoolean(key, v).apply(); }

    boolean hasFavorites() { return sp.contains("favs"); }

    List<String> favorites() {
        String s = sp.getString("favs", "");
        List<String> out = new ArrayList<>();
        if (s.isEmpty()) return out;
        out.addAll(Arrays.asList(s.split(",")));
        return out;
    }

    void setFavorites(List<String> pkgs) {
        StringBuilder b = new StringBuilder();
        for (String p : pkgs) {
            if (b.length() > 0) b.append(',');
            b.append(p);
        }
        sp.edit().putString("favs", b.toString()).apply();
    }
}
