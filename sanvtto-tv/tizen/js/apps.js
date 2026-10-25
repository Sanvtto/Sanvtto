/* Apps instalados na TV via API oficial do Tizen (tizen.application). */
(function (global) {
    'use strict';

    // Ordem dos favoritos na primeira abertura (os nomes variam por região, então comparamos o nome).
    var DEFAULT_FAVORITES = ['netflix', 'youtube', 'prime video', 'disney', 'globoplay', 'max', 'spotify', 'plex', 'apple tv'];

    // Apps internos do sistema que não fazem sentido na grade.
    var HIDDEN = /^(org\.tizen\.|com\.samsung\.tv\.(?!store))|\.(service|widget)$/i;

    var PALETTE = ['#3a3a3c', '#2c4a6b', '#5a3a6b', '#6b3a3a', '#3a6b4a', '#6b5a2c', '#2c5a6b', '#4a3a6b'];

    function selfId() {
        try { return global.tizen.application.getCurrentApplication().appInfo.id; } catch (e) { return ''; }
    }

    function colorFor(name) {
        var h = 0;
        for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
        return PALETTE[Math.abs(h) % PALETTE.length];
    }

    // Lista reserva: apps comuns na Samsung. Cada um tem dois tipos de código (o da loja e o do Tizen),
    // e cada TV usa um; o app tenta os dois.
    var KNOWN = [
        ['Netflix', ['3201907018807', 'org.tizen.netflix-app', '11101200001']],
        ['YouTube', ['111299001912', '9Ur5IzDKqV.TizenYouTube']],
        ['Prime Video', ['3201910019365', 'org.tizen.ignition', '3201512006785']],
        ['Disney+', ['3201901017640', 'MCmYXNxgcu.DisneyPlus']],
        ['Globoplay', ['3201908019041']],
        ['Spotify', ['3201606009684', 'rJeHak5zRg.Spotify']],
        ['Apple TV', ['3201807016597']],
        ['Plex', ['3201512006963', 'kIciSQlYEM.plex']]
    ];

    var CACHE_KEY = 'sv.appsCache';
    var FIRST_WAIT_MS = 8000;   // espera inicial antes de mostrar algo
    var MAX_WAIT_MS = 90000;    // TVs lentas podem demorar bastante para listar tudo

    var Diag = global.Store.Diag, errText = global.Store.errText;

    function entry(id, name, icon) {
        return { id: id, name: String(name).trim(), icon: icon || '', color: colorFor(String(name)) };
    }

    function sortByName(list) {
        list.sort(function (x, y) { return x.name.localeCompare(y.name, 'pt-BR', { sensitivity: 'base' }); });
        return list;
    }

    function readCache() {
        try {
            var c = JSON.parse(global.localStorage.getItem(CACHE_KEY) || 'null');
            return Array.isArray(c) ? c.filter(function (a) { return a && a.id && a.name; }) : [];
        } catch (e) { return []; }
    }

    function writeCache(list) {
        try { global.localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch (e) { /* sem espaço */ }
    }

    var pending = null; // pedido à TV em andamento (não dispara outro enquanto este não volta)

    /**
     * Resolve rápido com a melhor lista disponível: a última salva, ou (na primeira vez) espera a TV até 8 s
     * e, se ela não responder, usa a lista reserva. Quando a TV finalmente entrega a lista completa — às vezes
     * depois de bem mais de 8 s —, chama Apps.onUpdate(lista) e guarda para a próxima abertura.
     * Cada lista vem com .source = 'tv' | 'cache' | 'reserva'. Nunca rejeita.
     */
    function load() {
        var cached = readCache();
        return new Promise(function (resolve) {
            var answered = false;
            function answer(list, source) {
                if (answered) return false;
                answered = true;
                list.source = source;
                resolve(list);
                return true;
            }
            if (cached.length) answer(sortByName(cached), 'cache');
            var firstTimer = setTimeout(function () {
                if (answer(fallback('a TV ainda está listando os apps; aguardando'), 'reserva')) return;
            }, FIRST_WAIT_MS);

            requestFromTv().then(function (res) {
                clearTimeout(firstTimer);
                if (res.list.length) {
                    writeCache(res.list);
                    Diag.set('apps', res.list.length + ' apps (' + res.note + ')');
                    res.list.source = 'tv';
                    if (!answer(res.list, 'tv') && Apps.onUpdate) Apps.onUpdate(res.list);
                } else if (!answered) {
                    answer(fallback(res.note), 'reserva');
                } else {
                    Diag.set('apps', 'lista da TV falhou (' + res.note + ')' + (cached.length ? ' · usando a última lista salva' : ''));
                }
            });
        });
    }

    /** Pede a lista à TV, esperando até 90 s. Resolve {list, note}. */
    function requestFromTv() {
        if (pending) return pending;
        var started = Date.now();
        pending = new Promise(function (resolve) {
            var t = global.tizen, finished = false, timer = null;
            function done(list, note) {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                pending = null;
                var secs = Math.round((Date.now() - started) / 1000);
                resolve({ list: list, note: note + (secs >= 2 ? ', em ' + secs + ' s' : '') });
            }
            if (!t || !t.application || !t.application.getAppsInfo) { done([], 'API de apps indisponível'); return; }
            timer = setTimeout(function () { done([], 'a TV não respondeu em 90 s'); }, MAX_WAIT_MS);
            try {
                t.application.getAppsInfo(function (raw) {
                    raw = raw || [];
                    var list = normalize(raw);
                    // se o filtro de "apps visíveis" esconder tudo, mostra sem ele
                    if (!list.length && raw.length) list = normalize(raw, true);
                    done(list, raw.length + ' recebidos da TV');
                }, function (e) { done([], errText(e)); });
            } catch (e) {
                done([], errText(e));
            }
        });
        return pending;
    }

    /** Apps conhecidos que estão instalados (ou todos, se a TV não deixar conferir). */
    function fallback(reason) {
        var t = global.tizen, out = [], unverified = false;
        KNOWN.forEach(function (k) {
            var name = k[0], ids = k[1], hit = null, blocked = false;
            for (var i = 0; i < ids.length && !hit; i++) {
                try {
                    var info = t.application.getAppInfo(ids[i]);
                    if (info) hit = entry(ids[i], info.name || name, info.iconPath);
                } catch (e) {
                    if (!(e && e.name === 'NotFoundError')) blocked = true;
                }
            }
            if (hit) out.push(hit);
            else if (blocked) { unverified = true; out.push(entry(ids[0], name, '')); }
        });
        Diag.set('apps', reason + ' · lista reserva com ' + out.length + (unverified ? ' (sem conferir se estão instalados)' : ''));
        out = sortByName(out);
        out.verified = !unverified; // códigos confirmados pela TV: podem virar favoritos
        return out;
    }

    function normalize(list, loose) {
        var me = selfId(), seen = {}, out = [];
        list.forEach(function (a) {
            if (!a || !a.id || seen[a.id] || a.id === me) return;
            if ((!loose && a.show === false) || HIDDEN.test(a.id) || !a.name) return;
            seen[a.id] = true;
            out.push(entry(a.id, a.name, a.iconPath));
        });
        return sortByName(out);
    }

    function defaultFavorites(apps) {
        var out = [];
        DEFAULT_FAVORITES.forEach(function (key) {
            apps.forEach(function (a) {
                if (out.length < 8 && out.indexOf(a.id) < 0 && a.name.toLowerCase().indexOf(key) === 0) out.push(a.id);
            });
        });
        for (var i = 0; out.length < 5 && i < apps.length; i++) if (out.indexOf(apps[i].id) < 0) out.push(apps[i].id);
        return out;
    }

    /** Abre outro app. Resolve true/false. */
    function launch(id) {
        return new Promise(function (resolve) {
            try {
                global.tizen.application.launch(id, function () { resolve(true); }, function () { resolve(false); });
            } catch (e) {
                resolve(false);
            }
        });
    }

    var Apps = { load: load, normalize: normalize, defaultFavorites: defaultFavorites, launch: launch, onUpdate: null };
    global.Apps = Apps;
})(this);
