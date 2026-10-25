/* Modo quadro no estilo Samsung The Frame: obra com passe-partout (estilos e cores como no Modo Arte),
   troca com fade lento e uma galeria de vidro que sobe por cima da obra (↓ no controle). */
(function (global) {
    'use strict';
    var doc = global.document;
    var Prefs = global.Store.Prefs;
    var W = 1920, H = 1080;

    // estilos (frameStyle)
    var FULL = 0, MODERN = 1, SHADOWBOX = 2, WOOD = 3, BLACK_FRAME = 4;
    var STYLES = [
        { id: FULL, name: 'Tela cheia' },
        { id: MODERN, name: 'Moderno' },
        { id: SHADOWBOX, name: 'Shadowbox' },
        { id: WOOD, name: 'Madeira' },
        { id: BLACK_FRAME, name: 'Moldura preta' }
    ];
    // cores do passe-partout (matColor), inspiradas nas do Modo Arte
    var MATS = [
        { id: 0, name: 'Polar', hex: '#f3f0ea' },
        { id: 1, name: 'Quente', hex: '#ece0cb' },
        { id: 2, name: 'Neutro', hex: '#d8d3ca' },
        { id: 3, name: 'Sálvia', hex: '#b8c1ab' },
        { id: 4, name: 'Areia', hex: '#c9b49a' },
        { id: 5, name: 'Vinho', hex: '#5b2b30' },
        { id: 6, name: 'Preto', hex: '#151517' }
    ];

    function matOf(id) {
        for (var i = 0; i < MATS.length; i++) if (MATS[i].id === id) return MATS[i];
        return MATS[0];
    }

    function rgb(hex) {
        var n = parseInt(hex.slice(1), 16);
        return [n >> 16 & 255, n >> 8 & 255, n & 255];
    }

    function shade(hex, f) {
        var c = rgb(hex).map(function (v) { return Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); });
        return 'rgb(' + c.join(',') + ')';
    }

    function isLight(hex) {
        var c = rgb(hex);
        return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 140;
    }

    // ---------------------------------------------------------------- desenho

    function frameAndMat(c, style, matHex) {
        if (style === FULL) {
            c.fillStyle = '#000';
            c.fillRect(0, 0, W, H);
            return { x: 0, y: 0, w: W, h: H, matBottom: H };
        }
        var frame = 0;
        if (style === WOOD || style === BLACK_FRAME) {
            frame = H * 0.045;
            var g = c.createLinearGradient(0, 0, W, H);
            var stops = style === WOOD ? ['#b8895a', '#8a6038', '#a77a4c', '#7a5230'] : ['#2a2a2c', '#151516', '#242426', '#0e0e0f'];
            stops.forEach(function (s, i) { g.addColorStop(i / 3, s); });
            c.fillStyle = g;
            c.fillRect(0, 0, W, H);
            var b = frame * 0.18;
            c.fillStyle = 'rgba(255,255,255,.15)';
            c.fillRect(0, 0, W, b); c.fillRect(0, 0, b, H);
            c.fillStyle = 'rgba(0,0,0,.2)';
            c.fillRect(0, H - b, W, b); c.fillRect(W - b, 0, b, H);
        }
        var mx = frame, my = frame, mw = W - 2 * frame, mh = H - 2 * frame;
        // papel levemente iluminado de cima, como numa parede de galeria
        var rg = c.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, Math.max(W, H) * 0.8);
        rg.addColorStop(0, shade(matHex, 0.06));
        rg.addColorStop(1, shade(matHex, -0.06));
        c.fillStyle = rg;
        c.fillRect(mx, my, mw, mh);
        if (frame > 0) {
            var s = frame * 0.5;
            var sg = c.createLinearGradient(0, frame, 0, frame + s);
            sg.addColorStop(0, 'rgba(0,0,0,.25)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = sg; c.fillRect(mx, my, mw, s);
            var lg = c.createLinearGradient(frame, 0, frame + s, 0);
            lg.addColorStop(0, 'rgba(0,0,0,.19)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = lg; c.fillRect(mx, my, s, mh);
        }
        // Moderno: passe-partout fino e uniforme; os outros, largo como num quadro de museu
        var margin = Math.min(mw, mh) * (style === MODERN ? 0.065 : 0.11);
        return { x: mx + margin, y: my + margin, w: mw - 2 * margin, h: mh - 2 * margin, matBottom: my + mh };
    }

    function placeArt(img, box, style) {
        var iw = img.width, ih = img.height;
        var scale = style === FULL ? Math.max(box.w / iw, box.h / ih) : Math.min(box.w / iw, box.h / ih);
        var dw = iw * scale, dh = ih * scale;
        return { x: box.x + (box.w - dw) / 2, y: box.y + (box.h - dh) / 2, w: dw, h: dh };
    }

    /** Corte chanfrado do passe-partout + sombra interna (profunda no Shadowbox). */
    function bevel(c, r, style, matHex) {
        var b = style === MODERN ? 3 : 5;
        c.fillStyle = shade(matHex, 0.5);
        c.fillRect(r.x - b, r.y - b, r.w + 2 * b, b);
        c.fillRect(r.x - b, r.y, b, r.h + b);
        c.fillStyle = shade(matHex, -0.12);
        c.fillRect(r.x, r.y + r.h, r.w + b, b);
        c.fillRect(r.x + r.w, r.y - b, b, r.h);
        var deep = style === SHADOWBOX;
        var s = deep ? 46 : 14, a = deep ? 0.5 : 0.33;
        var g1 = c.createLinearGradient(0, r.y, 0, r.y + s);
        g1.addColorStop(0, 'rgba(0,0,0,' + a + ')'); g1.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g1; c.fillRect(r.x, r.y, r.w, s);
        var g2 = c.createLinearGradient(r.x, 0, r.x + s, 0);
        g2.addColorStop(0, 'rgba(0,0,0,' + a * 0.75 + ')'); g2.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g2; c.fillRect(r.x, r.y, s, r.h);
        if (deep) {
            // a obra "flutua" dentro da caixa: sombra fina embaixo/direita também
            var g3 = c.createLinearGradient(r.x + r.w, 0, r.x + r.w - 16, 0);
            g3.addColorStop(0, 'rgba(0,0,0,.22)'); g3.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = g3; c.fillRect(r.x + r.w - 16, r.y, 16, r.h);
        }
    }

    function render(canvas, img, style, matId) {
        canvas.width = W;
        canvas.height = H;
        var c = canvas.getContext('2d');
        var matHex = matOf(matId === undefined ? 0 : matId).hex;
        var box = frameAndMat(c, style, matHex);
        var r = placeArt(img, box, style);
        c.save();
        c.beginPath();
        if (style === FULL) c.rect(box.x, box.y, box.w, box.h); else c.rect(r.x, r.y, r.w, r.h);
        c.clip();
        c.imageSmoothingEnabled = true;
        c.drawImage(img, r.x, r.y, r.w, r.h);
        c.restore();
        if (style !== FULL) bevel(c, r, style, matHex);
        return { art: r, matBottom: box.matBottom, style: style };
    }

    /** Pintura abstrata gerada na hora (quando ainda não há obras e a TV está offline). */
    function generated(seed, w, h) {
        var palettes = [
            ['#1b3a5b', '#e8b04a', '#d9653b', '#6fa3bf'],
            ['#2e2a24', '#c9a66b', '#8c3b2e', '#e9e1d3'],
            ['#0f2d2a', '#5e9c76', '#f0c987', '#b65a3c'],
            ['#241c35', '#d87c8a', '#5c7ab8', '#f2d7b6']
        ];
        var p = palettes[Math.abs(seed) % palettes.length];
        var cv = doc.createElement('canvas');
        cv.width = w; cv.height = h;
        var c = cv.getContext('2d');
        c.fillStyle = p[0];
        c.fillRect(0, 0, w, h);
        var s = Math.abs(seed) * 9301 + 49297;
        function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
        for (var i = 0; i < 7; i++) {
            var x = rnd() * w, y = rnd() * h, r = (0.25 + rnd() * 0.45) * w;
            var col = rgb(p[1 + Math.floor(rnd() * 3)]);
            var g = c.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(' + col.join(',') + ',.7)');
            g.addColorStop(1, 'rgba(' + col.join(',') + ',0)');
            c.fillStyle = g;
            c.fillRect(0, 0, w, h);
        }
        return cv;
    }

    /** Abre a obra: do arquivo guardado (offline) ou direto da internet. */
    function loadArt(a) {
        return new Promise(function (resolve, reject) {
            var url = a.blob ? global.URL.createObjectURL(a.blob) : a.url;
            var img = new global.Image();
            var free = function () { if (a.blob) global.URL.revokeObjectURL(url); };
            img.onload = function () { free(); resolve(img); };
            img.onerror = function () { free(); reject(new Error('imagem inválida')); };
            img.src = url;
        });
    }

    // ---------------------------------------------------------------- controlador

    var el, layers, front = 0, timer = null, dimTimer = null, infoTimer = null, clockTimer = null;
    var running = false, index = 0, token = 0, lastImg = null, currentId = null;
    var WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    function $(id) { return doc.getElementById(id); }
    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function updateClock() {
        var d = new Date();
        var day = WEEKDAYS[d.getDay()];
        $('artClock').textContent = day.charAt(0).toUpperCase() + day.slice(1) + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()]
            + ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    /**
     * Com passe-partout, legenda e relógio ficam NO PAPEL, abaixo da obra, alinhados às bordas dela
     * (como a etiqueta de um quadro na galeria). Em tela cheia, ficam nos cantos.
     */
    var lastLayout = null;

    function placeLabels(lay) {
        lastLayout = lay;
        var info = $('artInfo'), clock = $('artClock');
        var inMat = lay.style !== FULL;
        el.classList.toggle('in-mat', inMat);
        var props = ['left', 'right', 'top', 'bottom', 'maxWidth'];
        props.forEach(function (p) { info.style[p] = ''; clock.style[p] = ''; });
        if (!inMat) return;
        var r = lay.art;
        var center = r.y + r.h + (lay.matBottom - (r.y + r.h)) / 2;
        var left = r.x, right = r.x + r.w;
        // obra em pé (estreita): usa a largura do passe-partout para caber o texto
        if (r.w < 1100) { left = Math.min(left, W * 0.1); right = Math.max(right, W * 0.9); }
        info.style.left = left + 'px';
        info.style.top = center + 'px';
        info.style.bottom = 'auto';
        info.style.maxWidth = Math.round((right - left) * 0.55) + 'px';
        clock.style.right = (W - right) + 'px';
        clock.style.top = center + 'px';
        clock.style.bottom = 'auto';
    }

    function updateDim() {
        $('artDim').style.opacity = Prefs.get('nightDim') ? global.Theme.nightDim(new Date()) : 0;
    }

    var infoHidden = false; // OK no controle esconde/mostra a legenda

    /** A legenda acompanha a obra: aparece com ela e só sai quando ela sai. */
    function showInfo(on) {
        $('artInfo').classList.toggle('on', on && !infoHidden && !galleryOpen);
    }

    function toggleInfo() {
        infoHidden = !infoHidden;
        showInfo(true);
    }

    /** "1889", "c. 1885–1890", "1 de março de 1904" → primeiro ano com 4 dígitos. */
    function yearOf(s) {
        var m = String(s || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
        return m ? m[1] : '';
    }

    /** Legenda curta: título, ano e país (quando o museu informa). */
    function caption(a) {
        return [a.year || yearOf(a.date), a.country || ''].filter(Boolean).join(' · ');
    }

    function isLandscape(w, h) { return w >= h * 1.15; }

    function applyTextColor() {
        var style = Prefs.get('frameStyle');
        el.classList.toggle('on-mat', style !== FULL && isLight(matOf(Prefs.get('matColor')).hex));
    }

    /** Redesenha a obra atual na hora (troca de estilo/cor), sem fade. */
    function redraw() {
        if (!lastImg) return;
        placeLabels(render(layers[front], lastImg, Prefs.get('frameStyle'), Prefs.get('matColor')));
        applyTextColor();
    }

    /** Mostra a obra seguinte/anterior (delta) ou uma obra específica pelo id (escolhida na galeria). */
    function show(delta, wantId) {
        clearTimeout(timer);
        var my = ++token;
        index += delta;
        return global.Store.listArt().then(function (all) {
            // pelo id, não pela posição: obras novas podem chegar com a galeria aberta e mudar a ordem
            if (wantId) for (var k = 0; k < all.length; k++) if (all[k].id === wantId) index = k;
            if (!all.length) return { img: generated(index, 1280, 720), gen: true, title: 'Estudo em cor nº ' + (Math.abs(index) % 97 + 1),
                sub: 'Sem obras ainda — ' + global.Store.Diag.get('art'), i: index };
            // tenta a obra atual; se estiver corrompida, pula para a próxima
            var tries = 0;
            function attempt() {
                var i = ((index + tries) % all.length + all.length) % all.length;
                var a = all[i];
                return loadArt(a).then(function (img) {
                    // obra em pé (guardada por versões antigas): sai do acervo e pula para a próxima
                    if (!isLandscape(img.width, img.height)) {
                        global.Store.deleteArt(a.id);
                        throw new Error('obra em pé');
                    }
                    return { img: img, title: a.title, sub: caption(a), i: i, id: a.id };
                }).catch(function () {
                    if (++tries >= all.length) return { img: generated(index, 1280, 720), gen: true, title: 'Estudo em cor', sub: '', i: index };
                    return attempt();
                });
            }
            return attempt();
        }).then(function (r) {
            if (!running || my !== token) return;
            index = r.i;
            currentId = r.id || null;
            lastImg = r.img;
            Prefs.set('artIndex', index);
            var back = layers[1 - front];
            var lay = render(back, r.img, Prefs.get('frameStyle'), Prefs.get('matColor'));
            back.classList.add('on');
            layers[front].classList.remove('on');
            front = 1 - front;
            // a legenda sai junto com a obra antiga e volta junto com a nova
            showInfo(false);
            clearTimeout(infoTimer);
            infoTimer = setTimeout(function () {
                if (!running || my !== token) return;
                placeLabels(lay);
                applyTextColor();
                $('artTitle').textContent = r.title;
                $('artSub').textContent = r.sub;
                showInfo(true);
            }, 700);
            markCurrent();
            timer = setTimeout(function () { show(1); }, Math.max(10, Prefs.get('artSeconds')) * 1000);
        }).catch(function () {
            if (running) timer = setTimeout(function () { show(1); }, 60000);
        });
    }

    // ---------------------------------------------------------------- galeria (menu do Modo Arte)

    var galleryOpen = false, thumbUrls = [];

    function chip(label, cls, run, extra) {
        var d = doc.createElement('div');
        d.className = cls + ' focusable';
        if (label) d.textContent = label;
        d.__run = run;
        if (extra) extra(d);
        return d;
    }

    function markSelected(row, value, attr) {
        var items = row.children;
        for (var i = 0; i < items.length; i++) items[i].classList.toggle('selected', items[i].getAttribute(attr) === String(value));
    }

    function markCurrent() {
        var row = $('galArt');
        if (row) markSelected(row, currentId, 'data-art');
    }

    function openGallery() {
        galleryOpen = true;
        var g = $('gallery');
        g.hidden = false;
        $('artInfo').classList.remove('on');
        var artRow = $('galArt'), styleRow = $('galStyle'), matRow = $('galMat');
        artRow.innerHTML = ''; styleRow.innerHTML = ''; matRow.innerHTML = '';
        artRow.style.transform = '';

        return global.Store.listArt().then(function (all) {
            if (!galleryOpen) return;
            $('galCount').textContent = all.length ? all.length + (all.length === 1 ? ' obra' : ' obras') : 'Nenhuma obra baixada ainda';
            all.forEach(function (a) {
                artRow.appendChild(chip('', 'gal-thumb', function () { show(0, a.id); }, function (d) {
                    d.setAttribute('data-art', a.id);
                    d.setAttribute('data-title', a.title);
                    var img = doc.createElement('img');
                    var src = a.thumb || a.blob;
                    var url = src ? global.URL.createObjectURL(src) : a.url;
                    if (src) thumbUrls.push(url);
                    img.src = url;
                    img.onerror = function () { d.classList.add('broken'); };
                    d.appendChild(img);
                }));
            });
            if (!all.length) artRow.appendChild(chip('Baixar obras agora', 'gal-chip', function () {
                global.Store.refreshArt(true).then(function () { closeGallery(); index = 0; show(0); });
            }));
            STYLES.forEach(function (s) {
                styleRow.appendChild(chip(s.name, 'gal-chip', function () {
                    Prefs.set('frameStyle', s.id); redraw(); markSelected(styleRow, s.id, 'data-id');
                }, function (d) { d.setAttribute('data-id', s.id); }));
            });
            MATS.forEach(function (m) {
                matRow.appendChild(chip('', 'gal-swatch', function () {
                    Prefs.set('matColor', m.id);
                    if (Prefs.get('frameStyle') === FULL) { Prefs.set('frameStyle', MODERN); markSelected(styleRow, MODERN, 'data-id'); }
                    redraw(); markSelected(matRow, m.id, 'data-id');
                }, function (d) {
                    d.setAttribute('data-id', m.id);
                    d.setAttribute('data-name', m.name);
                    d.style.backgroundColor = m.hex;
                }));
            });
            markCurrent();
            markSelected(styleRow, Prefs.get('frameStyle'), 'data-id');
            markSelected(matRow, Prefs.get('matColor'), 'data-id');
            global.Nav.setScope(g);
            var start = artRow.querySelector('.selected') || artRow.firstChild;
            global.Nav.focus(start);
            Art.scrollTo(start);
            // obras antigas sem miniatura ganham uma agora (em segundo plano)
            global.Store.ensureThumbs();
        });
    }

    function closeGallery() {
        galleryOpen = false;
        $('gallery').hidden = true;
        showInfo(true);
        thumbUrls.forEach(function (u) { global.URL.revokeObjectURL(u); });
        thumbUrls = [];
        $('galArt').innerHTML = '';
        global.Nav.setScope(null);
    }

    function galleryKey(code) {
        var K = global.Nav.KEY, Nav = global.Nav;
        var cur = Nav.current();
        if (code === K.BACK || code === K.ESC || code === K.BACKSPACE) { closeGallery(); return; }
        if (code === K.ENTER) { if (cur && cur.__run) cur.__run(); return; }
        var dir = code === K.LEFT ? 'left' : code === K.RIGHT ? 'right' : code === K.UP ? 'up' : code === K.DOWN ? 'down' : null;
        if (!dir) return;
        // ↑ na primeira fileira fecha a galeria e volta a ver só a obra
        if (!Nav.move(dir) && dir === 'up') closeGallery();
    }

    var Art = {
        STYLES: STYLES,
        MATS: MATS,
        isOpen: function () { return running; },
        galleryOpen: function () { return galleryOpen; },
        open: function () {
            if (running) return;
            el = $('art');
            layers = [$('artA'), $('artB')];
            running = true;
            index = Prefs.get('artIndex') || 0;
            el.hidden = false;
            $('artClock').hidden = !Prefs.get('artClock');
            updateClock(); updateDim();
            clockTimer = setInterval(updateClock, 30000);
            dimTimer = setInterval(updateDim, 60000);
            setScreenSaver(false);
            show(0);
            global.Store.refreshArt(false);
        },
        close: function () {
            if (!running) return;
            if (galleryOpen) closeGallery();
            running = false;
            token++;
            clearTimeout(timer); clearTimeout(infoTimer);
            clearInterval(clockTimer); clearInterval(dimTimer);
            el.hidden = true;
            layers.forEach(function (l) { l.classList.remove('on'); });
            lastImg = null;
            setScreenSaver(true);
            if (Art.onClose) Art.onClose();
        },
        next: function () { return show(1); },
        prev: function () { return show(-1); },
        info: toggleInfo,
        openGallery: openGallery,
        layout: function () { return lastLayout; },
        render: render,
        generated: generated,
        onClose: null,
        /** rolagem da fileira de obras para manter a miniatura focada visível */
        scrollTo: function (cur) {
            if (!cur || !cur.parentNode || cur.parentNode.id !== 'galArt') return;
            var row = cur.parentNode;
            var left = cur.offsetLeft, right = left + cur.offsetWidth;
            var view = 1920 - 2 * 96;
            var shift = row.__shift || 0;
            if (right - shift > view - 40) shift = right - view + 40;
            if (left - shift < 0) shift = left;
            row.__shift = shift;
            row.style.transform = 'translateX(' + (-shift) + 'px)';
        },
        /** true se tratou a tecla */
        handleKey: function (code) {
            var K = global.Nav.KEY;
            if (galleryOpen) { galleryKey(code); return true; }
            if (code === K.RIGHT || code === K.NEXT || code === K.CH_UP) { show(1); return true; }
            if (code === K.LEFT || code === K.PREV || code === K.CH_DOWN) { show(-1); return true; }
            if (code === K.DOWN) { openGallery(); return true; }
            if (code === K.ENTER || code === K.INFO || code === K.UP) { toggleInfo(); return true; }
            Art.close();
            return true;
        }
    };

    /** Impede a proteção de tela da Samsung de cobrir o quadro (e devolve ao sair). */
    function setScreenSaver(on) {
        try {
            var ac = global.webapis.appcommon;
            ac.setScreenSaver(on ? ac.AppCommonScreenSaverState.SCREEN_SAVER_ON : ac.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
        } catch (e) { /* fora da TV */ }
    }

    global.Art = Art;
})(this);
