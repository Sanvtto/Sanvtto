/* Navegação pelo controle remoto: foco espacial (vai para o item mais próximo na direção). */
(function (global) {
    'use strict';

    var KEY = {
        LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
        BACK: 10009, ESC: 27, BACKSPACE: 8, EXIT: 10182,
        PLAY_PAUSE: 10252, NEXT: 417, PREV: 412, CH_UP: 427, CH_DOWN: 428, INFO: 457
    };

    var current = null;
    var scope = null; // elemento que contém os focáveis ativos (tela ou menu)

    function focusables() {
        var root = scope || global.document.body;
        var list = root.querySelectorAll('.focusable');
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            if (el.offsetParent !== null || el === current) out.push(el);
        }
        return out;
    }

    function setScope(el) { scope = el; }

    function focus(el) {
        if (!el || el === current) return;
        if (current) current.classList.remove('focused');
        var tile = current && current.closest ? current.closest('.tile') : null;
        if (tile) tile.classList.remove('focused');
        current = el;
        el.classList.add('focused');
        var t = el.closest ? el.closest('.tile') : null;
        if (t) t.classList.add('focused');
        if (Nav.onFocus) Nav.onFocus(el);
    }

    function rectOf(el) {
        // rect "lógico" (sem a escala do foco) via offset acumulado
        var x = 0, y = 0, e = el;
        while (e) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
        var shift = el.__shift || 0;
        return { left: x + shift, top: y, width: el.offsetWidth, height: el.offsetHeight };
    }

    function move(dir) {
        var list = focusables();
        if (!current || list.indexOf(current) < 0) { focus(list[0]); return !!list[0]; }
        var a = rectOf(current);
        var ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
        var best = null, bestScore = Infinity;
        list.forEach(function (el) {
            if (el === current) return;
            var b = rectOf(el);
            var bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
            var dx = bc.x - ac.x, dy = bc.y - ac.y;
            var primary, secondary;
            if (dir === 'left') { if (b.left + b.width > a.left + 1 && dx >= -1) return; primary = -dx; secondary = Math.abs(dy); }
            else if (dir === 'right') { if (b.left < a.left + a.width - 1 && dx <= 1) return; primary = dx; secondary = Math.abs(dy); }
            else if (dir === 'up') { if (b.top + b.height > a.top + 1) return; primary = -dy; secondary = Math.abs(dx); }
            else { if (b.top < a.top + a.height - 1) return; primary = dy; secondary = Math.abs(dx); }
            if (primary <= 0) return;
            // mesma linha/coluna conta muito mais que distância diagonal
            var score = primary + secondary * (dir === 'up' || dir === 'down' ? 0.6 : 3);
            if (score < bestScore) { bestScore = score; best = el; }
        });
        if (best) { focus(best); return true; }
        return false;
    }

    var Nav = {
        KEY: KEY,
        focus: focus,
        move: move,
        setScope: setScope,
        current: function () { return current; },
        first: function () { var l = focusables(); return l[0] || null; },
        onFocus: null
    };

    /** Registra teclas extras do controle Samsung (as setas, OK e voltar já vêm liberadas). */
    Nav.registerKeys = function () {
        try {
            var t = global.tizen;
            ['MediaPlayPause', 'MediaFastForward', 'MediaRewind', 'ChannelUp', 'ChannelDown', 'Info']
                .forEach(function (k) { try { t.tvinputdevice.registerKey(k); } catch (e) { /* tecla ausente */ } });
        } catch (e) { /* fora da TV */ }
    };

    global.Nav = Nav;
})(this);
