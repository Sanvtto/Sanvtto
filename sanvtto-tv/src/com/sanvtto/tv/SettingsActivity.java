package com.sanvtto.tv;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;

/** Ajustes em lista, no estilo tvOS: OK alterna entre as opções. */
public class SettingsActivity extends Activity {
    private Prefs prefs;
    private Theme theme;
    private LinearLayout list;

    private interface Action { void run(); }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = new Prefs(this);
        build();
    }

    private int dp(float v) { return Ui.dp(this, v); }

    private void build() {
        theme = Theme.current(prefs);
        LinearLayout root = new LinearLayout(this);
        root.setBackgroundColor(theme.bg);
        root.setPadding(dp(64), dp(40), dp(64), dp(24));

        LinearLayout left = new LinearLayout(this);
        left.setOrientation(LinearLayout.VERTICAL);
        left.setGravity(Gravity.CENTER);
        TextView big = Ui.text(this, "Ajustes", 34, theme.text, Ui.LIGHT);
        TextView small = Ui.text(this, "Sanvtto TV " + version(), 14, theme.subtext, Ui.REGULAR);
        small.setPadding(0, dp(8), 0, 0);
        left.addView(big);
        left.addView(small);
        root.addView(left, new LinearLayout.LayoutParams(0, -1, 0.38f));

        ScrollView sv = new ScrollView(this);
        sv.setVerticalScrollBarEnabled(false);
        sv.setClipChildren(false);
        sv.setClipToPadding(false);
        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setClipChildren(false);
        list.setPadding(dp(8), dp(8), dp(8), dp(40));
        sv.addView(list);
        root.addView(sv, new LinearLayout.LayoutParams(0, -1, 0.62f));

        header("Aparência");
        choice("Tema", "theme", new String[]{"Automático (pôr do sol)", "Claro", "Escuro"},
                new int[]{0, 1, 2}, prefs.theme(), this::rebuild);

        header("Modo quadro");
        action("Abrir o quadro agora", null, () -> startActivity(new Intent(this, ArtActivity.class)));
        choice("Abrir sozinho após", "idleMin", new String[]{"Nunca", "2 min", "5 min", "10 min", "15 min", "30 min"},
                new int[]{0, 2, 5, 10, 15, 30}, prefs.idleMinutes(), null);
        choice("Moldura", "frameStyle",
                new String[]{"Tela cheia", "Passe-partout branco", "Passe-partout preto", "Moldura de madeira", "Moldura preta"},
                new int[]{0, 1, 2, 3, 4}, prefs.frameStyle(), null);
        choice("Obras", "artSource", new String[]{"Museus + minhas fotos", "Só museus", "Só minhas fotos"},
                new int[]{0, 1, 2}, prefs.artSource(), null);
        choice("Trocar obra a cada", "artInterval", new String[]{"1 min", "5 min", "15 min", "30 min", "1 hora", "3 horas"},
                new int[]{1, 5, 15, 30, 60, 180}, prefs.artInterval(), null);
        toggle("Escurecer à noite", "nightDim", prefs.nightDim());
        toggle("Mostrar relógio", "artClock", prefs.artClock());
        action("Baixar novas obras agora", null, () -> {
            prefs.setLastArtFetch(0);
            ArtStore.get(this).refreshAsync(true, () -> runOnUiThread(() ->
                    Toast.makeText(this, "Obras atualizadas", Toast.LENGTH_SHORT).show()));
            Toast.makeText(this, "Baixando em segundo plano…", Toast.LENGTH_SHORT).show();
        });
        File photos = ArtStore.get(this).photosDir();
        info("Pasta das suas fotos", photos == null ? "indisponível" : photos.getAbsolutePath());

        header("Sistema");
        action("Usar como tela inicial", "Escolha Sanvtto TV na lista", () -> open(Settings.ACTION_HOME_SETTINGS));
        action("Protetor de tela da TV", "Escolha \"Sanvtto Quadro\"", () -> open(Settings.ACTION_DREAM_SETTINGS));
        action("Configurações da TV", null, () -> open(Settings.ACTION_SETTINGS));

        setContentView(root);
        if (list.getChildCount() > 1) list.getChildAt(1).requestFocus();
    }

    private void rebuild() {
        build();
    }

    private String version() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    private void open(String action) {
        try {
            startActivity(new Intent(action));
        } catch (Throwable t) {
            Toast.makeText(this, "Esta TV não tem essa tela. Use o instalador via ADB.", Toast.LENGTH_LONG).show();
        }
    }

    private void header(String s) {
        TextView t = Ui.text(this, s.toUpperCase(), 12, theme.subtext, Ui.MEDIUM);
        t.setLetterSpacing(0.08f);
        t.setPadding(dp(16), list.getChildCount() == 0 ? 0 : dp(22), 0, dp(8));
        list.addView(t);
    }

    private TextView[] row(String label, String value) {
        LinearLayout r = new LinearLayout(this);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(dp(16), dp(13), dp(16), dp(13));
        r.setFocusable(true);
        r.setClickable(true);
        r.setBackground(Ui.rounded(0x00000000, dp(12)));
        Ui.clipRounded(r, dp(12));
        TextView l = Ui.text(this, label, 16, theme.text, Ui.REGULAR);
        TextView v = Ui.text(this, value == null ? "" : value, 15, theme.subtext, Ui.REGULAR);
        v.setGravity(Gravity.END);
        r.addView(l, new LinearLayout.LayoutParams(0, -2, 1));
        r.addView(v, new LinearLayout.LayoutParams(-2, -2));
        r.setOnFocusChangeListener((view, f) -> {
            r.setBackground(Ui.rounded(f ? 0xFFFFFFFF : 0x00000000, dp(12)));
            l.setTextColor(f ? 0xFF1D1D1F : theme.text);
            v.setTextColor(f ? 0x991D1D1F : theme.subtext);
            Ui.focusLift(r, f, 1.03f);
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = dp(2);
        list.addView(r, lp);
        return new TextView[]{l, v};
    }

    private void choice(String label, final String key, final String[] names, final int[] values,
                        int current, final Action after) {
        int idx = 0;
        for (int i = 0; i < values.length; i++) if (values[i] == current) idx = i;
        final int[] pos = {idx};
        final TextView[] tv = row(label, names[idx]);
        ((View) tv[0].getParent()).setOnClickListener(v -> {
            pos[0] = (pos[0] + 1) % values.length;
            prefs.putInt(key, values[pos[0]]);
            tv[1].setText(names[pos[0]]);
            if (after != null) after.run();
        });
    }

    private void toggle(String label, final String key, boolean current) {
        final boolean[] on = {current};
        final TextView[] tv = row(label, current ? "Sim" : "Não");
        ((View) tv[0].getParent()).setOnClickListener(v -> {
            on[0] = !on[0];
            prefs.putBool(key, on[0]);
            tv[1].setText(on[0] ? "Sim" : "Não");
        });
    }

    private void action(String label, String hint, final Action a) {
        TextView[] tv = row(label, hint == null ? "›" : hint);
        ((View) tv[0].getParent()).setOnClickListener(v -> a.run());
    }

    private void info(String label, String value) {
        TextView[] tv = row(label, "");
        tv[1].setText(value);
        tv[1].setSingleLine(false);
        tv[1].setTextSize(12);
    }
}
