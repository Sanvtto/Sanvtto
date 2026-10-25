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

    var allApps = [];
    var inputs = []; // entradas HDMI

    function loadInputs() {
        return global.Apps.inputs().then(function (list) {
            inputs = list;
            // uma vez só: o PS4 (HDMI 1) entra nos favoritos, no fim da fileira
            if (!Prefs.get('ps4Fav') && Prefs.has('favs')) {
                var favs = Prefs.favorites();
                if (favs.indexOf('source:HDMI:1') < 0) favs.push('source:HDMI:1');
                Prefs.setFavorites(favs);
                Prefs.set('ps4Fav', true);
            }
            renderApps();
        });
    }

    function setApps(list) {
        allApps = list;
        list = global.Apps.visible(list);
        apps = list;
        // favoritos padrão só com a lista verdadeira da TV (a reserva pode ter códigos diferentes)
        if (!Prefs.has('favs') && list.length && (list.source !== 'reserva' || list.verified)) {
            Prefs.setFavorites(global.Apps.defaultFavorites(list));
        }
        renderApps();
    }

    // a TV às vezes entrega a lista completa bem depois: atualiza a tela quando chegar
    global.Apps.onUpdate = setApps;

    function loadApps() {
        return global.Apps.load().then(setApps);
    }

    function find(id) {
        for (var i = 0; i < apps.length; i++) if (apps[i].id === id) return apps[i];
        for (var j = 0; j < inputs.length; j++) if (inputs[j].id === id) return inputs[j];
        return null;
    }

    function hiddenIds() {
        var h = Prefs.get('hiddenApps');
        return Array.isArray(h) ? h : [];
    }

    function tile(app, w, fav, kind) {
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
        tint.style.backgroundColor = app.accent || app.color;
        card.appendChild(tint);
        card.setAttribute('data-kind', fav ? 'fav' : (kind || 'app'));
        var initial = doc.createElement('div');
        initial.className = 'initial';
        initial.textContent = app.name.charAt(0).toUpperCase();
        card.appendChild(initial);
        if (app.brand) {
            // ícone de marca (YouTube, Prime Video, PS4...) desenhado pelo próprio app
            initial.style.display = 'none';
            card.appendChild(global.Brands.render(app.brand, doc));
        } else if (app.icon) {
            var img = doc.createElement('img');
            img.onload = function () {
                initial.style.display = 'none';
                // primeira vez: tira a cor principal do ícone (o mesmo app pode estar nos favoritos e na grade)
                var c = app.accent || iconColor(img);
                if (!c) return;
                tint.style.backgroundColor = c;
                if (!app.accent) {
                    app.accent = c;
                    saveAccent(app.id, c);
                }
                if (Nav.current() === card) setAccent(c);
            };
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

    // ---------------------------------------------------------------- cor do app em foco no fundo

    /** Cor principal do ícone (média ponderada pelos pixels mais coloridos). Null se não der para ler. */
    function iconColor(img) {
        try {
            var c = doc.createElement('canvas');
            c.width = 20; c.height = 20;
            var x = c.getContext('2d');
            x.drawImage(img, 0, 0, 20, 20);
            var d = x.getImageData(0, 0, 20, 20).data;
            var r = 0, g = 0, b = 0, w = 0;
            for (var i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 128) continue;
                var R = d[i], G = d[i + 1], B = d[i + 2];
                var mx = Math.max(R, G, B), mn = Math.min(R, G, B);
                var sat = mx ? (mx - mn) / mx : 0;
                var wt = 0.08 + sat * sat * 4;         // cor viva pesa muito mais que cinza
                if (mx < 30) wt *= 0.3;                // quase preto
                if (mn > 225) wt *= 0.15;              // quase branco (fundo do ícone)
                r += R * wt; g += G * wt; b += B * wt; w += wt;
            }
            if (!w) return null;
            return '#' + [r / w, g / w, b / w].map(function (v) {
                var h = Math.round(v).toString(16);
                return h.length < 2 ? '0' + h : h;
            }).join('');
        } catch (e) {
            return null; // ícone que a TV não deixa ler: fica a cor padrão
        }
    }

    // junta as cores numa lista em memória e grava de uma vez (várias chegam juntas ao carregar a grade)
    var accentSave = null, accentPending = null;
    function saveAccent(id, color) {
        if (!accentPending) accentPending = Prefs.get('accents') || {};
        accentPending[id] = color;
        clearTimeout(accentSave);
        accentSave = setTimeout(function () {
            Prefs.set('accents', accentPending);
            accentPending = null;
        }, 500);
    }

    function shadeHex(hex, f) {
        var n = parseInt(hex.slice(1), 16);
        var c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (v) { return Math.round(v * (1 + f)); });
        return 'rgb(' + c.join(',') + ')';
    }

    // duas camadas que trocam com fade de opacidade: o jeito mais leve de animar a tela inteira na TV
    var accentFront = 0, accentTimer = null, accentNow = '';
    function setAccent(color) {
        clearTimeout(accentTimer);
        // espera a navegação "assentar" para não piscar ao passar rápido pelos apps
        accentTimer = setTimeout(function () {
            if ((color || '') === accentNow) return;
            accentNow = color || '';
            var layers = [$('accentA'), $('accentB')];
            if (color) {
                var back = layers[1 - accentFront];
                back.style.background = 'radial-gradient(120% 95% at 50% 28%, ' + color + ' 0%, ' + shadeHex(color, -0.6) + ' 100%)';
                back.classList.add('on');
                layers[accentFront].classList.remove('on');
                accentFront = 1 - accentFront;
            } else {
                layers[0].classList.remove('on');
                layers[1].classList.remove('on');
            }
        }, 90);
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

        var inputRow = $('inputRow');
        inputRow.innerHTML = '';
        var hidden = hiddenIds();
        var shownInputs = inputs.filter(function (x) { return hidden.indexOf(x.id) < 0; });
        $('inputsTitle').hidden = !shownInputs.length;
        shownInputs.forEach(function (x) { inputRow.appendChild(tile(x, gridW, false, 'input')); });

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

        if (mode !== 'home') return; // lista chegou com ajustes/menu/quadro abertos: não rouba o foco
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
        var go = a && a.input ? global.Apps.launchInput(a.input) : global.Apps.launch(id);
        return go.then(function (ok) {
            if (!ok) {
                toast(a && a.input ? 'Não consegui trocar para ' + a.name + ' — use o botão de fonte (Source) do controle'
                    : 'Não foi possível abrir ' + (a ? a.name : 'o app'));
            }
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
        if (a.input) {
            items.push(['Renomear (' + a.name + ')', function () { openRenameMenu(a); }]);
        }
        items.push([a.input ? 'Ocultar esta entrada' : 'Ocultar este app', function () {
            var hidden = Prefs.get('hiddenApps');
            hidden = Array.isArray(hidden) ? hidden : [];
            if (hidden.indexOf(id) < 0) hidden.push(id);
            Prefs.set('hiddenApps', hidden);
            if (pos >= 0) favs.splice(pos, 1);
            Prefs.setFavorites(favs);
            setApps(allApps);
            closeMenu(null);
            toast(a.name + ' foi ocultado (Ajustes › Apps ocultos para mostrar de novo)');
        }]);
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

    /** Escolher o nome de uma entrada HDMI numa lista pronta (sem digitar). */
    function openRenameMenu(a) {
        var opts = [['HDMI ' + a.input + ' (sem nome)', '']].concat(global.Apps.INPUT_PRESETS.map(function (p) { return [p[0], p[0]]; }));
        $('menuTitle').textContent = 'O que está ligado na HDMI ' + a.input + '?';
        var box = $('menuItems');
        box.innerHTML = '';
        opts.forEach(function (o) {
            var d = doc.createElement('div');
            d.className = 'menu-item focusable';
            d.textContent = o[0];
            d.__run = function () {
                global.Apps.renameInput(a.input, o[1]);
                loadInputs().then(function () {
                    var t = doc.querySelector('[data-app="' + cssEscape(a.id) + '"]');
                    if (t) { Nav.focus(t); scrollTo(t); }
                });
                toast('HDMI ' + a.input + ' agora é ' + (o[1] || 'HDMI ' + a.input));
            };
            box.appendChild(d);
        });
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
        ['c', 'Trocar obra a cada', 'artSeconds', ['10 segundos', '30 segundos', '1 minuto', '5 minutos', '15 minutos', '1 hora'], [10, 30, 60, 300, 900, 3600]],
        ['t', 'Escurecer à noite', 'nightDim'],
        ['t', 'Mostrar relógio', 'artClock'],
        ['a', 'Baixar novas obras agora', function () {
            toast('Baixando obras em segundo plano…');
            global.Store.refreshArt(true).then(function (n) { toast(n ? n + ' obras novas' : 'Sem obras novas (verifique a internet)'); });
        }],
        ['h', 'Sistema'],
        ['a', 'Recarregar lista de apps', function () { loadApps().then(function () { toast(apps.length + ' apps'); }); }],
        ['a', 'Mostrar apps ocultos', function () {
            var n = global.Apps.hiddenCount();
            Prefs.set('hiddenApps', []);
            setApps(allApps);
            toast(n ? n + (n === 1 ? ' app voltou' : ' apps voltaram') + ' para a lista' : 'Nenhum app oculto');
        }],
        ['i', 'Abrir ao ligar a TV', 'Todas as configurações › Geral e Privacidade › Opções da tela inicial › Executar último app'],
        ['h', 'Diagnóstico'],
        ['i', 'Apps', function () { return global.Store.Diag.get('apps'); }],
        ['i', 'Obras', function () { return global.Store.Diag.get('art'); }],
        ['i', 'Versão', function () { return 'Sanvtto TV 1.5 · ' + (navigator.userAgent.match(/Tizen [\d.]+/) || ['navegador'])[0]; }]
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
                v.textContent = typeof s[2] === 'function' ? s[2]() : s[2];
                v.className = 'value info';
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
        // se a grade foi refeita enquanto os ajustes estavam abertos, volta para o primeiro app
        Nav.focus(returnFocus && doc.body.contains(returnFocus) ? returnFocus
            : (doc.querySelector('#favRow .card') || doc.querySelector('#grid .card') || Nav.first()));
        scrollTo(Nav.current());
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
                if (mode === 'art' || doc.hidden) return;
                // parado em qualquer tela do app (ajustes, menu de um app): fecha e vira quadro
                if (mode === 'menu') closeMenu(null);
                if (mode === 'settings') closeSettings();
                openArt();
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
            var url = a.blob ? global.URL.createObjectURL(a.blob) : a.url;
            var img = new global.Image();
            var free = function () { if (a.blob) global.URL.revokeObjectURL(url); };
            img.onload = function () { free(); draw(img); };
            img.onerror = free;
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
        if (mode === 'home') {
            scrollTo(el);
            var item = el.getAttribute('data-app') ? find(el.getAttribute('data-app')) : null;
            setAccent(item ? (item.accent || item.color) : null);
        }
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
        loadInputs();
        loadBackground();
        resetIdle();
        if (!safeMode) global.Store.refreshArt(false).then(function (n) { if (n) loadBackground(); });
    }

    global.SanvttoApp = { openMenu: openMenu, openSettings: openSettings, openArt: openArt, reloadApps: loadApps, mode: function () { return mode; } };
    start();
})(this);
