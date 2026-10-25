package com.sanvtto.tv;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Desenha a obra como um quadro pendurado: moldura, passe-partout com corte chanfrado
 * e sombra interna, troca com fade lento — inspirado no Art Mode da Samsung The Frame.
 */
final class ArtView extends View {

    private Bitmap cur, prev;
    private String title = "", subtitle = "";
    private float fade = 1f, infoAlpha = 0f, dim = 0f;
    private int frameStyle = Prefs.FRAME_WHITE_MAT;
    private boolean showClock = true;

    private final Paint bmp = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint titlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint subPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint clockPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final SimpleDateFormat clockFmt = new SimpleDateFormat("HH:mm", new Locale("pt", "BR"));
    private ValueAnimator fadeAnim, infoAnim;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            invalidate();
            postDelayed(this, 30_000);
        }
    };

    ArtView(Context c) {
        super(c);
        titlePaint.setTypeface(Ui.MEDIUM);
        titlePaint.setTextSize(Ui.dp(c, 18));
        titlePaint.setColor(0xFFFFFFFF);
        titlePaint.setShadowLayer(Ui.dp(c, 6), 0, 0, 0x99000000);
        subPaint.setTypeface(Ui.REGULAR);
        subPaint.setTextSize(Ui.dp(c, 13));
        subPaint.setColor(0xCCFFFFFF);
        subPaint.setShadowLayer(Ui.dp(c, 6), 0, 0, 0x99000000);
        clockPaint.setTypeface(Ui.LIGHT);
        clockPaint.setTextSize(Ui.dp(c, 16));
        clockPaint.setTextAlign(Paint.Align.RIGHT);
        setLayerType(LAYER_TYPE_HARDWARE, null);
    }

    void configure(int frameStyle, boolean showClock) {
        this.frameStyle = frameStyle;
        this.showClock = showClock;
        invalidate();
    }

    void setDim(float d) {
        if (Math.abs(d - dim) > 0.001f) {
            dim = d;
            invalidate();
        }
    }

    void show(Bitmap b, String title, String subtitle) {
        if (prev != null && prev != cur && !prev.isRecycled()) prev.recycle();
        prev = cur;
        cur = b;
        this.title = title == null ? "" : title;
        this.subtitle = subtitle == null ? "" : subtitle;
        if (fadeAnim != null) fadeAnim.cancel();
        if (prev == null) {
            fade = 1f;
            invalidate();
        } else {
            fadeAnim = ValueAnimator.ofFloat(0f, 1f).setDuration(2200);
            fadeAnim.setInterpolator(Ui.EASE);
            fadeAnim.addUpdateListener(a -> {
                fade = (float) a.getAnimatedValue();
                invalidate();
            });
            fadeAnim.start();
        }
        flashInfo();
    }

    /** Mostra título e autor por alguns segundos, depois some. */
    void flashInfo() {
        if (infoAnim != null) infoAnim.cancel();
        infoAnim = ValueAnimator.ofFloat(0f, 1f, 1f, 1f, 1f, 0f).setDuration(8000);
        infoAnim.addUpdateListener(a -> {
            infoAlpha = (float) a.getAnimatedValue();
            invalidate();
        });
        infoAnim.start();
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        post(tick);
    }

    @Override
    protected void onDetachedFromWindow() {
        removeCallbacks(tick);
        if (fadeAnim != null) fadeAnim.cancel();
        if (infoAnim != null) infoAnim.cancel();
        super.onDetachedFromWindow();
    }

    @Override
    protected void onDraw(Canvas c) {
        int w = getWidth(), h = getHeight();
        if (w == 0 || h == 0) return;

        RectF opening = drawFrameAndMat(c, w, h);

        if (prev != null && fade < 1f) drawArt(c, prev, opening, Math.round(255 * (1f - fade)));
        if (cur != null) drawArt(c, cur, opening, Math.round(255 * fade));

        if (frameStyle != Prefs.FRAME_FULL) drawOpeningBevel(c, opening);

        if (dim > 0f) c.drawColor(Math.round(dim * 255) << 24);

        float pad = Ui.dp(getContext(), 40);
        if (infoAlpha > 0f && !title.isEmpty()) {
            int a = Math.round(infoAlpha * 255);
            boolean onMat = frameStyle == Prefs.FRAME_WHITE_MAT;
            titlePaint.setColor(onMat ? 0xFF1D1D1F : 0xFFFFFFFF);
            subPaint.setColor(onMat ? 0xB31D1D1F : 0xCCFFFFFF);
            titlePaint.setAlpha(a);
            subPaint.setAlpha(Math.round(a * (onMat ? 0.7f : 0.8f)));
            float y = h - pad - subPaint.getTextSize() - Ui.dp(getContext(), 6);
            c.drawText(ellipsize(title, titlePaint, w * 0.6f), pad, y, titlePaint);
            c.drawText(ellipsize(subtitle, subPaint, w * 0.6f), pad, h - pad, subPaint);
        }
        if (showClock) {
            boolean onMat = frameStyle == Prefs.FRAME_WHITE_MAT;
            clockPaint.setColor(onMat ? 0x991D1D1F : 0xB3FFFFFF);
            c.drawText(clockFmt.format(new Date()), w - pad, h - pad, clockPaint);
        }
    }

    private RectF drawFrameAndMat(Canvas c, int w, int h) {
        if (frameStyle == Prefs.FRAME_FULL) {
            c.drawColor(0xFF000000);
            return new RectF(0, 0, w, h);
        }
        float frame = 0;
        if (frameStyle == Prefs.FRAME_WOOD || frameStyle == Prefs.FRAME_BLACK) {
            frame = h * 0.045f;
            boolean wood = frameStyle == Prefs.FRAME_WOOD;
            fill.setShader(new LinearGradient(0, 0, w, h,
                    wood ? new int[]{0xFFB8895A, 0xFF8A6038, 0xFFA77A4C, 0xFF7A5230}
                            : new int[]{0xFF2A2A2C, 0xFF151516, 0xFF242426, 0xFF0E0E0F},
                    null, Shader.TileMode.CLAMP));
            c.drawRect(0, 0, w, h, fill);
            fill.setShader(null);
            // brilho na borda superior/esquerda e sombra na inferior/direita
            fill.setColor(0x26FFFFFF);
            c.drawRect(0, 0, w, frame * 0.18f, fill);
            c.drawRect(0, 0, frame * 0.18f, h, fill);
            fill.setColor(0x33000000);
            c.drawRect(0, h - frame * 0.18f, w, h, fill);
            c.drawRect(w - frame * 0.18f, 0, w, h, fill);
        }

        int mat = frameStyle == Prefs.FRAME_BLACK_MAT ? 0xFF121213 : 0xFFF3F0EA;
        int matEdge = frameStyle == Prefs.FRAME_BLACK_MAT ? 0xFF0A0A0B : 0xFFE4DFD5;
        RectF matRect = new RectF(frame, frame, w - frame, h - frame);
        fill.setShader(new RadialGradient(w / 2f, h * 0.4f, Math.max(w, h) * 0.75f,
                mat, matEdge, Shader.TileMode.CLAMP));
        c.drawRect(matRect, fill);
        fill.setShader(null);
        if (frame > 0) {
            // sombra que a moldura projeta sobre o passe-partout
            float s = frame * 0.5f;
            fill.setShader(new LinearGradient(0, frame, 0, frame + s, 0x40000000, 0, Shader.TileMode.CLAMP));
            c.drawRect(frame, frame, w - frame, frame + s, fill);
            fill.setShader(new LinearGradient(frame, 0, frame + s, 0, 0x30000000, 0, Shader.TileMode.CLAMP));
            c.drawRect(frame, frame, frame + s, h - frame, fill);
            fill.setShader(null);
        }

        float margin = Math.min(matRect.width(), matRect.height()) * 0.11f;
        return new RectF(matRect.left + margin, matRect.top + margin,
                matRect.right - margin, matRect.bottom - margin);
    }

    /** Área da obra: tela cheia corta para preencher; com passe-partout encaixa inteira. */
    private RectF artRect(Bitmap b, RectF box) {
        float bw = b.getWidth(), bh = b.getHeight();
        float scale = frameStyle == Prefs.FRAME_FULL
                ? Math.max(box.width() / bw, box.height() / bh)
                : Math.min(box.width() / bw, box.height() / bh);
        float dw = bw * scale, dh = bh * scale;
        float l = box.centerX() - dw / 2f, t = box.centerY() - dh / 2f;
        return new RectF(l, t, l + dw, t + dh);
    }

    private RectF lastArt;

    private void drawArt(Canvas c, Bitmap b, RectF box, int alpha) {
        if (b.isRecycled()) return;
        RectF r = artRect(b, box);
        if (b == cur) lastArt = r;
        bmp.setAlpha(alpha);
        c.save();
        c.clipRect(frameStyle == Prefs.FRAME_FULL ? box : r);
        c.drawBitmap(b, new Rect(0, 0, b.getWidth(), b.getHeight()), r, bmp);
        c.restore();
    }

    /** Corte chanfrado do passe-partout em volta da obra + sombra interna. */
    private void drawOpeningBevel(Canvas c, RectF box) {
        RectF r = lastArt != null ? lastArt : box;
        float bevel = Math.max(2f, Ui.dp(getContext(), 2.5f));
        boolean black = frameStyle == Prefs.FRAME_BLACK_MAT;
        fill.setColor(black ? 0xFF2A2A2C : 0xFFFFFFFF);
        c.drawRect(r.left - bevel, r.top - bevel, r.right + bevel, r.top, fill);
        c.drawRect(r.left - bevel, r.top, r.left, r.bottom + bevel, fill);
        fill.setColor(black ? 0xFF050505 : 0xFFD8D2C6);
        c.drawRect(r.left, r.bottom, r.right + bevel, r.bottom + bevel, fill);
        c.drawRect(r.right, r.top - bevel, r.right + bevel, r.bottom, fill);
        float s = Ui.dp(getContext(), 7);
        fill.setShader(new LinearGradient(0, r.top, 0, r.top + s, 0x55000000, 0, Shader.TileMode.CLAMP));
        c.drawRect(r.left, r.top, r.right, r.top + s, fill);
        fill.setShader(new LinearGradient(r.left, 0, r.left + s, 0, 0x40000000, 0, Shader.TileMode.CLAMP));
        c.drawRect(r.left, r.top, r.left + s, r.bottom, fill);
        fill.setShader(null);
    }

    private static String ellipsize(String s, Paint p, float max) {
        if (p.measureText(s) <= max) return s;
        while (s.length() > 1 && p.measureText(s + "…") > max) s = s.substring(0, s.length() - 1);
        return s + "…";
    }

    static float dimFor(Prefs p) {
        return p.nightDim() ? Theme.nightDim(Calendar.getInstance()) : 0f;
    }
}
