/* Apps instalados na TV via API oficial do Tizen (tizen.application). */
(function (global) {
    'use strict';

    // Ordem dos favoritos na primeira abertura (os nomes variam por região, então comparamos o nome).
    var DEFAULT_FAVORITES = ['netflix', 'youtube', 'prime video', 'disney', 'globoplay', 'max', 'spotify', 'plex', 'apple tv'];

    // Apps internos do sistema (Smart Hub, serviços, teclados...) que não fazem sentido na grade.
    // Mantém os da Samsung que são apps de verdade: navegador, Netflix, Prime Video, Globoplay, TV Plus.
    // (filtro baseado no do projeto Free My TV: github.com/simbasjungles/free-my-tv)
    var HIDDEN = new RegExp('^(org\\.volt\\.|org\\.tizen\\.(?!browser$|netflix|primevideo$|globoplay)'
        + '|com\\.samsung\\.(?!tv\\.tvplus|tvplus))|\\.(service|widget|ime|keyboard)$', 'i');

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
        ['Netflix', ['RN1MCdNq8t.Netflix', 'org.tizen.netflix-app', '3201907018807']],
        ['YouTube', ['9Ur5IzDKqV.TizenYouTube', '111299001912']],
        ['Prime Video', ['evKhCgZelL.AmazonIgnitionLauncher2', 'org.tizen.primevideo', '3201910019365']],
        ['Disney+', ['MCmYXNxgcu.DisneyPlus', '3201901017640']],
        ['HBO Max', ['NvZ26VG9Yw.HBOGOLAG']],
        ['Globoplay', ['org.tizen.globoplayapp', '3201908019041']],
        ['Spotify', ['rJeHak5zRg.Spotify', '3201606009684']],
        ['Deezer', ['cexr1qp97S.Deezer']],
        ['YouTube Kids', ['5SLwh7m3En.TizenYouTubeKids']],
        ['Apple TV', ['3201807016597']],
        ['Plex', ['kIciSQlYEM.plex', '3201512006963']]
    ];

    /** Ícone local do Tizen precisa de file:// para abrir dentro do app. */
    function iconUrl(p) {
        if (!p) return '';
        return p.charAt(0) === '/' ? 'file://' + p : p;
    }

    function hiddenByUser() {
        var h = global.Store.Prefs.get('hiddenApps');
        return Array.isArray(h) ? h : [];
    }

    var CACHE_KEY = 'sv.appsCache';
    var FIRST_WAIT_MS = 8000;   // espera inicial antes de mostrar algo
    var MAX_WAIT_MS = 90000;    // TVs lentas podem demorar bastante para listar tudo

    var Diag = global.Store.Diag, errText = global.Store.errText;

    function entry(id, name, icon) {
        name = String(name).trim();
        return { id: id, name: name, icon: iconUrl(icon), color: colorFor(name), brand: global.Brands.forApp(name, !!icon) };
    }

    // ------------------------------------------------------------------ entradas HDMI (PS4, Xbox...)

    // Nomes prontos para escolher no controle, sem precisar digitar. [nome, tipo do desenho]
    var INPUT_PRESETS = [
        ['PS4', 'playstation'], ['PS5', 'playstation'], ['Xbox', 'game'], ['Nintendo Switch', 'game'],
        ['Computador', 'pc'], ['Apple TV', 'appletv'], ['Chromecast', 'tv'], ['Fire TV', 'tv'],
        ['Decodificador', 'tv'], ['Blu-ray / DVD', 'tv'], ['Soundbar', 'tv']
    ];

    function inputNames() {
        var n = global.Store.Prefs.get('inputNames');
        return n && typeof n === 'object' ? n : {};
    }

    function inputEntry(num, connected) {
        var label = inputNames()[num] || '';
        var kind = 'hdmi';
        INPUT_PRESETS.forEach(function (p) { if (p[0] === label) kind = p[1]; });
        return {
            id: 'source:HDMI:' + num, input: num, connected: connected,
            name: label || 'HDMI ' + num, icon: '', color: '#2C2C34',
            brand: global.Brands.forInput(kind)
        };
    }

    var sources = {}; // objetos de fonte devolvidos pela TV, por número da HDMI

    /** Lista as entradas HDMI (as conectadas primeiro). Sem a API, mostra HDMI 1 a 3. Nunca rejeita. */
    function inputs() {
        return new Promise(function (resolve) {
            var t = global.tizen, done = false;
            var on = {};
            function finish(list) {
                if (done) return;
                done = true;
                var nums = {};
                list.forEach(function (s) { if (s && s.type === 'HDMI' && s.number >= 1 && s.number <= 4) nums[s.number] = nums[s.number] || !!on[s.number]; });
                if (!Object.keys(nums).length) { nums = { 1: false, 2: false, 3: false }; }
                var out = Object.keys(nums).map(function (n) { return inputEntry(+n, !!nums[n]); });
                out.sort(function (a, b) { return (b.connected - a.connected) || (a.input - b.input); });
                resolve(out);
            }
            setTimeout(function () { finish([]); }, 4000);
            try {
                t.systeminfo.getPropertyValue('VIDEOSOURCE', function (v) {
                    var list = [];
                    // aparelho em espera (PS4 em repouso) aparece como "desconectado": mostra também
                    (v && v.connected || []).forEach(function (s) {
                        if (s && s.type === 'HDMI') { on[s.number] = true; sources[s.number] = s; }
                        list.push(s);
                    });
                    (v && v.disconnected || []).forEach(function (s) {
                        if (s && s.type === 'HDMI' && !sources[s.number]) sources[s.number] = s;
                        list.push(s);
                    });
                    finish(list);
                }, function () { finish([]); });
            } catch (e) {
                finish([]);
            }
        });
    }

    /** Troca para a entrada HDMI e mostra a imagem dela (o "viewer" da Samsung). Resolve true/false. */
    function launchInput(num) {
        return new Promise(function (resolve) {
            var t = global.tizen;
            function showViewer(ok) {
                launch('org.tizen.tv-viewer').then(function (shown) { resolve(ok && shown); });
            }
            try {
                var src = sources[num] || { type: 'HDMI', number: num };
                t.tvwindow.setSource(src, function () { showViewer(true); }, function () { showViewer(false); });
            } catch (e) {
                showViewer(false);
            }
        });
    }


    function sortByName(list) {
        list.sort(function (x, y) { return x.name.localeCompare(y.name, 'pt-BR', { sensitivity: 'base' }); });
        return list;
    }

    function readCache() {
        try {
            var c = JSON.parse(global.localStorage.getItem(CACHE_KEY) || 'null');
            // refaz cada item (ícones de marca podem ter mudado entre versões)
            return Array.isArray(c) ? c.filter(function (a) { return a && a.id && a.name; })
                .map(function (a) { return entry(a.id, a.name, a.icon); }) : [];
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
        var known = {};
        KNOWN.forEach(function (k) { k[1].forEach(function (id) { known[id] = true; }); });
        list.forEach(function (a) {
            if (!a || !a.id || seen[a.id] || a.id === me) return;
            if ((!loose && a.show === false) || HIDDEN.test(a.id) || !a.name) return;
            // app sem ícone é quase sempre peça interna do sistema (os quadrados só com letra)
            if (!loose && !a.iconPath && !known[a.id]) return;
            seen[a.id] = true;
            out.push(entry(a.id, a.name, a.iconPath));
        });
        // Netflix vem duas vezes em algumas TVs (a de fábrica e a da loja): fica só a da loja
        var storeNetflix = out.some(function (x) { return /\.Netflix$/.test(x.id); });
        if (storeNetflix) out = out.filter(function (x) { return x.id.indexOf('org.tizen.netflix') !== 0; });
        // mesmo nome repetido: fica um só
        var byName = {};
        out = out.filter(function (x) {
            var k = x.name.toLowerCase();
            if (byName[k]) return false;
            byName[k] = true;
            return true;
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

    /** Tira os apps que o usuário mandou ocultar. */
    function visible(list) {
        var hidden = hiddenByUser();
        if (!hidden.length) return list;
        var out = list.filter(function (a) { return hidden.indexOf(a.id) < 0; });
        out.source = list.source;
        out.verified = list.verified;
        return out;
    }

    var Apps = { load: load, normalize: normalize, defaultFavorites: defaultFavorites, launch: launch, onUpdate: null,
        inputs: inputs, launchInput: launchInput, INPUT_PRESETS: INPUT_PRESETS,
        renameInput: function (num, label) {
            var n = inputNames();
            if (label) n[num] = label; else delete n[num];
            global.Store.Prefs.set('inputNames', n);
        },
        visible: visible, hiddenCount: function () { return hiddenByUser().length; } };
    global.Apps = Apps;
})(this);
