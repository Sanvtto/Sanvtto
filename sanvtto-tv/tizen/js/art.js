/* Modo quadro (inspirado na Samsung The Frame): moldura, passe-partout com chanfro e troca com fade lento. */
(function (global) {
    'use strict';
    var Prefs = global.Store.Prefs;
    var W = 1920, H = 1080;
    var FULL = 0, WHITE_MAT = 1, BLACK_MAT = 2, WOOD = 3, BLACK = 4;

    // ---------------------------------------------------------------- desenho

    function frameAndMat(c, style) {
        if (style === FULL) {
            c.fillStyle = '#000';
            c.fillRect(0, 0, W, H);
            return { x: 0, y: 0, w: W, h: H };
        }
        var frame = 0;
        if (style === WOOD || style === BLACK) {
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
        var black = style === BLACK_MAT;
        var mx = frame, my = frame, mw = W - 2 * frame, mh = H - 2 * frame;
        var rg = c.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.75);
        rg.addColorStop(0, black ? '#121213' : '#f3f0ea');
        rg.addColorStop(1, black ? '#0a0a0b' : '#e4dfd5');
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
        var margin = Math.min(mw, mh) * 0.11;
        return { x: mx + margin, y: my + margin, w: mw - 2 * margin, h: mh - 2 * margin };
    }

    function placeArt(img, box, style) {
        var iw = img.width, ih = img.height;
        var scale = style === FULL ? Math.max(box.w / iw, box.h / ih) : Math.min(box.w / iw, box.h / ih);
        var dw = iw * scale, dh = ih * scale;
        return { x: box.x + (box.w - dw) / 2, y: box.y + (box.h - dh) / 2, w: dw, h: dh };
    }

    function bevel(c, r, style) {
        var b = 5, black = style === BLACK_MAT;
        c.fillStyle = black ? '#2a2a2c' : '#ffffff';
        c.fillRect(r.x - b, r.y - b, r.w + 2 * b, b);
        c.fillRect(r.x - b, r.y, b, r.h + b);
        c.fillStyle = black ? '#050505' : '#d8d2c6';
        c.fillRect(r.x, r.y + r.h, r.w + b, b);
        c.fillRect(r.x + r.w, r.y - b, b, r.h);
        var s = 14;
        var g1 = c.createLinearGradient(0, r.y, 0, r.y + s);
        g1.addColorStop(0, 'rgba(0,0,0,.33)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g1; c.fillRect(r.x, r.y, r.w, s);
        var g2 = c.createLinearGradient(r.x, 0, r.x + s, 0);
        g2.addColorStop(0, 'rgba(0,0,0,.25)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g2; c.fillRect(r.x, r.y, s, r.h);
    }

    function render(canvas, img, style) {
        canvas.width = W;
        canvas.height = H;
        var c = canvas.getContext('2d');
        var box = frameAndMat(c, style);
        var r = placeArt(img, box, style);
        c.save();
        c.beginPath();
        c.rect(style === FULL ? box.x : r.x, style === FULL ? box.y : r.y, style === FULL ? box.w : r.w, style === FULL ? box.h : r.h);
        c.clip();
        c.imageSmoothingEnabled = true;
        c.drawImage(img, r.x, r.y, r.w, r.h);
        c.restore();
        if (style !== FULL) bevel(c, r, style);
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
        var cv = global.document.createElement('canvas');
        cv.width = w; cv.height = h;
        var c = cv.getContext('2d');
        c.fillStyle = p[0];
        c.fillRect(0, 0, w, h);
        var s = Math.abs(seed) * 9301 + 49297;
        function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
        for (var i = 0; i < 7; i++) {
            var x = rnd() * w, y = rnd() * h, r = (0.25 + rnd() * 0.45) * w;
            var col = p[1 + Math.floor(rnd() * 3)];
            var g = c.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, hexA(col, 0.7));
            g.addColorStop(1, hexA(col, 0));
            c.fillStyle = g;
            c.fillRect(0, 0, w, h);
        }
        return cv;
    }

    function hexA(hex, a) {
        var n = parseInt(hex.slice(1), 16);
        return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    function loadBlob(blob) {
        return new Promise(function (resolve, reject) {
            var url = global.URL.createObjectURL(blob);
            var img = new global.Image();
            img.onload = function () { global.URL.revokeObjectURL(url); resolve(img); };
            img.onerror = function () { global.URL.revokeObjectURL(url); reject(new Error('imagem inválida')); };
            img.src = url;
        });
    }

    // ---------------------------------------------------------------- controlador

    var el, layers, front = 0, timer = null, dimTimer = null, infoTimer = null, clockTimer = null;
    var running = false, index = 0, token = 0;

    function $(id) { return global.document.getElementById(id); }

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function updateClock() {
        var d = new Date();
        $('artClock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function updateDim() {
        $('artDim').style.opacity = Prefs.get('nightDim') ? global.Theme.nightDim(new Date()) : 0;
    }

    function flashInfo() {
        var info = $('artInfo');
        info.classList.add('on');
        clearTimeout(infoTimer);
        infoTimer = setTimeout(function () { info.classList.remove('on'); }, 7000);
    }

    function show(delta) {
        clearTimeout(timer);
        var my = ++token;
        index += delta;
        return global.Store.listArt().then(function (all) {
            if (!all.length) return { img: generated(index, 1280, 720), title: 'Estudo em cor nº ' + (Math.abs(index) % 97 + 1),
                sub: 'Sanvtto TV · conecte à internet para receber obras de museus', i: index };
            // tenta a obra atual; se estiver corrompida, pula para a próxima
            var tries = 0;
            function attempt() {
                var i = ((index + tries) % all.length + all.length) % all.length;
                var a = all[i];
                return loadBlob(a.blob).then(function (img) {
                    var sub = [a.artist, a.date].filter(Boolean).join(' · ');
                    return { img: img, title: a.title, sub: sub, i: i };
                }, function () {
                    if (++tries >= all.length) return { img: generated(index, 1280, 720), title: 'Estudo em cor', sub: '', i: index };
                    return attempt();
                });
            }
            return attempt();
        }).then(function (r) {
            if (!running || my !== token) return;
            index = r.i;
            Prefs.set('artIndex', index);
            var style = Prefs.get('frameStyle');
            var back = layers[1 - front];
            render(back, r.img, style);
            back.classList.add('on');
            layers[front].classList.remove('on');
            front = 1 - front;
            el.classList.toggle('on-mat', style !== FULL && style !== BLACK_MAT); // passe-partout claro: texto escuro
            $('artTitle').textContent = r.title;
            $('artSub').textContent = r.sub;
            flashInfo();
            timer = setTimeout(function () { show(1); }, Math.max(1, Prefs.get('artInterval')) * 60000);
        }).catch(function () {
            if (running) timer = setTimeout(function () { show(1); }, 60000);
        });
    }

    var Art = {
        isOpen: function () { return running; },
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
            running = false;
            token++;
            clearTimeout(timer); clearTimeout(infoTimer);
            clearInterval(clockTimer); clearInterval(dimTimer);
            el.hidden = true;
            layers.forEach(function (l) { l.classList.remove('on'); });
            setScreenSaver(true);
            if (Art.onClose) Art.onClose();
        },
        next: function () { return show(1); },
        prev: function () { return show(-1); },
        info: flashInfo,
        render: render,
        generated: generated,
        onClose: null,
        /** true se tratou a tecla */
        handleKey: function (code) {
            var K = global.Nav.KEY;
            if (code === K.RIGHT || code === K.NEXT || code === K.CH_UP) { show(1); return true; }
            if (code === K.LEFT || code === K.PREV || code === K.CH_DOWN) { show(-1); return true; }
            if (code === K.ENTER || code === K.INFO) { flashInfo(); return true; }
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
