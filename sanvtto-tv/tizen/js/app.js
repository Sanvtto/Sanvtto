/* Tela inicial, menu dos apps, ajustes, modo seguro e o roteamento das teclas. */
(function (global) {
    'use strict';
    var doc = global.document;
    var Prefs = global.Store.Prefs, Nav = global.Nav, K = Nav.KEY, Art = global.Art;
    var COLS = 5, PAD = 96, GAP = 44;
    var WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    var apps = [];
    var safeMode = false;
    var idleTimer = null;
    var lastDark = null;
    var mode = 'home'; // home | menu | settings | art
    var returnFocus = null;

    function $(id) { return doc.getElementById(id); }
    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function toast(msg) {
        var t = $('toast');
        t.textContent = msg;
        t.hidden = false;
        clearTimeout(toast.timer);
        toast.timer = setTimeout(function () { t.hidden = true; }, 3000);
    }

    // ---------------------------------------------------------------- proteção contra travamentos

    var CRASH_KEY = 'sv.crashes';

    function crashes() {
        try { return JSON.parse(global.localStorage.getItem(CRASH_KEY) || '[]'); } catch (e) { return []; }
    }

    function recordCrash() {
        var now = Date.now();
        var list = crashes().filter(function (t) { return now - t < 2 * 60 * 1000; });
        list.push(now);
        try { global.localStorage.setItem(CRASH_KEY, JSON.stringify(list)); } catch (e) { /* ignora */ }
    }

    function shouldUseSafeMode() {
        var now = Date.now();
        return crashes().filter(function (t) { return now - t < 30 * 60 * 1000; }).length >= 2;
    }

    global.addEventListener('error', recordCrash);
    global.addEventListener('unhandledrejection', recordCrash);

    // ---------------------------------------------------------------- tema e relógio

    function applyTheme() {
        var t = Prefs.get('theme');
        var dark = t === 2 || (t === 0 && global.Theme.isNight(new Date()));
        if (dark !== lastDark) {
            doc.body.classList.toggle('dark', dark);
            doc.body.classList.toggle('light', !dark);
            lastDark = dark;
        }
        var g = Prefs.get('glass');
        doc.body.classList.toggle('glass-med', g === 1);
        doc.body.classList.toggle('glass-low', g === 2);
    }

    function tick() {
        var d = new Date();
        $('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
        var s = WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
        $('date').textContent = s.charAt(0).toUpperCase() + s.slice(1);
        applyTheme();
    }

    // ---------------------------------------------------------------- apps

    function loadApps() {
        return global.Apps.load().then(function (list) {
            apps = list;
            if (!Prefs.has('favs') && list.length) Prefs.setFavorites(global.Apps.defaultFavorites(list));
            renderApps();
        });
    }

    function find(id) {
        for (var i = 0; i < apps.length; i++) if (apps[i].id === id) return apps[i];
        return null;
    }

    function tile(app, w, fav) {
        var h = Math.round(w * 9 / 16);
        var t = doc.createElement('div');
        t.className = 'tile' + (fav ? ' fav' : '');
        t.style.width = w + 'px';
        var card = doc.createElement('div');
        card.className = 'card focusable';
        card.style.height = h + 'px';
        card.setAttribute('data-app', app.id);
        var tint = doc.createElement('div');
        tint.className = 'tint';
        tint.style.backgroundColor = app.color;
        card.appendChild(tint);
        card.setAttribute('data-kind', fav ? 'fav' : 'app');
        var initial = doc.createElement('div');
        initial.className = 'initial';
        initial.textContent = app.name.charAt(0).toUpperCase();
        card.appendChild(initial);
        if (app.icon) {
            var img = doc.createElement('img');
            img.onload = function () { initial.style.display = 'none'; };
            img.onerror = function () { img.remove(); };
            img.src = app.icon;
            card.appendChild(img);
        }
        var edge = doc.createElement('div');
        edge.className = 'edge';
        card.appendChild(edge);
        var sheen = doc.createElement('div');
        sheen.className = 'sheen';
        card.appendChild(sheen);
        var label = doc.createElement('div');
        label.className = 'label';
        label.textContent = app.name;
        t.appendChild(card);
        t.appendChild(label);
        return t;
    }

    function renderApps() {
        var cur = Nav.current();
        var curKey = cur && cur.getAttribute('data-app') ? cur.getAttribute('data-kind') + ':' + cur.getAttribute('data-app') : null;

        if (safeMode) { renderSafe(); return; }

        var avail = 1920 - PAD * 2 - 16;
        var favW = Math.floor((avail - GAP * 3) / 4);
        var gridW = Math.floor((avail - GAP * (COLS - 1)) / COLS);

        var favRow = $('favRow'), grid = $('grid');
        favRow.innerHTML = '';
        grid.innerHTML = '';
        favRow.style.transform = '';
        var frag = doc.createDocumentFragment();
        var favs = Prefs.favorites().map(find).filter(Boolean);
        favs.forEach(function (a) { frag.appendChild(tile(a, favW, true)); });
        favRow.appendChild(frag);
        $('favHint').hidden = favs.length > 0;

        var row = null;
        frag = doc.createDocumentFragment();
        apps.forEach(function (a, i) {
            if (i % COLS === 0) {
                row = doc.createElement('div');
                row.className = 'grid-row';
                frag.appendChild(row);
            }
            row.appendChild(tile(a, gridW, false));
        });
        grid.appendChild(frag);

        var restore = curKey ? doc.querySelector('[data-kind="' + curKey.split(':')[0] + '"][data-app="' + cssEscape(curKey.slice(curKey.indexOf(':') + 1)) + '"]') : null;
        if (restore) Nav.focus(restore);
        else if (!cur || !doc.body.contains(cur) || !cur.getAttribute('data-app')) {
            Nav.focus(doc.querySelector('#favRow .card') || doc.querySelector('#grid .card') || $('btnArt'));
        }
        scrollTo(Nav.current());
    }

    function cssEscape(s) { return String(s).replace(/(["\\])/g, '\\$1'); }

    function launch(id) {
        var a = find(id);
        return global.Apps.launch(id).then(function (ok) {
            if (!ok) toast('Não foi possível abrir ' + (a ? a.name : 'o app'));
            return ok;
        });
    }

    // ---------------------------------------------------------------- rolagem suave

    function offsetTop(el, stop) {
        var y = 0;
        while (el && el !== stop) { y += el.offsetTop; el = el.offsetParent; }
        return y;
    }

    function scrollTo(el) {
        if (!el || mode !== 'home') return;
        var content = $('content');
        var top = offsetTop(el, null);
        var max = Math.max(0, content.offsetHeight - 1080);
        var y = el.closest('#grid') ? Math.min(max, Math.max(0, top - 420)) : 0;
        content.style.transform = 'translateY(' + (-y) + 'px)';

        var row = el.closest('#favRow');
        if (row) {
            var t = el.closest('.tile');
            var left = t.offsetLeft, right = left + t.offsetWidth;
            var view = 1920 - PAD * 2;
            var shift = row.__shift || 0;
            if (right - shift > view - 40) shift = right - view + 40;
            if (left - shift < 0) shift = left;
            row.__shift = shift;
            row.style.transform = 'translateX(' + (-shift) + 'px)';
        }
    }

    // ---------------------------------------------------------------- menu do app

    function openMenu(card) {
        var id = card.getAttribute('data-app');
        var a = find(id);
        if (!a) return;
        var favs = Prefs.favorites();
        var pos = favs.indexOf(id);
        var items = [['Abrir', function () { launch(id); }]];
        if (pos >= 0) {
            items.push(['Remover dos favoritos', function () { favs.splice(pos, 1); saveFavs(favs, null); }]);
            if (pos > 0) items.push(['Mover para a esquerda', function () { favs.splice(pos, 1); favs.splice(pos - 1, 0, id); saveFavs(favs, 'fav:' + id); }]);
            if (pos < favs.length - 1) items.push(['Mover para a direita', function () { favs.splice(pos, 1); favs.splice(pos + 1, 0, id); saveFavs(favs, 'fav:' + id); }]);
        } else {
            items.push(['Adicionar aos favoritos', function () { favs.push(id); saveFavs(favs, 'fav:' + id); }]);
        }
        $('menuTitle').textContent = a.name;
        var box = $('menuItems');
        box.innerHTML = '';
        items.forEach(function (it) {
            var d = doc.createElement('div');
            d.className = 'menu-item focusable';
            d.textContent = it[0];
            d.__run = it[1];
            box.appendChild(d);
        });
        returnFocus = card;
        $('menu').hidden = false;
        mode = 'menu';
        Nav.setScope($('menu'));
        Nav.focus(box.firstChild);
    }

    function closeMenu(focusKey) {
        $('menu').hidden = true;
        mode = 'home';
        Nav.setScope($('home'));
        var target = null;
        if (focusKey) target = doc.querySelector('[data-kind="' + focusKey.split(':')[0] + '"][data-app="' + cssEscape(focusKey.slice(focusKey.indexOf(':') + 1)) + '"]');
        if (!target && returnFocus && doc.body.contains(returnFocus)) target = returnFocus;
        Nav.focus(target || Nav.first());
        scrollTo(Nav.current());
    }

    function saveFavs(favs, focusKey) {
        Prefs.setFavorites(favs);
        renderApps();
        closeMenu(focusKey);
    }

    // ---------------------------------------------------------------- ajustes

    var SETTINGS = [
        ['h', 'Aparência'],
        ['c', 'Tema', 'theme', ['Automático (pôr do sol)', 'Claro', 'Escuro'], [0, 1, 2]],
        ['c', 'Transparência', 'glass', ['Vidro', 'Média', 'Reduzida'], [0, 1, 2]],
        ['h', 'Modo quadro'],
        ['a', 'Abrir o quadro agora', function () { closeSettings(); openArt(); }],
        ['c', 'Abrir sozinho após', 'idleMin', ['Nunca', '2 min', '5 min', '10 min', '15 min', '30 min'], [0, 2, 5, 10, 15, 30]],
        ['c', 'Estilo', 'frameStyle', Art.STYLES.map(function (s) { return s.name; }), Art.STYLES.map(function (s) { return s.id; })],
        ['c', 'Cor do passe-partout', 'matColor', Art.MATS.map(function (m) { return m.name; }), Art.MATS.map(function (m) { return m.id; })],
        ['c', 'Trocar obra a cada', 'artInterval', ['1 min', '5 min', '15 min', '30 min', '1 hora', '3 horas'], [1, 5, 15, 30, 60, 180]],
        ['t', 'Escurecer à noite', 'nightDim'],
        ['t', 'Mostrar relógio', 'artClock'],
        ['a', 'Baixar novas obras agora', function () {
            toast('Baixando obras em segundo plano…');
            global.Store.refreshArt(true).then(function (n) { toast(n ? n + ' obras novas' : 'Sem obras novas (verifique a internet)'); });
        }],
        ['h', 'Sistema'],
        ['a', 'Recarregar lista de apps', function () { loadApps().then(function () { toast(apps.length + ' apps'); }); }],
        ['i', 'Abrir ao ligar a TV', 'Configurações › Geral › Recursos Inteligentes › Executar último app']
    ];

    function openSettings() {
        returnFocus = Nav.current();
        mode = 'settings';
        var list = $('settingsList');
        list.innerHTML = '';
        list.style.transform = '';
        SETTINGS.forEach(function (s) {
            if (s[0] === 'h') {
                var h = doc.createElement('div');
                h.className = 'set-header';
                h.textContent = s[1].toUpperCase();
                list.appendChild(h);
                return;
            }
            var row = doc.createElement('div');
            row.className = 'set-row focusable';
            var l = doc.createElement('span');
            l.textContent = s[1];
            var v = doc.createElement('span');
            v.className = 'value';
            row.appendChild(l);
            row.appendChild(v);
            if (s[0] === 'c') {
                var idx = Math.max(0, s[4].indexOf(Prefs.get(s[2])));
                v.textContent = s[3][idx];
                row.__run = function () {
                    idx = (idx + 1) % s[4].length;
                    Prefs.set(s[2], s[4][idx]);
                    v.textContent = s[3][idx];
                    if (s[2] === 'theme' || s[2] === 'glass') applyTheme();
                    if (s[2] === 'idleMin') resetIdle();
                };
            } else if (s[0] === 't') {
                v.textContent = Prefs.get(s[2]) ? 'Sim' : 'Não';
                row.__run = function () {
                    var on = !Prefs.get(s[2]);
                    Prefs.set(s[2], on);
                    v.textContent = on ? 'Sim' : 'Não';
                };
            } else if (s[0] === 'a') {
                v.textContent = '›';
                row.__run = s[2];
            } else {
                v.textContent = s[2];
                v.style.fontSize = '22px';
                row.__run = function () {};
            }
            list.appendChild(row);
        });
        $('settings').hidden = false;
        doc.body.classList.add('in-settings');
        applyTheme();
        Nav.setScope($('settings'));
        Nav.focus(Nav.first());
    }

    function scrollSettings(el) {
        var list = $('settingsList');
        var y = Math.max(0, Math.min(el.offsetTop - 360, list.offsetHeight - 900));
        list.style.transform = 'translateY(' + (-y) + 'px)';
    }

    function closeSettings() {
        $('settings').hidden = true;
        doc.body.classList.remove('in-settings');
        applyTheme();
        mode = 'home';
        Nav.setScope($('home'));
        Nav.focus(returnFocus && doc.body.contains(returnFocus) ? returnFocus : Nav.first());
    }

    // ---------------------------------------------------------------- quadro

    var artReturnFocus = null;

    function openArt() {
        if (safeMode) return;
        artReturnFocus = Nav.current();
        mode = 'art';
        Art.open();
    }

    Art.onClose = function () {
        mode = 'home';
        Nav.setScope($('home'));
        if (artReturnFocus && doc.body.contains(artReturnFocus)) Nav.focus(artReturnFocus);
        resetIdle();
        loadBackground();
    };

    function resetIdle() {
        clearTimeout(idleTimer);
        var m = Prefs.get('idleMin');
        if (m > 0 && !safeMode) {
            idleTimer = setTimeout(function () {
                if (mode === 'home' && !doc.hidden) openArt();
            }, m * 60000);
        }
    }

    // ---------------------------------------------------------------- fundo desfocado (barato: canvas minúsculo ampliado)

    var bgKey = '';

    function loadBackground() {
        if (safeMode) return;
        global.Store.listArt().then(function (all) {
            var idx = Prefs.get('artIndex') || 0;
            var a = all.length ? all[((idx % all.length) + all.length) % all.length] : null;
            var key = a ? a.id : 'gen:' + idx;
            if (key === bgKey) return;
            bgKey = key;
            var draw = function (src) {
                var cv = $('bgCanvas'), c = cv.getContext('2d');
                c.imageSmoothingEnabled = true;
                // reduz em duas etapas para um desfoque mais suave
                var tmp = doc.createElement('canvas');
                tmp.width = 24; tmp.height = 14;
                tmp.getContext('2d').drawImage(src, 0, 0, 24, 14);
                c.clearRect(0, 0, cv.width, cv.height);
                c.drawImage(tmp, 0, 0, cv.width, cv.height);
                cv.classList.add('shown');
            };
            if (!a) { draw(Art.generated(idx, 160, 90)); return; }
            var url = global.URL.createObjectURL(a.blob);
            var img = new global.Image();
            img.onload = function () { global.URL.revokeObjectURL(url); draw(img); };
            img.onerror = function () { global.URL.revokeObjectURL(url); };
            img.src = url;
        });
    }

    // ---------------------------------------------------------------- modo seguro

    function renderSafe() {
        $('main').hidden = true;
        $('safe').hidden = false;
        $('btnArt').hidden = true;
        var list = $('safeList');
        list.innerHTML = '';
        apps.forEach(function (a) {
            var p = doc.createElement('div');
            p.className = 'pill glass focusable';
            p.textContent = a.name;
            p.setAttribute('data-launch', a.id);
            list.appendChild(p);
        });
        if (!Nav.current() || !doc.body.contains(Nav.current())) Nav.focus(doc.querySelector('#safe .pill'));
    }

    function leaveSafe() {
        try { global.localStorage.removeItem(CRASH_KEY); } catch (e) { /* ignora */ }
        global.location.reload();
    }

    // ---------------------------------------------------------------- teclas

    var enterTimer = null, enterHandled = false, keyupSupported = false, enterRepeats = 0;

    function activate(el) {
        if (!el) return;
        if (el.__run) {
            var run = el.__run;
            if (mode === 'menu') closeMenu(null);
            run();
            return;
        }
        var action = el.getAttribute('data-action');
        if (action === 'art') openArt();
        else if (action === 'settings') openSettings();
        else if (action === 'leaveSafe') leaveSafe();
        else if (el.getAttribute('data-launch')) launch(el.getAttribute('data-launch'));
        else if (el.getAttribute('data-app')) launch(el.getAttribute('data-app'));
    }

    function longPress(el) {
        if (mode === 'home' && el && el.getAttribute('data-app')) openMenu(el);
        else activate(el);
    }

    function onKeyDown(e) {
        var code = e.keyCode;
        resetIdle();
        if (mode === 'art') { e.preventDefault(); Art.handleKey(code); return; }

        if (code === K.ENTER) {
            e.preventDefault();
            var el = Nav.current();
            if (!keyupSupported) {
                // TV que não envia "soltar tecla": OK abre na hora; segurar (repetições) abre o menu
                if (e.repeat) { if (++enterRepeats === 4) longPress(el); return; }
                enterRepeats = 0;
                activate(el);
                return;
            }
            if (e.repeat || enterTimer) return;
            enterHandled = false;
            enterTimer = setTimeout(function () { enterTimer = null; enterHandled = true; longPress(el); }, 650);
            return;
        }
        if (code === K.BACK || code === K.ESC || code === K.BACKSPACE) {
            e.preventDefault();
            if (mode === 'menu') closeMenu(null);
            else if (mode === 'settings') closeSettings();
            else { Nav.focus(doc.querySelector('#favRow .card') || Nav.first()); scrollTo(Nav.current()); }
            return; // a tela inicial nunca fecha com "voltar"
        }
        var dir = code === K.LEFT ? 'left' : code === K.RIGHT ? 'right' : code === K.UP ? 'up' : code === K.DOWN ? 'down' : null;
        if (dir) {
            e.preventDefault();
            Nav.move(dir);
        }
    }

    function onKeyUp(e) {
        if (e.keyCode !== K.ENTER) return;
        if (!keyupSupported) { keyupSupported = true; return; } // a 1ª vez só descobre que a TV suporta
        e.preventDefault();
        if (enterTimer) {
            clearTimeout(enterTimer);
            enterTimer = null;
            if (!enterHandled) activate(Nav.current());
        }
    }

    Nav.onFocus = function (el) {
        if (mode === 'home') scrollTo(el);
        else if (mode === 'settings') scrollSettings(el);
        else if (mode === 'art') Art.scrollTo(el);
    };

    // ---------------------------------------------------------------- início

    function start() {
        safeMode = shouldUseSafeMode();
        Nav.registerKeys();
        Nav.setScope($('home'));
        applyTheme();
        tick();
        setInterval(tick, 15000);
        doc.addEventListener('keydown', onKeyDown);
        doc.addEventListener('keyup', onKeyUp);
        doc.addEventListener('visibilitychange', function () {
            if (doc.hidden) { if (Art.isOpen()) Art.close(); clearTimeout(idleTimer); }
            else { resetIdle(); loadApps(); tick(); }
        });
        if (safeMode) renderSafe();
        Nav.focus($('btnArt').hidden ? Nav.first() : $('btnArt'));
        loadApps();
        loadBackground();
        resetIdle();
        if (!safeMode) global.Store.refreshArt(false).then(function (n) { if (n) loadBackground(); });
    }

    global.SanvttoApp = { openMenu: openMenu, openSettings: openSettings, openArt: openArt, reloadApps: loadApps, mode: function () { return mode; } };
    start();
})(this);
