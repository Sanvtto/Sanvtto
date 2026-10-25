// Simula as APIs da TV Samsung (tizen.* e webapis.*) para os testes no navegador.
(function () {
    var COLORS = ['#E50914', '#FF0000', '#00A8E1', '#113CCF', '#FB0234', '#1DB954', '#E5A00D', '#8E8E93'];
    function icon(color, letter) {
        return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">'
            + '<rect width="256" height="256" rx="48" fill="' + color + '"/><text x="128" y="170" font-size="140" text-anchor="middle" '
            + 'fill="#fff" font-family="Arial" font-weight="bold">' + letter + '</text></svg>');
    }
    var names = window.__APP_NAMES || ['Netflix', 'YouTube', 'Prime Video', 'Disney+', 'Globoplay', 'Spotify', 'Plex', 'Internet',
        'Galeria', 'Música', 'Clima', 'Max', 'Rakuten TV', 'Twitch', 'Deezer'];
    var apps = names.map(function (n, i) {
        return { id: 'app' + i + '.' + n.replace(/\W/g, ''), name: n, iconPath: icon(COLORS[i % COLORS.length], n.charAt(0)), show: true };
    });
    // como numa TV de verdade: peças internas do sistema, sem ícone, e a Netflix de fábrica repetida
    if (!window.__APP_NAMES && !window.__NO_SYSTEM_APPS) {
        apps.push({ id: 'org.volt.search', name: 'Search', iconPath: '', show: true });
        apps.push({ id: 'org.volt.apps', name: 'Apps', iconPath: '/usr/apps/icon.png', show: true });
        apps.push({ id: 'org.tizen.caption', name: 'Closed Caption', iconPath: '', show: true });
        apps.push({ id: 'com.samsung.tv.store', name: 'Samsung Apps', iconPath: '/usr/x.png', show: true });
        apps.push({ id: 'Xa1b2C3d4E.EngineHelper', name: 'Engine Helper', iconPath: '', show: true });
        apps.push({ id: 'org.tizen.netflix-app', name: 'Netflix', iconPath: icon('#E50914', 'N'), show: true });
        apps.push({ id: 'com.samsung.tv.aria-video', name: 'aria-video', iconPath: '', show: true }); // Apple TV
        apps.push({ id: 'com.samsung.tv.tvplus', name: 'Samsung TV Plus', iconPath: icon('#1428A0', 'T'), show: true });
        apps.push({ id: 'com.samsung.tv.SmartThingsApp', name: 'SmartThings', iconPath: icon('#15BFFF', 'S'), show: true });
        apps.push({ id: 'xyz.AdPlayer', name: 'Ad Player', iconPath: icon('#999999', 'A'), show: true });
        apps.push({ id: 'abc.TvService', name: 'Tv Service', iconPath: icon('#999999', 'S'), show: true });
    }
    apps.push({ id: 'org.tizen.hidden', name: 'Serviço', show: true });
    apps.push({ id: 'escondido.App', name: 'Escondido', show: false });
    apps.push({ id: 'SnvttoTV01.SanvttoTV', name: 'Sanvtto TV', show: true });
    window.__launched = [];
    window.__screenSaver = [];
    window.tizen = {
        application: {
            getAppsInfo: function (ok, err) {
                if (window.__APPS_FAIL) {
                    setTimeout(function () { var e = new Error('acesso negado'); e.name = 'SecurityError'; err(e); }, 5);
                    return;
                }
                setTimeout(function () { ok(apps); }, window.__APPS_DELAY || 20);
            },
            launch: function (id, ok, err) {
                window.__launched.push(id);
                setTimeout(function () { id === 'quebrado' ? err(new Error('x')) : ok(); }, 5);
            },
            getAppInfo: function (id) {
                if (window.__APPINFO_SECURITY) { var s = new Error('sem permissão'); s.name = 'SecurityError'; throw s; }
                var found = apps.filter(function (a) { return a.id === id; })[0]
                    || (window.__INSTALLED_KNOWN || []).filter(function (a) { return a.id === id; })[0];
                if (!found) { var e = new Error('não instalado'); e.name = 'NotFoundError'; throw e; }
                return found;
            },
            getCurrentApplication: function () { return { appInfo: { id: 'SnvttoTV01.SanvttoTV' }, exit: function () { window.__exited = true; } }; }
        },
        tvinputdevice: { registerKey: function () {} },
        // HDMI 2 com aparelho ligado (o PS4); 1 e 3 vazias
        systeminfo: {
            getPropertyValue: function (prop, ok, err) {
                if (prop !== 'VIDEOSOURCE' || window.__NO_SOURCES) { setTimeout(function () { err && err(new Error('x')); }, 5); return; }
                setTimeout(function () {
                    ok({ connected: [{ type: 'HDMI', number: 2 }, { type: 'TV', number: 1 }],
                         disconnected: [{ type: 'HDMI', number: 1 }, { type: 'HDMI', number: 3 }] });
                }, 30);
            }
        },
        tvwindow: {
            setSource: function (src, ok, err) {
                window.__source = src;
                setTimeout(function () { window.__SOURCE_FAIL ? err(new Error('x')) : ok(src); }, 5);
            }
        }
    };
    window.webapis = { appcommon: {
        AppCommonScreenSaverState: { SCREEN_SAVER_ON: 1, SCREEN_SAVER_OFF: 0 },
        setScreenSaver: function (s) { window.__screenSaver.push(s); }
    } };
})();
