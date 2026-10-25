// Simula as APIs da TV Samsung (tizen.* e webapis.*) para os testes no navegador.
(function () {
    var COLORS = ['#E50914', '#FF0000', '#00A8E1', '#113CCF', '#FB0234', '#1DB954', '#E5A00D', '#8E8E93'];
    function icon(color, letter) {
        return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">'
            + '<rect width="256" height="256" rx="48" fill="' + color + '"/><text x="128" y="170" font-size="140" text-anchor="middle" '
            + 'fill="#fff" font-family="Arial" font-weight="bold">' + letter + '</text></svg>');
    }
    var names = window.__APP_NAMES || ['Netflix', 'YouTube', 'Prime Video', 'Disney+', 'Globoplay', 'Spotify', 'Plex', 'Internet',
        'Galeria', 'Música', 'Clima', 'Max', 'Apple TV', 'Twitch', 'Deezer'];
    var apps = names.map(function (n, i) {
        return { id: 'app' + i + '.' + n.replace(/\W/g, ''), name: n, iconPath: i % 4 === 3 ? '' : icon(COLORS[i % COLORS.length], n.charAt(0)), show: true };
    });
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
        tvinputdevice: { registerKey: function () {} }
    };
    window.webapis = { appcommon: {
        AppCommonScreenSaverState: { SCREEN_SAVER_ON: 1, SCREEN_SAVER_OFF: 0 },
        setScreenSaver: function (s) { window.__screenSaver.push(s); }
    } };
})();
