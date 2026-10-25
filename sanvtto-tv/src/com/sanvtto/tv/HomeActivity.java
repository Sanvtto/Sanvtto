package com.sanvtto.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Tela inicial no estilo Apple TV: relógio, fileira de favoritos e grade de apps. */
public class HomeActivity extends Activity {

    private static final int COLS = 5;
    private static final Locale PT_BR = new Locale("pt", "BR");

    private final Handler main = new Handler(Looper.getMainLooper());
    private Prefs prefs;
    private Theme theme;
    private List<AppRepo.App> apps = new ArrayList<>();
    private boolean resumed;
    private boolean safeMode;

    private FrameLayout root;
    private ImageView background;
    private ScrollView scroll;
    private TextView clock, date;
    private LinearLayout favRow, grid;
    private TextView favHint;
    private View firstFocus;
    private String bgKey = "";
    private boolean focusedOnce;

    private final SimpleDateFormat clockFmt = new SimpleDateFormat("HH:mm", PT_BR);
    private final SimpleDateFormat dateFmt = new SimpleDateFormat("EEEE, d 'de' MMMM", PT_BR);

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            updateClock();
            Theme t = Theme.current(prefs);
            if (theme != null && t.dark != theme.dark) {
                theme = t;
                buildUi();
                renderApps();
            }
            main.postDelayed(this, 15_000);
        }
    };

    private final Runnable idle = new Runnable() {
        @Override
        public void run() {
            if (resumed && !safeMode && prefs.idleMinutes() > 0) openArt();
        }
    };

    private final BroadcastReceiver packages = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            loadApps();
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = new Prefs(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
        safeMode = SanvttoApp.shouldUseSafeMode(this);
        theme = Theme.current(prefs);
        buildUi();

        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addAction(Intent.ACTION_PACKAGE_CHANGED);
        f.addDataScheme("package");
        registerReceiver(packages, f);
        loadApps();
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(packages);
        } catch (Throwable ignored) {
        }
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        main.removeCallbacks(tick);
        main.post(tick);
        resetIdle();
        loadBackground();
        if (!safeMode) ArtStore.get(this).refreshAsync(false, () -> main.post(this::loadBackground));
    }

    @Override
    protected void onPause() {
        resumed = false;
        main.removeCallbacks(idle);
        main.removeCallbacks(tick);
        super.onPause();
    }

    @Override
    public void onUserInteraction() {
        super.onUserInteraction();
        resetIdle();
    }

    private void resetIdle() {
        main.removeCallbacks(idle);
        int m = prefs.idleMinutes();
        if (m > 0) main.postDelayed(idle, m * 60_000L);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        goTop();
    }

    @Override
    public void onBackPressed() {
        // É a tela inicial: "voltar" só leva ao topo, nunca fecha.
        goTop();
    }

    private void goTop() {
        if (scroll != null) scroll.smoothScrollTo(0, 0);
        if (firstFocus != null) firstFocus.requestFocus();
    }

    // ---------------------------------------------------------------- construção da tela

    private int dp(float v) {
        return Ui.dp(this, v);
    }

    private void buildUi() {
        focusedOnce = false;
        root = new FrameLayout(this);
        root.setBackgroundColor(theme.bg);

        background = new ImageView(this);
        background.setScaleType(ImageView.ScaleType.CENTER_CROP);
        root.addView(background, new FrameLayout.LayoutParams(-1, -1));
        bgKey = "";

        View scrim = new View(this);
        scrim.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{theme.scrimTop, theme.scrimBottom}));
        root.addView(scrim, new FrameLayout.LayoutParams(-1, -1));

        scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setClipChildren(false);
        scroll.setClipToPadding(false);
        scroll.setFillViewport(true);
        scroll.setSmoothScrollingEnabled(true);
        root.addView(scroll, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setClipChildren(false);
        content.setClipToPadding(false);
        content.setPadding(dp(48), dp(30), dp(48), dp(56));
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));

        content.addView(header(), new LinearLayout.LayoutParams(-1, -2));

        if (safeMode) {
            buildSafeMode(content);
        } else {
            content.addView(section("Favoritos"));
            HorizontalScrollView hs = new HorizontalScrollView(this);
            hs.setHorizontalScrollBarEnabled(false);
            hs.setClipChildren(false);
            hs.setClipToPadding(false);
            hs.setPadding(dp(4), dp(8), dp(4), 0);
            favRow = new LinearLayout(this);
            favRow.setClipChildren(false);
            favRow.setClipToPadding(false);
            hs.addView(favRow);
            content.addView(hs, new LinearLayout.LayoutParams(-1, -2));
            favHint = Ui.text(this, "Segure OK em qualquer app para adicioná-lo aqui.", 14, theme.subtext, Ui.REGULAR);
            favHint.setPadding(dp(4), dp(8), 0, dp(8));
            favHint.setVisibility(View.GONE);
            content.addView(favHint);

            content.addView(section("Apps"));
            grid = new LinearLayout(this);
            grid.setOrientation(LinearLayout.VERTICAL);
            grid.setClipChildren(false);
            grid.setClipToPadding(false);
            grid.setPadding(dp(4), dp(8), dp(4), 0);
            content.addView(grid, new LinearLayout.LayoutParams(-1, -2));
        }

        setContentView(root);
        updateClock();
    }

    private View header() {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setClipChildren(false);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        clock = Ui.text(this, "", 46, theme.text, Ui.THIN);
        date = Ui.text(this, "", 15, theme.subtext, Ui.REGULAR);
        date.setPadding(dp(2), dp(6), 0, 0);
        col.addView(clock);
        col.addView(date);
        row.addView(col, new LinearLayout.LayoutParams(0, -2, 1));

        if (!safeMode) row.addView(pill("Quadro", v -> openArt()));
        View settings = pill("Ajustes", v -> startActivity(new Intent(this, SettingsActivity.class)));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.leftMargin = dp(12);
        row.addView(settings, lp);
        return row;
    }

    private TextView pill(String label, View.OnClickListener click) {
        final TextView t = Ui.text(this, label, 15, theme.text, Ui.MEDIUM);
        t.setPadding(dp(20), dp(10), dp(20), dp(10));
        t.setBackground(Ui.rounded(theme.surface, dp(22)));
        t.setFocusable(true);
        t.setClickable(true);
        t.setOnClickListener(click);
        Ui.clipRounded(t, dp(22));
        t.setOnFocusChangeListener((v, f) -> {
            t.setBackground(Ui.rounded(f ? theme.surfaceFocus : theme.surface, dp(22)));
            t.setTextColor(f ? 0xFF1D1D1F : theme.text);
            Ui.focusLift(t, f, 1.08f);
        });
        return t;
    }

    private TextView section(String s) {
        TextView t = Ui.text(this, s, 16, theme.subtext, Ui.MEDIUM);
        t.setPadding(dp(4), dp(30), 0, dp(6));
        return t;
    }

    private void updateClock() {
        if (clock == null) return;
        Date now = new Date();
        clock.setText(clockFmt.format(now));
        String d = dateFmt.format(now);
        date.setText(d.isEmpty() ? d : Character.toUpperCase(d.charAt(0)) + d.substring(1));
    }

    // ---------------------------------------------------------------- apps

    private void loadApps() {
        ArtStore.IO.execute(() -> {
            List<AppRepo.App> list;
            try {
                list = AppRepo.load(this);
            } catch (Throwable t) {
                list = new ArrayList<>();
            }
            final List<AppRepo.App> fl = list;
            main.post(() -> {
                if (isFinishing() || isDestroyed()) return;
                apps = fl;
                if (!prefs.hasFavorites() && !fl.isEmpty()) prefs.setFavorites(AppRepo.defaultFavorites(fl));
                renderApps();
            });
        });
    }

    private void renderApps() {
        if (safeMode) {
            buildUi();
            return;
        }
        View focused = root != null ? root.findFocus() : null;
        String focusedTag = focused != null && focused.getTag() instanceof String ? (String) focused.getTag() : null;

        int avail = getResources().getDisplayMetrics().widthPixels - dp(48) * 2 - dp(8);
        int gap = dp(22);
        int favW = (avail - gap * 3) / 4;
        int gridW = (avail - gap * (COLS - 1)) / COLS;

        favRow.removeAllViews();
        grid.removeAllViews();
        firstFocus = null;

        List<String> favs = prefs.favorites();
        List<AppRepo.App> favApps = new ArrayList<>();
        for (String p : favs) {
            AppRepo.App a = find(p);
            if (a != null) favApps.add(a);
        }
        for (int i = 0; i < favApps.size(); i++) {
            View tile = tile(favApps.get(i), favW, true);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(favW, -2);
            if (i > 0) lp.leftMargin = gap;
            favRow.addView(tile, lp);
        }
        favHint.setVisibility(favApps.isEmpty() ? View.VISIBLE : View.GONE);

        LinearLayout row = null;
        for (int i = 0; i < apps.size(); i++) {
            if (i % COLS == 0) {
                row = new LinearLayout(this);
                row.setClipChildren(false);
                row.setClipToPadding(false);
                LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(-1, -2);
                if (i > 0) rlp.topMargin = dp(10);
                grid.addView(row, rlp);
            }
            View tile = tile(apps.get(i), gridW, false);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(gridW, -2);
            if (i % COLS > 0) lp.leftMargin = gap;
            row.addView(tile, lp);
        }

        View restore = focusedTag != null ? root.findViewWithTag(focusedTag) : null;
        if (restore != null) {
            restore.requestFocus();
        } else if (firstFocus != null && (focused == null || !focused.isAttachedToWindow() || !focusedOnce)) {
            firstFocus.requestFocus();
        }
        if (firstFocus != null) focusedOnce = true;
    }

    private AppRepo.App find(String pkg) {
        for (AppRepo.App a : apps) if (a.pkg.equals(pkg)) return a;
        return null;
    }

    private View tile(final AppRepo.App a, int w, final boolean fav) {
        int h = Math.round(w * 9f / 16f);
        float radius = dp(fav ? 16 : 12);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setClipChildren(false);
        box.setClipToPadding(false);

        final FrameLayout card = new FrameLayout(this);
        card.setTag((fav ? "fav:" : "app:") + a.pkg);
        card.setFocusable(true);
        card.setClickable(true);
        card.setBackground(Ui.rounded(a.banner != null ? 0xFF1C1C1E : a.color, radius));
        Ui.clipRounded(card, radius);

        Drawable banner = copy(a.banner);
        if (banner != null) {
            ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            iv.setImageDrawable(banner);
            card.addView(iv, new FrameLayout.LayoutParams(-1, -1));
        } else {
            ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
            iv.setImageDrawable(copy(a.icon));
            int s = Math.round(h * 0.5f);
            card.addView(iv, new FrameLayout.LayoutParams(s, s, Gravity.CENTER));
        }

        // reflexo de luz que aparece no foco
        final View sheen = new View(this);
        sheen.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{0x40FFFFFF, 0x00FFFFFF, 0x00FFFFFF}));
        sheen.setAlpha(0f);
        card.addView(sheen, new FrameLayout.LayoutParams(-1, -1));

        box.addView(card, new LinearLayout.LayoutParams(w, h));

        final TextView label = Ui.text(this, a.label, fav ? 15 : 13, theme.text, Ui.MEDIUM);
        label.setGravity(Gravity.CENTER_HORIZONTAL);
        label.setEllipsize(android.text.TextUtils.TruncateAt.END);
        label.setPadding(0, dp(fav ? 16 : 13), 0, dp(4));
        label.setAlpha(0f);
        box.addView(label, new LinearLayout.LayoutParams(-1, -2));

        card.setOnFocusChangeListener((v, f) -> {
            Ui.focusLift(card, f, fav ? 1.1f : 1.12f);
            sheen.animate().alpha(f ? 1f : 0f).setDuration(220).start();
            label.animate().alpha(f ? 1f : 0f).translationY(f ? dp(4) : 0).setDuration(200).start();
        });
        card.setOnClickListener(v -> launch(a));
        card.setOnLongClickListener(v -> {
            appMenu(a);
            return true;
        });
        card.setOnKeyListener((v, code, ev) -> {
            if (code == KeyEvent.KEYCODE_MENU && ev.getAction() == KeyEvent.ACTION_UP) {
                appMenu(a);
                return true;
            }
            return false;
        });
        if (firstFocus == null) firstFocus = card;
        return box;
    }

    private static Drawable copy(Drawable d) {
        if (d == null) return null;
        Drawable.ConstantState cs = d.getConstantState();
        return cs != null ? cs.newDrawable().mutate() : d;
    }

    private void launch(AppRepo.App a) {
        try {
            startActivity(AppRepo.launchIntent(this, a));
        } catch (Throwable t) {
            Toast.makeText(this, "Não foi possível abrir " + a.label, Toast.LENGTH_SHORT).show();
        }
    }

    private void appMenu(final AppRepo.App a) {
        final List<String> favs = prefs.favorites();
        final boolean isFav = favs.contains(a.pkg);
        final int pos = favs.indexOf(a.pkg);
        final List<String> labels = new ArrayList<>();
        final List<Runnable> actions = new ArrayList<>();

        labels.add("Abrir");
        actions.add(() -> launch(a));
        if (isFav) {
            labels.add("Remover dos favoritos");
            actions.add(() -> {
                favs.remove(a.pkg);
                saveFavs(favs, null);
            });
            if (pos > 0) {
                labels.add("Mover para a esquerda");
                actions.add(() -> {
                    favs.remove(pos);
                    favs.add(pos - 1, a.pkg);
                    saveFavs(favs, "fav:" + a.pkg);
                });
            }
            if (pos < favs.size() - 1) {
                labels.add("Mover para a direita");
                actions.add(() -> {
                    favs.remove(pos);
                    favs.add(pos + 1, a.pkg);
                    saveFavs(favs, "fav:" + a.pkg);
                });
            }
        } else {
            labels.add("Adicionar aos favoritos");
            actions.add(() -> {
                favs.add(a.pkg);
                saveFavs(favs, "fav:" + a.pkg);
            });
        }
        labels.add("Informações do app");
        actions.add(() -> safeStart(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + a.pkg))));
        labels.add("Desinstalar");
        actions.add(() -> safeStart(new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + a.pkg))));

        new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle(a.label)
                .setItems(labels.toArray(new String[0]), (d, which) -> actions.get(which).run())
                .show();
    }

    private void saveFavs(List<String> favs, String focusTag) {
        prefs.setFavorites(favs);
        renderApps();
        if (focusTag != null) {
            View v = root.findViewWithTag(focusTag);
            if (v != null) v.requestFocus();
        }
    }

    private void safeStart(Intent i) {
        try {
            startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Throwable t) {
            Toast.makeText(this, "Opção indisponível nesta TV", Toast.LENGTH_SHORT).show();
        }
    }

    private void openArt() {
        try {
            startActivity(new Intent(this, ArtActivity.class));
        } catch (Throwable ignored) {
        }
    }

    // ---------------------------------------------------------------- fundo desfocado

    /** Usa a obra atual do quadro, desfocada, como fundo da tela inicial (efeito vidro). */
    private void loadBackground() {
        if (safeMode || background == null) return;
        final boolean dark = theme.dark;
        final ImageView target = background;
        ArtStore.IO.execute(() -> {
            try {
                List<ArtStore.Artwork> all = ArtStore.get(this).available();
                String key;
                Bitmap small;
                if (all.isEmpty()) {
                    key = "gen:" + dark;
                    if (key.equals(bgKey)) return;
                    small = ArtStore.generated(prefs.artIndex(), 48, 27);
                } else {
                    ArtStore.Artwork a = all.get(Math.floorMod(prefs.artIndex(), all.size()));
                    key = a.id + ":" + dark;
                    if (key.equals(bgKey)) return;
                    BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inJustDecodeBounds = true;
                    BitmapFactory.decodeFile(a.file.getPath(), o);
                    o.inSampleSize = Math.max(1, Integer.highestOneBit(Math.max(1, o.outWidth / 96)));
                    o.inJustDecodeBounds = false;
                    small = BitmapFactory.decodeFile(a.file.getPath(), o);
                    if (small == null) return;
                }
                Bitmap tiny = Bitmap.createScaledBitmap(small, 32, 18, true);
                Bitmap mid = Bitmap.createScaledBitmap(tiny, 128, 72, true);
                final Bitmap blurred = Bitmap.createScaledBitmap(mid, 384, 216, true);
                if (small != tiny) small.recycle();
                tiny.recycle();
                mid.recycle();
                final String fk = key;
                main.post(() -> {
                    if (target != background) return;
                    bgKey = fk;
                    ColorMatrix cm = new ColorMatrix();
                    cm.setSaturation(dark ? 0.8f : 0.6f);
                    target.setColorFilter(new ColorMatrixColorFilter(cm));
                    target.setAlpha(0f);
                    target.setImageBitmap(blurred);
                    target.animate().alpha(1f).setDuration(900).start();
                });
            } catch (Throwable ignored) {
            }
        });
    }

    // ---------------------------------------------------------------- modo seguro

    private void buildSafeMode(LinearLayout content) {
        TextView title = Ui.text(this, "Modo seguro", 22, theme.text, Ui.MEDIUM);
        title.setPadding(0, dp(28), 0, dp(6));
        content.addView(title);
        TextView msg = Ui.text(this, "O Sanvtto TV fechou sozinho e abriu esta lista simples para você não ficar sem tela inicial.",
                14, theme.subtext, Ui.REGULAR);
        msg.setSingleLine(false);
        content.addView(msg);

        TextView normal = pill("Voltar ao modo normal", v -> {
            SanvttoApp.clearCrashes(this);
            recreate();
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.topMargin = dp(16);
        lp.bottomMargin = dp(16);
        content.addView(normal, lp);
        firstFocus = normal;

        for (final AppRepo.App a : apps) {
            TextView row = pill(a.label, v -> launch(a));
            LinearLayout.LayoutParams rl = new LinearLayout.LayoutParams(-2, -2);
            rl.topMargin = dp(6);
            content.addView(row, rl);
        }
        normal.post(normal::requestFocus);
    }
}
