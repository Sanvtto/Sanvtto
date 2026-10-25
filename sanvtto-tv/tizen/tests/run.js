// Testes do Sanvtto TV (Tizen): node tests/run.js  (gera prints em test-output/)
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-output');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
function serve() {
    return new Promise((resolve) => {
        const s = http.createServer((req, res) => {
            const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
            if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
            fs.createReadStream(p).pipe(res);
        }).listen(0, '127.0.0.1', () => resolve(s));
    });
}

let browser, server, base, jpeg, jpegPortrait;
const results = [];

async function newPage(opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
        if (m.type() === 'error' && !/webapis\.js|Failed to load resource/.test(m.text() + (m.location().url || ''))) page.errors.push('console: ' + m.text());
    });
    if (opts.clock) await page.clock.install({ time: opts.clockTime || new Date('2026-03-15T14:00:00-03:00') });
    if (opts.init) await page.addInitScript(opts.init);
    await page.addInitScript({ path: path.join(__dirname, 'mock-tizen.js') });
    // museus simulados (ou offline)
    await page.route(/upload\.wikimedia\.org/, async (route) => {
        if (opts.offline) return route.abort('internetdisconnected');
        // Wikimedia recusando tamanho fora do padrão
        if (opts.wm1920Broken && route.request().url().includes('/1920px-')) return route.fulfill({ status: 429, body: 'tamanho não padrão' });
        if (opts.noCors && route.request().resourceType() === 'fetch') return route.abort('accessdenied');
        return route.fulfill({ contentType: 'image/jpeg', body: jpeg });
    });
    await page.route(/api\.artic\.edu|metmuseum\.org|artic\.edu\/iiif|wikimedia\.org/, async (route) => {
        const url = route.request().url();
        if (opts.offline) return route.abort('internetdisconnected');
        if (opts.aicDown && url.includes('api.artic.edu')) return route.fulfill({ status: 503, body: 'fora do ar' });
        // TV que bloqueia baixar a imagem (CORS), mas deixa um <img> mostrar
        if (opts.noCors && route.request().resourceType() === 'fetch' && /iiif|upload\.wikimedia/.test(url)) return route.abort('accessdenied');
        if (url.includes('commons.wikimedia.org/w/api.php')) {
            if (!opts.wikimedia) return route.fulfill({ status: 503, body: 'fora do ar' });
            if (opts.wikimediaMany) {
                const pages = {};
                for (let k = 1; k <= 30; k++) pages[100 + k] = { pageid: 100 + k, title: 'File:Obra ' + k + '.jpg', imageinfo: [{
                    thumburl: 'https://upload.wikimedia.org/thumb/o' + k + '.jpg/1920px-o' + k + '.jpg', width: 1600, height: 1100,
                    extmetadata: { ObjectName: { value: 'Obra nº ' + k } } }] };
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ query: { pages } }) });
            }
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ query: { pages: {
                11: { pageid: 11, title: 'File:Paisagem.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb/a/paisagem.jpg/1920px-paisagem.jpg', width: 1600, height: 1000,
                    extmetadata: { ObjectName: { value: 'Paisagem com Rio' }, Artist: { value: '<a href="#">Fulano de Tal</a>' }, DateTimeOriginal: { value: '1882' } } }] },
                12: { pageid: 12, title: 'File:Torre.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/a/torre.jpg', width: 300, height: 1500 }] }
            } } }) });
        }
        if (url.includes('upload.wikimedia.org')) return route.fallback(); // tratado na rota própria acima
        if (url.includes('/artworks/search')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
                config: { iiif_url: 'https://www.artic.edu/iiif/2' },
                data: [
                    { id: 1, title: 'A Tarde no Campo', image_id: 'img1', artist_title: 'Pintor Um', date_display: '1890', thumbnail: { width: 1600, height: 1000 } },
                    { id: 2, title: 'Retrato', image_id: 'img2', artist_title: 'Pintora Dois', date_display: '1875', thumbnail: { width: 800, height: 1100 } },
                    { id: 3, title: 'Muito Estreita', image_id: 'img3', artist_title: 'X', date_display: '', thumbnail: { width: 200, height: 1000 } },
                    { id: 4, title: 'Arquivo Quebrado', image_id: 'broken', artist_title: 'Y', date_display: '', thumbnail: { width: 1000, height: 800 } },
                    { id: 5, title: 'Sem imagem', image_id: null }
                ] }) });
        }
        if (url.includes('/iiif/')) {
            if (url.includes('broken')) return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>erro</html>' });
            return route.fulfill({ contentType: 'image/jpeg', body: url.includes('img2') ? jpegPortrait : jpeg });
        }
        return route.fulfill({ status: 404, body: '' });
    });
    await page.goto(base + '/index.html');
    if (opts.noWait) return page;
    await page.waitForFunction(() => document.querySelectorAll('#grid .card').length > 0 || !document.getElementById('safe').hidden || window.__APPS_FAIL);
    return page;
}

async function key(page, code, opts = {}) {
    await page.evaluate(([c, hold]) => {
        const ev = (t, rep) => document.dispatchEvent(new KeyboardEvent(t, { keyCode: c, which: c, repeat: !!rep, bubbles: true }));
        ev('keydown');
        if (hold) for (let i = 0; i < 6; i++) ev('keydown', true);
        if (!hold) ev('keyup');
    }, [code, !!opts.hold]);
    if (opts.hold) { await page.waitForTimeout(700); await page.evaluate((c) => document.dispatchEvent(new KeyboardEvent('keyup', { keyCode: c, which: c })), code); }
    await page.waitForTimeout(opts.wait === undefined ? 30 : opts.wait);
}
const K = { L: 37, U: 38, R: 39, D: 40, OK: 13, BACK: 10009 };

const focusedInfo = (page) => page.evaluate(() => {
    const el = window.Nav.current();
    return el ? { app: el.getAttribute('data-app'), kind: el.getAttribute('data-kind'), text: el.textContent.trim(), cls: el.className } : null;
});

async function test(name, fn) {
    const t0 = Date.now();
    try {
        await fn();
        results.push({ name, ok: true, ms: Date.now() - t0 });
        console.log('  ✓ ' + name);
    } catch (e) {
        results.push({ name, ok: false, err: e.stack || String(e) });
        console.log('  ✗ ' + name + '\n    ' + (e.message || e));
    }
}

async function noErrors(page) {
    assert.deepStrictEqual(page.errors, [], 'erros no app: ' + page.errors.join(' | '));
    await page.context().close();
}

