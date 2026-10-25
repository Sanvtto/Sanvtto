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

    /** Resolve com [{id, name, icon, color}] em ordem alfabética. Nunca rejeita. */
    function load() {
        return new Promise(function (resolve) {
            var t = global.tizen;
            if (!t || !t.application || !t.application.getAppsInfo) { resolve([]); return; }
            var timer = setTimeout(function () { resolve([]); }, 8000);
            try {
                t.application.getAppsInfo(function (list) {
                    clearTimeout(timer);
                    resolve(normalize(list || []));
                }, function () { clearTimeout(timer); resolve([]); });
            } catch (e) {
                clearTimeout(timer);
                resolve([]);
            }
        });
    }

    function normalize(list) {
        var me = selfId(), seen = {}, out = [];
        list.forEach(function (a) {
            if (!a || !a.id || seen[a.id] || a.id === me) return;
            if (a.show === false || HIDDEN.test(a.id) || !a.name) return;
            seen[a.id] = true;
            out.push({ id: a.id, name: String(a.name).trim(), icon: a.iconPath || '', color: colorFor(String(a.name)) });
        });
        out.sort(function (x, y) { return x.name.localeCompare(y.name, 'pt-BR', { sensitivity: 'base' }); });
        return out;
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
