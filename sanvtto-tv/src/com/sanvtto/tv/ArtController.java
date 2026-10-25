package com.sanvtto.tv;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;

import java.util.List;

/** Controla a troca de obras: usado tanto pela tela do quadro quanto pelo protetor de tela. */
final class ArtController {
    private final Context ctx;
    private final ArtView view;
    private final Prefs prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean running;
    private int index;
    private int loadToken;

    private final Runnable advance = new Runnable() {
        @Override
        public void run() {
            step(1);
        }
    };

    private final Runnable dimTick = new Runnable() {
        @Override
        public void run() {
            view.setDim(ArtView.dimFor(prefs));
            main.postDelayed(this, 60_000);
        }
    };

    ArtController(Context c, ArtView v) {
        ctx = c;
        view = v;
        prefs = new Prefs(c);
    }

    void start() {
        running = true;
        view.configure(prefs.frameStyle(), prefs.artClock());
        main.post(dimTick);
        index = prefs.artIndex();
        showCurrent();
        ArtStore.get(ctx).refreshAsync(false, null);
    }

    void stop() {
        running = false;
        main.removeCallbacksAndMessages(null);
    }

    void step(int delta) {
        index += delta;
        showCurrent();
    }

    void info() {
        view.flashInfo();
    }

    private void showCurrent() {
        main.removeCallbacks(advance);
        final int token = ++loadToken;
        final int wanted = index;
        DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
        final int w = Math.max(dm.widthPixels, dm.heightPixels);
        final int h = Math.min(dm.widthPixels, dm.heightPixels);
        ArtStore.IO.execute(() -> {
            List<ArtStore.Artwork> all = ArtStore.get(ctx).available();
            Bitmap b = null;
            String title, sub;
            int i = 0;
            if (all.isEmpty()) {
                b = ArtStore.generated(wanted, Math.min(w, 1280), Math.min(h, 720));
                title = "Estudo em cor nº " + (Math.abs(wanted) % 97 + 1);
                sub = "Sanvtto TV · conecte à internet para receber obras de museus";
            } else {
                // tenta a obra atual; se o arquivo estiver corrompido, pula para a próxima
                for (int t = 0; t < all.size() && b == null; t++) {
                    i = Math.floorMod(wanted + t, all.size());
                    b = ArtStore.decode(all.get(i).file, w, h);
                }
                ArtStore.Artwork a = all.get(i);
                title = a.title;
                StringBuilder s = new StringBuilder(a.artist == null ? "" : a.artist);
                if (a.date != null && !a.date.isEmpty()) s.append(s.length() > 0 ? " · " : "").append(a.date);
                sub = s.toString();
                if (b == null) b = ArtStore.generated(wanted, Math.min(w, 1280), Math.min(h, 720));
            }
            final Bitmap fb = b;
            final String ft = title, fs = sub;
            final int fi = all.isEmpty() ? wanted : i;
            main.post(() -> {
                if (!running || token != loadToken) {
                    fb.recycle();
                    return;
                }
                index = fi;
                prefs.setArtIndex(fi);
                view.show(fb, ft, fs);
                main.postDelayed(advance, Math.max(1, prefs.artInterval()) * 60_000L);
            });
        });
    }
}
