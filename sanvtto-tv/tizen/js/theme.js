/* Tema que escurece sozinho: nascer/pôr do sol do dia (algoritmo NOAA), igual ao app Android. */
(function (global) {
    'use strict';
    var DEFAULT_LAT = -23.55; // São Paulo; a longitude sai do fuso horário

    function rad(d) { return d * Math.PI / 180; }
    function deg(r) { return r * 180 / Math.PI; }
    function norm(v, max) { v %= max; return v < 0 ? v + max : v; }

    function dayOfYear(d) {
        var start = new Date(d.getFullYear(), 0, 0);
        var diff = d - start + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000;
        return Math.floor(diff / 86400000);
    }

    function solarEvent(n, lat, lon, offset, rising) {
        var lngHour = lon / 15;
        var t = n + ((rising ? 6 : 18) - lngHour) / 24;
        var m = 0.9856 * t - 3.289;
        var l = norm(m + 1.916 * Math.sin(rad(m)) + 0.020 * Math.sin(rad(2 * m)) + 282.634, 360);
        var ra = norm(deg(Math.atan(0.91764 * Math.tan(rad(l)))), 360);
        ra += Math.floor(l / 90) * 90 - Math.floor(ra / 90) * 90;
        ra /= 15;
        var sinDec = 0.39782 * Math.sin(rad(l));
        var cosDec = Math.cos(Math.asin(sinDec));
        var cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
        if (cosH > 1 || cosH < -1) return NaN;
        var h = rising ? 360 - deg(Math.acos(cosH)) : deg(Math.acos(cosH));
        h /= 15;
        var ut = norm(h + ra - 0.06571 * t - 6.622 - lngHour, 24);
        return norm(ut + offset, 24);
    }

    /** {rise, set} em horas locais. tzOffsetMin = minutos a leste de UTC (Brasil = -180). */
    function sunTimes(date, tzOffsetMin) {
        var offset = (tzOffsetMin === undefined ? -date.getTimezoneOffset() : tzOffsetMin) / 60;
        var lon = offset * 15;
        var n = dayOfYear(date);
        var rise = solarEvent(n, DEFAULT_LAT, lon, offset, true);
        var set = solarEvent(n, DEFAULT_LAT, lon, offset, false);
        if (isNaN(rise) || isNaN(set)) return { rise: 6.5, set: 18.5 };
        return { rise: rise, set: set };
    }

    function hours(date) { return date.getHours() + date.getMinutes() / 60; }

    function isNight(date, tz) {
        var s = sunTimes(date, tz), h = hours(date);
        return h < s.rise + 0.33 || h > s.set - 0.33;
    }

    /** Escurecimento do quadro: 0 de dia, sobe aos poucos à noite até 0.55. */
    function nightDim(date, tz) {
        var s = sunTimes(date, tz), h = hours(date);
        if (h >= s.rise + 1 && h <= s.set) return 0;
        if (h > s.set) {
            var t = Math.min(1, (h - s.set) / Math.max(0.5, 23 - s.set));
            return 0.12 + 0.43 * t;
        }
        if (h < s.rise) return 0.55;
        return Math.max(0, 0.55 * (1 - (h - s.rise)));
    }

    global.Theme = { sunTimes: sunTimes, isNight: isNight, nightDim: nightDim };
})(this);
