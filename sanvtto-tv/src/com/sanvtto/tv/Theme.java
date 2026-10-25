package com.sanvtto.tv;

import android.graphics.Color;

import java.util.Calendar;
import java.util.TimeZone;

/**
 * Tema que escurece sozinho: calcula nascer e pôr do sol para o dia de hoje
 * (algoritmo do Almanac for Computers / NOAA) e decide claro ou escuro.
 */
final class Theme {
    /** Latitude padrão (São Paulo). A longitude sai do fuso horário do aparelho. */
    static final double DEFAULT_LAT = -23.55;

    final boolean dark;
    final int bg, surface, surfaceFocus, text, subtext, scrimTop, scrimBottom;

    private Theme(boolean dark) {
        this.dark = dark;
        if (dark) {
            bg = 0xFF0B0B0D;
            surface = 0x33FFFFFF;
            surfaceFocus = 0xFFFFFFFF;
            text = 0xFFF5F5F7;
            subtext = 0x99F5F5F7;
            scrimTop = 0x99000000;
            scrimBottom = 0xE6000000;
        } else {
            bg = 0xFFECECF0;
            surface = 0x66FFFFFF;
            surfaceFocus = 0xFFFFFFFF;
            text = 0xFF1D1D1F;
            subtext = 0x991D1D1F;
            scrimTop = 0x8CF2F2F5;
            scrimBottom = 0xE6F2F2F5;
        }
    }

    static Theme current(Prefs p) {
        int mode = p.theme();
        if (mode == Prefs.THEME_DARK) return new Theme(true);
        if (mode == Prefs.THEME_LIGHT) return new Theme(false);
        return new Theme(isNight(Calendar.getInstance()));
    }

    /** Escuro de 20 min antes do pôr do sol até 20 min depois do nascer do sol. */
    static boolean isNight(Calendar now) {
        double[] sun = sunTimes(now);
        double h = now.get(Calendar.HOUR_OF_DAY) + now.get(Calendar.MINUTE) / 60.0;
        return h < sun[0] + 0.33 || h > sun[1] - 0.33;
    }

    /**
     * Quanto escurecer o modo quadro (0 = nada, 0.6 = bem escuro).
     * Vai escurecendo aos poucos depois do pôr do sol, como o sensor de luz da The Frame.
     */
    static float nightDim(Calendar now) {
        double[] sun = sunTimes(now);
        double h = now.get(Calendar.HOUR_OF_DAY) + now.get(Calendar.MINUTE) / 60.0;
        if (h >= sun[0] + 1 && h <= sun[1]) return 0f;           // dia
        if (h > sun[1]) {                                          // noite começando
            double t = Math.min(1, (h - sun[1]) / Math.max(0.5, 23 - sun[1]));
            return (float) (0.12 + 0.43 * t);
        }
        if (h < sun[0]) return 0.55f;                              // madrugada
        return (float) (0.55 * (1 - (h - sun[0])));                // amanhecendo
    }

    /** Retorna {nascer, pôr} em horas locais (ex.: 5.9 = 05:54). */
    static double[] sunTimes(Calendar day) {
        TimeZone tz = day.getTimeZone();
        double offset = tz.getOffset(day.getTimeInMillis()) / 3600000.0;
        double lon = (tz.getRawOffset() / 3600000.0) * 15.0;
        double rise = solarEvent(day.get(Calendar.DAY_OF_YEAR), DEFAULT_LAT, lon, offset, true);
        double set = solarEvent(day.get(Calendar.DAY_OF_YEAR), DEFAULT_LAT, lon, offset, false);
        if (Double.isNaN(rise) || Double.isNaN(set)) return new double[]{6.5, 18.5};
        return new double[]{rise, set};
    }

    private static double solarEvent(int n, double lat, double lon, double offset, boolean rising) {
        double lngHour = lon / 15.0;
        double t = n + ((rising ? 6 : 18) - lngHour) / 24.0;
        double m = 0.9856 * t - 3.289;
        double l = norm(m + 1.916 * sin(m) + 0.020 * sin(2 * m) + 282.634, 360);
        double ra = norm(Math.toDegrees(Math.atan(0.91764 * Math.tan(Math.toRadians(l)))), 360);
        ra += Math.floor(l / 90) * 90 - Math.floor(ra / 90) * 90;
        ra /= 15.0;
        double sinDec = 0.39782 * sin(l);
        double cosDec = Math.cos(Math.asin(sinDec));
        double cosH = (cos(90.833) - sinDec * sin(lat)) / (cosDec * cos(lat));
        if (cosH > 1 || cosH < -1) return Double.NaN;
        double h = rising ? 360 - Math.toDegrees(Math.acos(cosH)) : Math.toDegrees(Math.acos(cosH));
        h /= 15.0;
        double localMean = h + ra - 0.06571 * t - 6.622;
        double ut = norm(localMean - lngHour, 24);
        return norm(ut + offset, 24);
    }

    private static double sin(double deg) { return Math.sin(Math.toRadians(deg)); }
    private static double cos(double deg) { return Math.cos(Math.toRadians(deg)); }
    private static double norm(double v, double max) {
        v %= max;
        return v < 0 ? v + max : v;
    }

    static int withAlpha(int color, float a) {
        return Color.argb(Math.round(a * 255), Color.red(color), Color.green(color), Color.blue(color));
    }
}