(async () => {
    server = await serve();
    base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch();
    // imagens de teste reais (JPEG) geradas no próprio navegador
    {
        const p = await browser.newPage();
        const mk = (w, h) => p.evaluate(([w, h]) => {
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const x = c.getContext('2d');
            const g = x.createLinearGradient(0, 0, w, h);
            g.addColorStop(0, '#1b3a5b'); g.addColorStop(.5, '#e8b04a'); g.addColorStop(1, '#8c3b2e');
            x.fillStyle = g; x.fillRect(0, 0, w, h);
            x.fillStyle = '#f0e6d2'; x.beginPath(); x.arc(w * .7, h * .35, h * .15, 0, 7); x.fill();
            x.fillStyle = '#20324a'; x.fillRect(0, h * .7, w, h * .3);
            return c.toDataURL('image/jpeg', .9).split(',')[1];
        }, [w, h]);
        jpeg = Buffer.from(await mk(1600, 1000), 'base64');
        jpegPortrait = Buffer.from(await mk(800, 1100), 'base64');
        await p.close();
    }

    console.log('Sanvtto TV · testes Tizen');

    await test('sintaxe compatível com o navegador antigo da TV (ES2017)', async () => {
        const acorn = require(path.join(__dirname, 'node_modules', 'acorn'));
        for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
            acorn.parse(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), { ecmaVersion: 2017, sourceType: 'script' });
        }
    });

    await test('config.xml válido com privilégios necessários', async () => {
        const x = fs.readFileSync(path.join(ROOT, 'config.xml'), 'utf8');
        for (const p of ['application.info', 'application.launch', 'internet', 'tv.inputdevice']) assert(x.includes('privilege/' + p), p);
        assert(/package="[A-Za-z0-9]{10}"/.test(x), 'package precisa ter 10 caracteres');
        assert(fs.existsSync(path.join(ROOT, 'icon.png')), 'icon.png');
    });

    await test('tela inicial: lista apps, esconde os do sistema e cria favoritos', async () => {
        const page = await newPage();
        const n = await page.$$eval('#grid .card', (e) => e.length);
        assert.strictEqual(n, 15, 'apps visíveis');
        const favs = await page.$$eval('#favRow .card', (e) => e.map((x) => x.getAttribute('data-app')));
        assert(favs[0].endsWith('Netflix') && favs[1].endsWith('YouTube'), 'ordem dos favoritos: ' + favs);
        const f = await focusedInfo(page);
        assert.strictEqual(f.kind, 'fav', 'primeiro favorito focado');
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(OUT, 'home.png') });
        await noErrors(page);
    });

    await test('controle remoto: navega por tudo sem perder o foco', async () => {
        const page = await newPage();
        const seen = new Set();
        const seq = ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'D', 'R', 'R', 'D', 'D', 'D', 'D', 'L', 'L', 'U', 'U', 'U', 'U', 'U', 'U', 'R', 'L', 'U'];
        for (const s of seq) {
            await key(page, K[s]);
            const f = await focusedInfo(page);
            assert(f, 'foco sumiu após ' + s);
            seen.add((f.kind || '') + (f.app || f.text));
        }
        assert(seen.size >= 10, 'visitou poucos itens: ' + seen.size);
        // chegou ao topo: botões Quadro/Ajustes
        const f = await focusedInfo(page);
        assert(/Quadro|Ajustes/.test(f.text), 'subindo tudo chega no topo: ' + f.text);
        await noErrors(page);
    });

    await test('rolagem: última linha de apps fica visível na tela', async () => {
        const page = await newPage();
        for (let i = 0; i < 6; i++) await key(page, K.D, { wait: 60 });
        await page.waitForTimeout(600);
        const box = await page.evaluate(() => window.Nav.current().getBoundingClientRect().toJSON());
        assert(box.top >= 0 && box.bottom <= 1080, 'item focado fora da tela: ' + JSON.stringify(box));
        await page.screenshot({ path: path.join(OUT, 'home-rolada.png') });
        await noErrors(page);
    });

    await test('favoritos longos: a fileira desliza para mostrar o item focado', async () => {
        const page = await newPage({ init: () => localStorage.setItem('sv.favs', JSON.stringify(
            ['app0.Netflix', 'app1.YouTube', 'app2.PrimeVideo', 'app3.Disney', 'app4.Globoplay', 'app5.Spotify', 'app6.Plex', 'app11.Max'])) });
        for (let i = 0; i < 7; i++) await key(page, K.R, { wait: 60 });
        await page.waitForTimeout(600);
        const box = await page.evaluate(() => window.Nav.current().getBoundingClientRect().toJSON());
        assert(box.left >= 0 && box.right <= 1920, 'favorito fora da tela: ' + JSON.stringify(box));
        await noErrors(page);
    });

    await test('OK abre o app certo', async () => {
        const page = await newPage();
        await key(page, K.OK);
        await key(page, K.OK); // TVs com e sem "soltar tecla"
        const launched = await page.evaluate(() => window.__launched);
        assert(launched.length >= 1 && launched.every((id) => id.endsWith('Netflix')), 'abriu: ' + launched);
        await noErrors(page);
    });

    await test('segurar OK abre o menu; favoritar, mover e remover', async () => {
        const page = await newPage();
        await key(page, K.OK); // primeira tecla: detecta suporte a keyup
        await page.evaluate(() => { window.__launched = []; });
        // vai para a grade e escolhe "Internet" (não favorito)
        await page.evaluate(() => window.Nav.focus(document.querySelector('#grid [data-app="app7.Internet"]')));
        await key(page, K.OK, { hold: true });
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'menu', 'menu não abriu');
        await page.screenshot({ path: path.join(OUT, 'menu.png') });
        const items = await page.$$eval('#menuItems .menu-item', (e) => e.map((x) => x.textContent));
        assert.deepStrictEqual(items, ['Abrir', 'Adicionar aos favoritos', 'Ocultar este app']);
        await key(page, K.D);
        await key(page, K.OK);
        let favs = await page.evaluate(() => JSON.parse(localStorage.getItem('sv.favs')));
        assert(favs.includes('app7.Internet'), 'não favoritou');
        let f = await focusedInfo(page);
        assert.strictEqual(f.kind + f.app, 'favapp7.Internet', 'foco vai para o novo favorito');

        const before = favs.indexOf('app7.Internet');
        await key(page, K.OK, { hold: true });
        const items2 = await page.$$eval('#menuItems .menu-item', (e) => e.map((x) => x.textContent));
        await key(page, K.D, {}); await key(page, K.D, {});
        assert.strictEqual(items2[2], 'Mover para a esquerda');
        await key(page, K.OK);
        favs = await page.evaluate(() => JSON.parse(localStorage.getItem('sv.favs')));
        assert.strictEqual(favs.indexOf('app7.Internet'), before - 1, 'não moveu');

        await key(page, K.OK, { hold: true });
        await key(page, K.D);
        await key(page, K.OK);
        favs = await page.evaluate(() => JSON.parse(localStorage.getItem('sv.favs')));
        assert(!favs.includes('app7.Internet'), 'não removeu');
        assert(await focusedInfo(page), 'foco perdido após remover');
        assert.deepStrictEqual(await page.evaluate(() => window.__launched), [], 'segurar OK não pode abrir o app');
        await noErrors(page);
    });

    await test('voltar no menu fecha; voltar na tela inicial nunca sai', async () => {
        const page = await newPage();
        await page.evaluate(() => window.SanvttoApp.openMenu(document.querySelector('#favRow .card')));
        await key(page, K.BACK);
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'home');
        for (let i = 0; i < 3; i++) await key(page, K.BACK);
        assert.strictEqual(await page.evaluate(() => !!window.__exited), false);
        assert.strictEqual((await focusedInfo(page)).kind, 'fav');
        await noErrors(page);
    });

    await test('abrir app que falha mostra aviso e não trava', async () => {
        const page = await newPage();
        await page.evaluate(() => { const c = document.querySelector('#favRow .card'); c.setAttribute('data-app', 'quebrado'); });
        await key(page, K.OK);
        await page.waitForTimeout(100);
        assert(!(await page.$eval('#toast', (t) => t.hidden)), 'aviso não apareceu');
        await noErrors(page);
    });

    await test('sem permissão para listar apps: tela abre mesmo assim', async () => {
        const page = await newPage({ init: () => { window.__APPS_FAIL = true; window.__NO_SYSTEM_APPS = true; } });
        await page.waitForTimeout(300);
        assert(!(await page.$eval('#favHint', (e) => e.hidden)), 'deve mostrar dica');
        assert(await focusedInfo(page), 'foco no botão Quadro');
        await noErrors(page);
    });

    await test('esconde peças do sistema, apps sem ícone e a Netflix repetida', async () => {
        const page = await newPage();
        const ids = await page.$$eval('#grid .card', (e) => e.map((x) => x.getAttribute('data-app')));
        for (const bad of ['org.volt.search', 'org.volt.apps', 'org.tizen.caption', 'com.samsung.tv.store', 'Xa1b2C3d4E.EngineHelper', 'org.tizen.netflix-app']) {
            assert(!ids.includes(bad), 'deveria esconder ' + bad);
        }
        const names = await page.$$eval('#grid .label', (e) => e.map((x) => x.textContent));
        assert.strictEqual(names.filter((n) => n === 'Netflix').length, 1, 'Netflix repetida');
        assert.strictEqual(ids.length, 15);
        await noErrors(page);
    });

    await test('entradas HDMI: mostra, renomeia para PS4 e troca para ela', async () => {
        const page = await newPage();
        await page.waitForSelector('#inputRow .card');
        const ids = await page.$$eval('#inputRow .card', (e) => e.map((x) => x.getAttribute('data-app')));
        assert.deepStrictEqual(ids, ['source:HDMI:2', 'source:HDMI:1', 'source:HDMI:3'], 'conectada primeiro');
        assert(!(await page.$eval('#inputsTitle', (e) => e.hidden)));
        assert(/PS4/.test(await page.$eval('[data-app="source:HDMI:1"]', (e) => e.parentNode.textContent)), 'HDMI 1 já vem como PS4');
        await page.waitForSelector('#favRow [data-app="source:HDMI:1"]');
        const favIds = await page.$$eval('#favRow .card', (e) => e.map((x) => x.getAttribute('data-app')));
        assert.strictEqual(favIds[favIds.length - 1], 'source:HDMI:1', 'PS4 no fim dos favoritos');
        assert(favIds[0].endsWith('Netflix'), 'os outros favoritos continuam');
        await key(page, K.OK); // detecta suporte a soltar tecla
        await page.evaluate(() => { window.__launched = []; window.Nav.focus(document.querySelector('[data-app="source:HDMI:2"]')); });
        await key(page, K.OK, { hold: true });
        const items = await page.$$eval('#menuItems .menu-item', (e) => e.map((x) => x.textContent));
        assert(items.includes('Renomear (HDMI 2)'), items.join(','));
        await page.evaluate(() => window.Nav.focus([...document.querySelectorAll('.menu-item')].find((x) => x.textContent.startsWith('Renomear'))));
        await key(page, K.OK);
        assert(/HDMI 2/.test(await page.textContent('#menuTitle')));
        await page.evaluate(() => window.Nav.focus([...document.querySelectorAll('.menu-item')].find((x) => x.textContent === 'PS4')));
        await key(page, K.OK);
        await page.waitForFunction(() => /PS4/.test(document.querySelector('#inputRow .tile').textContent));
        assert(await page.$('#inputRow [data-app="source:HDMI:2"] .brand svg'), 'ícone do PlayStation');
        assert.strictEqual(await page.evaluate(() => window.Nav.current().getAttribute('data-app')), 'source:HDMI:2', 'foco fica no PS4');
        await page.screenshot({ path: path.join(OUT, 'entradas-ps4.png') });
        // abre o PS4: troca a fonte e mostra a imagem
        await key(page, K.OK);
        await page.waitForTimeout(100);
        assert.deepStrictEqual(await page.evaluate(() => window.__source), { type: 'HDMI', number: 2 });
        assert.deepStrictEqual(await page.evaluate(() => window.__launched), ['org.tizen.tv-viewer']);
        // vira favorito e continua com o nome depois de reabrir
        await page.evaluate(() => window.SanvttoApp.openMenu(document.querySelector('[data-app="source:HDMI:2"]')));
        await page.evaluate(() => window.Nav.focus([...document.querySelectorAll('.menu-item')].find((x) => x.textContent === 'Adicionar aos favoritos')));
        await key(page, K.OK);
        await page.reload();
        await page.waitForSelector('#favRow [data-app="source:HDMI:2"]');
        assert(/PS4/.test(await page.$eval('#favRow [data-app="source:HDMI:2"]', (e) => e.parentNode.textContent)));
        await noErrors(page);
    });

    await test('troca de entrada falhou: avisa e mostra a última fonte', async () => {
        const page = await newPage({ init: () => { window.__SOURCE_FAIL = true; } });
        await page.waitForSelector('#inputRow .card');
        await page.evaluate(() => window.Nav.focus(document.querySelector('[data-app="source:HDMI:2"]')));
        await key(page, K.OK);
        await page.waitForTimeout(150);
        assert(/Source/.test(await page.textContent('#toast')), await page.textContent('#toast'));
        await noErrors(page);
    });

    await test('sem informação das entradas: mostra HDMI 1 a 3', async () => {
        const page = await newPage({ init: () => { window.__NO_SOURCES = true; } });
        await page.waitForSelector('#inputRow .card');
        assert.deepStrictEqual(await page.$$eval('#inputRow .card', (e) => e.map((x) => x.getAttribute('data-app'))),
            ['source:HDMI:1', 'source:HDMI:2', 'source:HDMI:3']);
        await noErrors(page);
    });

    await test('YouTube e Prime Video com ícone próprio (a TV manda ícone genérico)', async () => {
        const page = await newPage();
        const yt = await page.$('#grid [data-app="app1.YouTube"] .brand svg path');
        assert(yt, 'YouTube sem ícone');
        assert.strictEqual(await yt.getAttribute('fill'), '#FF0000');
        assert.strictEqual(await page.$eval('#grid [data-app="app2.PrimeVideo"] .brand-text', (e) => e.textContent), 'prime video');
        assert.strictEqual(await page.$$eval('#grid [data-app="app2.PrimeVideo"] img', (e) => e.length), 0, 'não usa o ícone genérico da TV');
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, 'icones-marcas.png') });
        await noErrors(page);
    });

    await test('ocultar um app pelo menu e mostrar de novo nos ajustes', async () => {
        const page = await newPage();
        await key(page, K.OK); // detecta suporte a soltar tecla
        await page.evaluate(() => { window.__launched = []; window.Nav.focus(document.querySelector('#grid [data-app="app10.Clima"]')); });
        await key(page, K.OK, { hold: true });
        const items = await page.$$eval('#menuItems .menu-item', (e) => e.map((x) => x.textContent));
        assert(items.includes('Ocultar este app'), items.join(','));
        await page.evaluate(() => window.Nav.focus([...document.querySelectorAll('.menu-item')].find((x) => x.textContent === 'Ocultar este app')));
        await key(page, K.OK);
        assert.strictEqual(await page.$$eval('#grid [data-app="app10.Clima"]', (e) => e.length), 0, 'não ocultou');
        assert.strictEqual(await page.$$eval('#favRow [data-app="app0.Netflix"]', (e) => e.length), 1, 'ocultou o app errado');
        assert.strictEqual(await page.$$eval('#grid .card', (e) => e.length), 14);
        await page.reload();
        await page.waitForSelector('#grid .card');
        assert.strictEqual(await page.$$eval('#grid [data-app="app10.Clima"]', (e) => e.length), 0, 'voltou depois de reabrir');
        await page.evaluate(() => window.SanvttoApp.openSettings());
        await page.evaluate(() => window.Nav.focus([...document.querySelectorAll('.set-row')].find((x) => x.textContent.startsWith('Mostrar apps ocultos'))));
        await key(page, K.OK);
        await key(page, K.BACK);
        assert.strictEqual(await page.$$eval('#grid [data-app="app10.Clima"]', (e) => e.length), 1, 'não mostrou de novo');
        assert.strictEqual((await focusedInfo(page)).kind, 'fav', 'foco deve voltar para os apps, não para o botão Quadro');
        assert.deepStrictEqual(await page.evaluate(() => window.__launched), [], 'não pode abrir app');
        await noErrors(page);
    });

    await test('lista de apps bloqueada: usa a lista reserva só com os instalados', async () => {
        const page = await newPage({ init: () => {
            window.__APPS_FAIL = true;
            window.__NO_SYSTEM_APPS = true;
            window.__INSTALLED_KNOWN = [{ id: '3201907018807', name: 'Netflix', iconPath: '' }, { id: '111299001912', name: 'YouTube', iconPath: '' }];
        } });
        await page.waitForSelector('#grid .card');
        const ids = await page.$$eval('#grid .card', (e) => e.map((x) => x.getAttribute('data-app')));
        assert.deepStrictEqual(ids.sort(), ['111299001912', '3201907018807']);
        assert((await page.$$eval('#favRow .card:not([data-app^="source:"])', (e) => e.length)) === 2, 'viram favoritos');
        const diag = await page.evaluate(() => window.Store.Diag.get('apps'));
        assert(/lista reserva com 2/.test(diag) && /SecurityError/.test(diag), diag);
        await key(page, K.OK);
        assert.strictEqual((await page.evaluate(() => window.__launched))[0], '3201907018807');
        await noErrors(page);
    });

    await test('lista bloqueada e TV não deixa conferir: mostra a lista reserva inteira', async () => {
        const page = await newPage({ init: () => { window.__APPS_FAIL = true; window.__APPINFO_SECURITY = true; } });
        await page.waitForSelector('#grid .card');
        assert.strictEqual(await page.$$eval('#grid .card', (e) => e.length), 11);
        assert(/sem conferir/.test(await page.evaluate(() => window.Store.Diag.get('apps'))));
        await noErrors(page);
    });

    await test('obras sem CORS: aparecem direto da internet', async () => {
        const page = await newPage({ noCors: true });
        for (let i = 0; i < 100 && (await page.evaluate(async () => (await window.Store.listArt()).length)) < 2; i++) await page.waitForTimeout(100);
        const recs = await page.evaluate(async () => (await window.Store.listArt()).map((a) => ({ blob: !!a.blob, url: a.url || '' })));
        assert.strictEqual(recs.length, 2, JSON.stringify(recs));
        assert(recs.every((r) => !r.blob && r.url.startsWith('https://www.artic.edu/iiif/')), JSON.stringify(recs));
        assert(/direto da internet/.test(await page.evaluate(() => window.Store.Diag.get('art'))));
        await page.evaluate(() => { localStorage.setItem('sv.artIndex', 0); window.SanvttoApp.openArt(); });
        await page.waitForTimeout(2600);
        const title = await page.textContent('#artTitle');
        assert(['A Tarde no Campo', 'Retrato'].includes(title), 'título: ' + title);
        await key(page, K.D);
        await page.waitForSelector('#galArt .gal-thumb img');
        await page.waitForTimeout(300);
        assert(!(await page.$$eval('#galArt .gal-thumb', (e) => e.some((x) => x.classList.contains('broken')))), 'miniatura quebrada');
        await noErrors(page);
    });

    await test('Art Institute fora do ar: busca no Wikimedia', async () => {
        const page = await newPage({ aicDown: true, wikimedia: true });
        for (let i = 0; i < 100 && (await page.evaluate(async () => (await window.Store.listArt()).length)) < 1; i++) await page.waitForTimeout(100);
        await page.waitForTimeout(500);
        const list = await page.evaluate(async () => (await window.Store.listArt()).map((a) => [a.title, a.artist, a.date]));
        assert.deepStrictEqual(list, [['Paisagem com Rio', 'Fulano de Tal', '1882']], 'torre estreita deve ser ignorada');
        const diag = await page.evaluate(() => window.Store.Diag.get('art'));
        assert(/Wikimedia/.test(diag), diag);
        await noErrors(page);
    });

    await test('tudo offline: o quadro explica o motivo e o diagnóstico mostra o erro', async () => {
        const page = await newPage({ offline: true });
        await page.evaluate(() => window.Store.refreshArt(true));
        const diag = await page.evaluate(() => window.Store.Diag.get('art'));
        assert(/falhou/.test(diag) && /Art Institute/.test(diag) && /Wikimedia/.test(diag) && /Met/.test(diag), diag);
        await page.evaluate(() => window.SanvttoApp.openArt());
        await page.waitForTimeout(800);
        assert(/falhou/.test(await page.textContent('#artSub')), 'legenda deve mostrar o motivo');
        await key(page, K.BACK);
        await page.evaluate(() => window.SanvttoApp.openSettings());
        await page.evaluate(() => { const r = [...document.querySelectorAll('.set-row')].find((x) => x.textContent.startsWith('Obras')); window.Nav.focus(r); });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(OUT, 'diagnostico.png') });
        const shown = await page.evaluate(() => [...document.querySelectorAll('.set-row')].map((r) => r.textContent));
        assert(shown.some((t) => t.startsWith('Apps') && /apps/.test(t)), 'linha Apps');
        assert(shown.some((t) => t.startsWith('Obras') && /falhou/.test(t)), 'linha Obras');
        await noErrors(page);
    });

    await test('TV lenta (20 s para listar apps): mostra quando chegar e guarda para a próxima', async () => {
        const page = await newPage({ clock: true, offline: true, init: () => { window.__APPS_DELAY = 20000; window.__NO_SYSTEM_APPS = true; }, noWait: true });
        await page.clock.runFor(8500);
        assert.strictEqual(await page.$$eval('#grid .card', (e) => e.length), 0, 'ainda sem a lista');
        assert(/aguardando/.test(await page.evaluate(() => window.Store.Diag.get('apps'))));
        assert.strictEqual(await page.evaluate(() => localStorage.getItem('sv.favs')), null, 'não cria favoritos com a lista reserva');
        await page.evaluate(() => window.SanvttoApp.openSettings()); // lista chega com os ajustes abertos
        await page.clock.runFor(12000);
        assert.strictEqual(await page.$$eval('#grid .card', (e) => e.length), 15, 'lista atrasada não apareceu');
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'settings', 'não pode fechar os ajustes');
        assert(await page.evaluate(() => window.Nav.current().classList.contains('set-row')), 'foco continua nos ajustes');
        assert(/15 apps .*em 20 s/.test(await page.evaluate(() => window.Store.Diag.get('apps'))));
        assert((await page.evaluate(() => JSON.parse(localStorage.getItem('sv.favs'))))[0].endsWith('Netflix'), 'favoritos padrão');
        await key(page, K.BACK, { wait: 0 });
        assert.strictEqual((await focusedInfo(page)).kind !== undefined, true);
        // próxima abertura: aparece na hora, pela lista salva
        await page.reload();
        await page.clock.runFor(300);
        assert.strictEqual(await page.$$eval('#grid .card', (e) => e.length), 15, 'lista salva não apareceu na hora');
        await noErrors(page);
    });

    await test('lista reserva acha o app pelo código do Tizen também', async () => {
        const page = await newPage({ init: () => {
            window.__APPS_FAIL = true;
            window.__NO_SYSTEM_APPS = true;
            window.__INSTALLED_KNOWN = [{ id: '9Ur5IzDKqV.TizenYouTube', name: 'YouTube', iconPath: '' }];
        } });
        await page.waitForSelector('#grid .card');
        assert.deepStrictEqual(await page.$$eval('#grid .card', (e) => e.map((x) => x.getAttribute('data-app'))), ['9Ur5IzDKqV.TizenYouTube']);
        await noErrors(page);
    });

    await test('busca pelo menos 20 obras e troca a cada 10 segundos', async () => {
        const page = await newPage({ wikimedia: true, wikimediaMany: true, noCors: true });
        for (let i = 0; i < 150 && (await page.evaluate(async () => (await window.Store.listArt()).length)) < 20; i++) await page.waitForTimeout(100);
        const n = await page.evaluate(async () => (await window.Store.listArt()).length);
        assert(n >= 20, 'só ' + n + ' obras');
        await page.waitForFunction(() => /guardadas: \d+/.test(window.Store.Diag.get('art')), null, { timeout: 15000 });
        await page.evaluate(() => { localStorage.setItem('sv.artIndex', 0); window.SanvttoApp.openArt(); });
        await page.waitForTimeout(2500);
        const seen = new Set([await page.textContent('#artTitle')]);
        for (let i = 0; i < 2; i++) {
            await page.waitForTimeout(10500);
            seen.add(await page.textContent('#artTitle'));
        }
        assert(seen.size >= 3, 'não trocou a cada 10 s: ' + [...seen].join(' / '));
        await noErrors(page);
    });

    await test('Wikimedia recusa 1920 px: usa 1280 px', async () => {
        const page = await newPage({ wikimedia: true, wm1920Broken: true, noCors: true });
        for (let i = 0; i < 100 && (await page.evaluate(async () => (await window.Store.listArt()).length)) < 1; i++) await page.waitForTimeout(100);
        const urls = await page.evaluate(async () => (await window.Store.listArt()).map((a) => a.url).filter((u) => u.includes('wikimedia')));
        assert.deepStrictEqual(urls, ['https://upload.wikimedia.org/thumb/a/paisagem.jpg/1280px-paisagem.jpg']);
        await noErrors(page);
    });

    await test('100 apps: monta rápido e navega liso', async () => {
        const names = Array.from({ length: 100 }, (_, i) => 'App ' + String(i).padStart(3, '0'));
        const page = await newPage({ init: `window.__APP_NAMES = ${JSON.stringify(names)};` });
        const n = await page.$$eval('#grid .card', (e) => e.length);
        assert.strictEqual(n, 100);
        const ms = await page.evaluate(async () => {
            const t = performance.now();
            for (let i = 0; i < 60; i++) {
                document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: i % 2 ? 39 : 40 }));
                document.dispatchEvent(new KeyboardEvent('keyup', { keyCode: i % 2 ? 39 : 40 }));
            }
            return (performance.now() - t) / 60;
        });
        assert(ms < 8, 'cada tecla levou ' + ms.toFixed(2) + ' ms (limite 8 ms)');
        console.log('    tempo por tecla: ' + ms.toFixed(2) + ' ms');
        await noErrors(page);
    });

    await test('modo quadro offline: pintura gerada, setas trocam, voltar sai', async () => {
        const page = await newPage({ offline: true });
        await page.evaluate(() => window.SanvttoApp.openArt());
        await page.waitForTimeout(2600);
        assert.strictEqual(await page.evaluate(() => window.__screenSaver.slice(-1)[0]), 0, 'proteção de tela da TV deve ser desligada');
        await page.screenshot({ path: path.join(OUT, 'quadro-offline.png') });
        const t1 = await page.textContent('#artTitle');
        await key(page, K.R, { wait: 300 });
        const t2 = await page.textContent('#artTitle');
        assert.notStrictEqual(t1, t2, 'seta não trocou');
        await key(page, K.L, { wait: 300 });
        await key(page, K.BACK, { wait: 100 });
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'home');
        assert(await page.$eval('#art', (e) => e.hidden));
        assert.strictEqual(await page.evaluate(() => window.__screenSaver.slice(-1)[0]), 1, 'proteção de tela devolvida');
        await noErrors(page);
    });

    await test('museus: baixa obras, ignora quebradas/estreitas e guarda offline', async () => {
        const page = await newPage();
        for (let i = 0; i < 100 && (await page.evaluate(async () => (await window.Store.listArt()).length)) < 2; i++) await page.waitForTimeout(100);
        await page.waitForTimeout(500); // garante que nada mais chega (estreita/quebrada)
        const titles = (await page.evaluate(async () => (await window.Store.listArt()).map((a) => a.title))).sort();
        assert.deepStrictEqual(titles, ['A Tarde no Campo', 'Retrato']);
        for (const style of [0, 1, 2, 3, 4]) {
            await page.evaluate((s) => { localStorage.setItem('sv.frameStyle', s); localStorage.setItem('sv.artIndex', 0); }, style);
            await page.evaluate(() => window.SanvttoApp.openArt());
            await page.waitForTimeout(2600);
            await page.screenshot({ path: path.join(OUT, 'quadro-moldura-' + style + '.png') });
            await key(page, K.R, { wait: 2600 });
            if (style === 1) await page.screenshot({ path: path.join(OUT, 'quadro-retrato.png') });
            await key(page, K.BACK, { wait: 100 });
        }
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(OUT, 'home-fundo-obra.png') });
        await noErrors(page);
    });

    await test('galeria do Modo Arte: escolher obra, estilo e cor pelo controle', async () => {
        const page = await newPage({ clock: true, clockTime: new Date('2026-03-15T14:00:00-03:00') });
        for (let i = 0; i < 100 && (await page.evaluate(async () => (await window.Store.listArt()).length)) < 2; i++) await page.clock.runFor(100);
        assert(await page.evaluate(async () => (await window.Store.listArt()).every((a) => a.thumb && a.thumb.size > 0)), 'miniaturas não geradas');
        await page.evaluate(() => window.Nav.focus(document.querySelector('#grid .card')));
        const before = await page.evaluate(() => window.Nav.current().getAttribute('data-app'));
        await page.evaluate(() => { localStorage.setItem('sv.artIndex', 0); window.SanvttoApp.openArt(); });
        await page.clock.runFor(2500);
        await key(page, K.D, { wait: 0 });
        await page.waitForSelector('#galArt .gal-thumb');
        assert(!(await page.$eval('#gallery', (e) => e.hidden)), 'galeria não abriu');
        assert.strictEqual(await page.$$eval('#galArt .gal-thumb', (e) => e.length), 2);
        assert.strictEqual(await page.$$eval('#galStyle .gal-chip', (e) => e.length), 5);
        assert.strictEqual(await page.$$eval('#galMat .gal-swatch', (e) => e.length), 7);
        assert.strictEqual(await page.evaluate(() => window.Nav.current().classList.contains('selected')), true, 'começa na obra em exibição');
        await page.waitForTimeout(2600); // fade do CSS roda em tempo real
        await page.screenshot({ path: path.join(OUT, 'galeria.png') });
        // escolhe a outra obra
        await key(page, K.R, { wait: 0 });
        const want = await page.evaluate(() => window.Nav.current().getAttribute('data-title'));
        await key(page, K.OK, { wait: 0 });
        await page.clock.runFor(500);
        // a imagem carrega de forma assíncrona: espera o título mudar (até 5 s)
        await page.waitForFunction((t) => document.getElementById('artTitle').textContent === t, want, { timeout: 5000 }).catch(() => {});
        assert.strictEqual(await page.textContent('#artTitle'), want, 'obra escolhida não apareceu');
        assert(!(await page.$eval('#gallery', (e) => e.hidden)), 'galeria deve continuar aberta');
        // estilo Shadowbox
        await key(page, K.D, { wait: 0 });
        assert.strictEqual(await page.evaluate(() => window.Nav.current().parentNode.id), 'galStyle');
        await page.evaluate(() => window.Nav.focus(document.querySelector('#galStyle [data-id="2"]')));
        await key(page, K.OK, { wait: 0 });
        assert.strictEqual(await page.evaluate(() => localStorage.getItem('sv.frameStyle')), '2');
        // cor Sálvia
        await key(page, K.R, { wait: 0 }); await key(page, K.R, { wait: 0 }); await key(page, K.R, { wait: 0 });
        assert.strictEqual(await page.evaluate(() => window.Nav.current().parentNode.id), 'galMat', 'direita leva às cores');
        await page.evaluate(() => window.Nav.focus(document.querySelector('#galMat [data-id="3"]')));
        await key(page, K.OK, { wait: 0 });
        assert.strictEqual(await page.evaluate(() => localStorage.getItem('sv.matColor')), '3');
        await page.clock.runFor(400);
        await page.waitForTimeout(2600);
        await page.screenshot({ path: path.join(OUT, 'galeria-shadowbox-salvia.png') });
        // ↑ até fechar a galeria
        for (let i = 0; i < 4; i++) await key(page, K.U, { wait: 0 });
        assert(await page.$eval('#gallery', (e) => e.hidden), '↑ deve fechar a galeria');
        await page.clock.runFor(8000);
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(OUT, 'quadro-shadowbox-salvia.png') });
        // vinho = passe-partout escuro: texto claro
        await key(page, K.D, { wait: 0 });
        await page.waitForSelector('#galMat [data-id="5"]');
        await page.evaluate(() => window.Nav.focus(document.querySelector('#galMat [data-id="5"]')));
        await key(page, K.OK, { wait: 0 });
        assert.strictEqual(await page.evaluate(() => document.getElementById('art').classList.contains('on-mat')), false, 'texto deve ficar claro no vinho');
        await key(page, K.BACK, { wait: 0 });
        assert(await page.$eval('#gallery', (e) => e.hidden));
        await key(page, K.BACK, { wait: 0 });
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'home');
        assert.strictEqual(await page.evaluate(() => window.Nav.current().getAttribute('data-app')), before, 'foco volta para o app de antes');
        await noErrors(page);
    });

    await test('legenda e relógio (com dia da semana) ficam no passe-partout, sem cobrir a obra', async () => {
        const page = await newPage({ clock: true, clockTime: new Date('2026-10-24T16:15:00-03:00') });
        for (let i = 0; i < 100 && (await page.evaluate(async () => (await window.Store.listArt()).length)) < 2; i++) await page.clock.runFor(100);
        const ids = await page.evaluate(async () => (await window.Store.listArt()).map((a) => a.id));
        for (const style of [0, 1, 2, 3, 4]) {
            for (const id of ids) {
                await page.evaluate(([s]) => { localStorage.setItem('sv.frameStyle', s); localStorage.setItem('sv.matColor', 0); }, [style]);
                await page.evaluate(() => window.SanvttoApp.openArt());
                await key(page, K.D, { wait: 0 });
                await page.waitForSelector('#galArt .gal-thumb');
                await page.evaluate((v) => window.Nav.focus(document.querySelector('#galArt [data-art="' + v + '"]')), id);
                await key(page, K.OK, { wait: 0 });
                await page.clock.runFor(300);
                await key(page, K.BACK, { wait: 0 }); // fecha a galeria
                await key(page, K.OK, { wait: 0 });   // mostra a legenda
                await page.waitForTimeout(900);
                const r = await page.evaluate(() => {
                    const lay = window.Art.layout();
                    const box = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
                    return { lay, info: box('artInfo'), clock: box('artClock'), text: document.getElementById('artClock').textContent };
                });
                // (o fuso do computador de testes pode ser outro: confere o formato, não a hora)
                assert(/^Sábado, 24 de outubro · \d\d:\d\d$/.test(r.text), 'relógio: ' + r.text);
                const tag = 'estilo ' + style + ' / ' + id;
                for (const k of ['info', 'clock']) {
                    const b = r[k];
                    assert(b.left >= 0 && b.right <= 1920 && b.top >= 0 && b.bottom <= 1080, tag + ': ' + k + ' fora da tela');
                    if (style !== 0) {
                        const a = r.lay.art;
                        assert(b.top >= a.y + a.h, tag + ': ' + k + ' em cima da obra ' + JSON.stringify(b) + ' ' + JSON.stringify(a));
                        assert(b.bottom <= r.lay.matBottom, tag + ': ' + k + ' saiu do passe-partout');
                    }
                }
                assert(r.info.right <= r.clock.left + 1, tag + ': legenda encosta no relógio');
                if (style === 1) await page.screenshot({ path: path.join(OUT, 'legenda-moderno-' + id.replace(':', '') + '.png') });
                await key(page, K.BACK, { wait: 0 }); // sai do quadro
            }
        }
        await noErrors(page);
    });

    await test('obra corrompida no acervo é pulada sem travar', async () => {
        const page = await newPage({ offline: true });
        await page.evaluate(async () => {
            await window.Store.putArt({ id: 'ruim', title: 'Ruim', artist: '', date: '', blob: new Blob(['x'.repeat(2000)], { type: 'image/jpeg' }), added: 2 });
        });
        await page.evaluate(() => window.SanvttoApp.openArt());
        await page.waitForTimeout(800);
        const title = await page.textContent('#artTitle');
        assert(title.length > 0 && title !== 'Ruim', 'título: ' + title);
        await key(page, K.BACK);
        await noErrors(page);
    });

    await test('quadro abre sozinho após o tempo sem uso e troca de obra sozinho', async () => {
        const page = await newPage({ clock: true, offline: true, init: () => { localStorage.setItem('sv.idleMin', 5); localStorage.setItem('sv.artInterval', 1); } });
        await page.clock.runFor(4 * 60000);
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'home');
        await key(page, K.R); // uso reinicia a contagem
        await page.clock.runFor(4 * 60000);
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'home', 'contagem não reiniciou');
        await page.clock.runFor(70000);
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'art', 'quadro não abriu sozinho');
        await page.clock.runFor(1000);
        const t1 = await page.textContent('#artTitle');
        await page.clock.runFor(61000);
        const t2 = await page.textContent('#artTitle');
        assert.notStrictEqual(t1, t2, 'não trocou de obra sozinho');
        await noErrors(page);
    });

    await test('quadro abre sozinho mesmo parado nos ajustes ou no menu de um app', async () => {
        const page = await newPage({ clock: true, offline: true });
        assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('sv.idleMin') || '5')), 5, 'padrão 5 min');
        await page.evaluate(() => window.SanvttoApp.openSettings());
        await page.clock.runFor(5 * 60000 + 1000);
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'art', 'não abriu a partir dos ajustes');
        assert(await page.$eval('#settings', (e) => e.hidden), 'ajustes deveriam fechar');
        await key(page, K.BACK, { wait: 0 });
        await page.evaluate(() => window.SanvttoApp.openMenu(document.querySelector('#favRow .card')));
        await page.clock.runFor(5 * 60000 + 1000);
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'art', 'não abriu a partir do menu');
        assert(await page.$eval('#menu', (e) => e.hidden), 'menu deveria fechar');
        await key(page, K.BACK, { wait: 0 });
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'home');
        await noErrors(page);
    });

    await test('escurece o quadro à noite e o tema muda sozinho', async () => {
        const page = await newPage({ clock: true, offline: true, clockTime: new Date('2026-03-15T22:30:00-03:00') });
        assert.strictEqual(await page.evaluate(() => document.body.classList.contains('dark')), true, 'à noite o tema é escuro');
        await page.evaluate(() => window.SanvttoApp.openArt());
        await page.clock.runFor(500);
        const dim = await page.evaluate(() => parseFloat(document.getElementById('artDim').style.opacity));
        assert(dim > 0.2 && dim <= 0.6, 'escurecimento: ' + dim);
        await noErrors(page);
        const day = await newPage({ clock: true, clockTime: new Date('2026-03-15T13:00:00-03:00') });
        assert.strictEqual(await day.evaluate(() => document.body.classList.contains('light')), true, 'de dia o tema é claro');
        await day.waitForTimeout(400);
        await day.screenshot({ path: path.join(OUT, 'home-claro.png') });
        await noErrors(day);
    });

    await test('cálculo do sol em São Paulo (janeiro e junho)', async () => {
        const page = await newPage();
        const r = await page.evaluate(() => [
            window.Theme.sunTimes(new Date(2026, 0, 10, 12), -180), window.Theme.sunTimes(new Date(2026, 5, 21, 12), -180)]);
        assert(Math.abs(r[0].rise - 5.33) < 0.5 && Math.abs(r[0].set - 19) < 0.5, 'janeiro ' + JSON.stringify(r[0]));
        assert(Math.abs(r[1].rise - 6.75) < 0.5 && Math.abs(r[1].set - 17.5) < 0.5, 'junho ' + JSON.stringify(r[1]));
        const bad = await page.evaluate(() => {
            const out = [];
            for (let tz = -720; tz <= 840; tz += 30) for (let m = 0; m < 1440; m += 13) {
                const d = new Date(2026, 6, 1, Math.floor(m / 60), m % 60);
                const v = window.Theme.nightDim(d, tz);
                if (!(v >= 0 && v <= 0.6)) out.push([tz, m, v]);
            }
            return out;
        });
        assert.deepStrictEqual(bad, []);
        await noErrors(page);
    });

    await test('ajustes: percorre e alterna todas as opções', async () => {
        const page = await newPage({ offline: true });
        await page.evaluate(() => window.SanvttoApp.openSettings());
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, 'ajustes.png') });
        const rows = await page.$$eval('.set-row', (e) => e.length);
        for (let i = 0; i < rows; i++) {
            const t = await page.evaluate(() => window.Nav.current().firstChild.textContent);
            if (!/Abrir o quadro|Baixar|Recarregar/.test(t)) for (let k = 0; k < 7; k++) await key(page, K.OK);
            await key(page, K.D);
        }
        const last = await page.evaluate(() => window.Nav.current().getBoundingClientRect().toJSON());
        assert(last.bottom <= 1080, 'último ajuste fora da tela');
        await page.screenshot({ path: path.join(OUT, 'ajustes-fim.png') });
        await key(page, K.BACK);
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'home');
        await noErrors(page);
    });

    await test('vidro: transparência ajustável e prints sobre uma obra', async () => {
        const page = await newPage();
        for (let i = 0; i < 100 && (await page.evaluate(async () => (await window.Store.listArt()).length)) < 2; i++) await page.waitForTimeout(100);
        await page.evaluate(() => { localStorage.setItem('sv.artIndex', 0); });
        await page.evaluate(() => window.SanvttoApp.openArt());
        await key(page, K.BACK, { wait: 1500 }); // fecha o quadro e recarrega o fundo com a obra
        for (const [g, name] of [[0, 'vidro'], [1, 'media'], [2, 'reduzida']]) {
            await page.evaluate((v) => { localStorage.setItem('sv.glass', v); }, g);
            await page.evaluate(() => window.SanvttoApp.openSettings());
            await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 8 })));
            const cls = await page.evaluate(() => document.body.className);
            assert.strictEqual(cls.includes('glass-med'), g === 1, cls);
            assert.strictEqual(cls.includes('glass-low'), g === 2, cls);
            await page.waitForTimeout(400);
            await page.screenshot({ path: path.join(OUT, 'vidro-' + name + '.png') });
        }
        await page.evaluate(() => localStorage.setItem('sv.glass', 0));
        await page.evaluate(() => window.SanvttoApp.openSettings());
        assert(await page.evaluate(() => document.body.classList.contains('in-settings')), 'tela inicial deve sumir atrás dos ajustes');
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, 'vidro-ajustes.png') });
        // alterna a transparência pelos próprios ajustes
        await key(page, K.D);
        assert.strictEqual(await page.evaluate(() => window.Nav.current().firstChild.textContent), 'Transparência');
        await key(page, K.OK);
        assert(await page.evaluate(() => document.body.classList.contains('glass-med')), 'ajuste não aplicou');
        await key(page, K.BACK);
        assert(!(await page.evaluate(() => document.body.classList.contains('in-settings'))));
        await page.evaluate(() => window.SanvttoApp.openMenu(document.querySelector('#favRow .card')));
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, 'vidro-menu.png') });
        await noErrors(page);
    });

    await test('modo seguro depois de 2 erros, e volta ao normal', async () => {
        const page = await newPage({ init: () => { if (!sessionStorage.getItem('done')) localStorage.setItem('sv.crashes', JSON.stringify([Date.now(), Date.now()])); } });
        assert(!(await page.$eval('#safe', (e) => e.hidden)), 'modo seguro não abriu');
        await page.waitForSelector('#safeList .pill');
        await page.screenshot({ path: path.join(OUT, 'modo-seguro.png') });
        await key(page, K.D); await key(page, K.OK);
        assert((await page.evaluate(() => window.__launched)).length === 1, 'lista do modo seguro abre apps');
        await page.evaluate(() => { sessionStorage.setItem('done', 1); window.Nav.focus(document.querySelector('[data-action="leaveSafe"]')); });
        await Promise.all([page.waitForNavigation(), key(page, K.OK)]);
        await page.waitForSelector('#grid .card');
        assert(await page.$eval('#safe', (e) => e.hidden), 'não saiu do modo seguro');
        await noErrors(page);
    });

    await test('ao voltar de outro app, fecha o quadro e recarrega a lista', async () => {
        const page = await newPage({ offline: true });
        await page.evaluate(() => window.SanvttoApp.openArt());
        await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        assert.strictEqual(await page.evaluate(() => window.SanvttoApp.mode()), 'home');
        await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForTimeout(200);
        assert(await focusedInfo(page));
        await noErrors(page);
    });

    await browser.close();
    server.close();
    const fail = results.filter((r) => !r.ok);
    console.log(`\n${results.length - fail.length}/${results.length} testes passaram`);
    if (fail.length) { fail.forEach((f) => console.log('\n✗ ' + f.name + '\n' + f.err)); process.exit(1); }
})();
