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

    // Lista reserva: IDs oficiais dos apps mais comuns na Samsung, usada se a TV não entregar a lista completa.
    var KNOWN = [
        ['3201907018807', 'Netflix'],
        ['111299001912', 'YouTube'],
        ['3201910019365', 'Prime Video'],
        ['3201901017640', 'Disney+'],
        ['3201606009684', 'Spotify'],
        ['3201807016597', 'Apple TV'],
        ['3201512006963', 'Plex']
    ];

    var Diag = global.Store.Diag, errText = global.Store.errText;

    function entry(id, name, icon) {
        return { id: id, name: String(name).trim(), icon: icon || '', color: colorFor(String(name)) };
    }

    function sortByName(list) {
        list.sort(function (x, y) { return x.name.localeCompare(y.name, 'pt-BR', { sensitivity: 'base' }); });
        return list;
    }

    /** Resolve com [{id, name, icon, color}] em ordem alfabética. Nunca rejeita. */
    function load() {
        return new Promise(function (resolve) {
            var t = global.tizen, finished = false, timer = null;
            function done(list, note) {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                if (list.length) {
                    Diag.set('apps', list.length + ' apps (' + note + ')');
                    resolve(list);
                } else {
                    resolve(fallback(note));
                }
            }
            if (!t || !t.application || !t.application.getAppsInfo) { done([], 'API de apps indisponível'); return; }
            timer = setTimeout(function () { done([], 'a TV demorou mais de 8 s'); }, 8000);
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
    }

    /** Monta a lista com os apps conhecidos que estão instalados (ou todos, se a TV não deixar conferir). */
    function fallback(reason) {
        var t = global.tizen, out = [], unverified = false;
        KNOWN.forEach(function (k) {
            try {
                var info = t.application.getAppInfo(k[0]);
                out.push(entry(k[0], (info && info.name) || k[1], info && info.iconPath));
            } catch (e) {
                if (e && e.name === 'NotFoundError') return; // não instalado
                unverified = true;
                out.push(entry(k[0], k[1], ''));
            }
        });
        Diag.set('apps', 'lista da TV falhou (' + reason + ') · usando lista reserva com ' + out.length
            + (unverified ? ' (sem conferir se estão instalados)' : ''));
        return sortByName(out);
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

    global.Apps = { load: load, normalize: normalize, defaultFavorites: defaultFavorites, launch: launch };
})(this);
