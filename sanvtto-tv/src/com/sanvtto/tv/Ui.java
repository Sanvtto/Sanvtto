package com.sanvtto.tv;

import android.content.Context;
import android.graphics.Outline;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.animation.PathInterpolator;
import android.widget.TextView;

/** Pequenos utilitários de interface. */
final class Ui {
    /** Curva de animação suave no estilo tvOS. */
    static final PathInterpolator EASE = new PathInterpolator(0.2f, 0f, 0f, 1f);

    static final Typeface LIGHT = Typeface.create("sans-serif-light", Typeface.NORMAL);
    static final Typeface THIN = Typeface.create("sans-serif-thin", Typeface.NORMAL);
    static final Typeface REGULAR = Typeface.create("sans-serif", Typeface.NORMAL);
    static final Typeface MEDIUM = Typeface.create("sans-serif-medium", Typeface.NORMAL);

    private Ui() {}

    static int dp(Context c, float v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    static TextView text(Context c, String s, float sp, int color, Typeface tf) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setTypeface(tf);
        t.setIncludeFontPadding(false);
        t.setSingleLine(true);
        return t;
    }

    static GradientDrawable rounded(int color, float radiusPx) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radiusPx);
        return d;
    }

    static void clipRounded(View v, final float radiusPx) {
        v.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), radiusPx);
            }
        });
        v.setClipToOutline(true);
    }

    /** Animação de foco: cresce, ganha sombra e sobe — como os ícones da Apple TV. */
    static void focusLift(View v, boolean focused, float scale) {
        v.animate()
                .scaleX(focused ? scale : 1f)
                .scaleY(focused ? scale : 1f)
                .translationZ(focused ? dp(v.getContext(), 14) : 0)
                .setDuration(focused ? 220 : 180)
                .setInterpolator(EASE)
                .start();
    }
}
