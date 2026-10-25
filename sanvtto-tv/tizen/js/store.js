/* Ajustes (localStorage) e acervo do quadro (IndexedDB, funciona offline). */
(function (global) {
    'use strict';

    var DEFAULTS = {
        theme: 0,        // 0 automático, 1 claro, 2 escuro
        idleMin: 5,      // abrir o quadro após N min sem uso (0 = nunca)
        frameStyle: 1,   // 0 tela cheia, 1 moderno, 2 shadowbox, 3 madeira, 4 moldura preta
        matColor: 0,     // cor do passe-partout (ver Art.MATS)
        artInterval: 15, // minutos entre obras
        nightDim: true,
        artClock: true,
        glass: 0,        // transparência: 0 vidro, 1 média, 2 reduzida
        artIndex: 0,
        lastArtFetch: 0
    };

    function safeGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
    function safeSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* cheio ou bloqueado */ } }

    var Prefs = {
        get: function (key) {
            var raw = safeGet('sv.' + key);
            if (raw === null) return DEFAULTS[key];
            try { return JSON.parse(raw); } catch (e) { return DEFAULTS[key]; }
        },
        set: function (key, value) { safeSet('sv.' + key, JSON.stringify(value)); },
        has: function (key) { return safeGet('sv.' + key) !== null; },
        favorites: function () {
            var f = Prefs.get('favs');
            return Array.isArray(f) ? f.filter(function (x) { return typeof x === 'string'; }) : [];
        },
        setFavorites: function (list) { Prefs.set('favs', list); }
    };

    // ------------------------------------------------------------------ diagnóstico

    /** Guarda o último resultado de apps/obras para a tela Ajustes › Diagnóstico. */
    var Diag = {
        set: function (key, text) {
            var d = new Date();
            var hh = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
            safeSet('sv.diag.' + key, hh + ' · ' + text);
        },
        get: function (key) { return safeGet('sv.diag.' + key) || 'sem dados ainda'; }
    };

    function errText(e) {
        if (!e) return 'erro desconhecido';
        return ((e.name && e.name !== 'Error' ? e.name + ': ' : '') + (e.message || String(e))).slice(0, 120);
    }

    // ------------------------------------------------------------------ acervo

    var DB_NAME = 'sanvtto-art', STORE = 'art', MAX_CACHED = 50, PER_REFRESH = 8;
    var REFRESH_MS = 12 * 3600 * 1000;
    var dbPromise = null;

    function db() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            if (!global.indexedDB) { reject(new Error('sem IndexedDB')); return; }
            var req = global.indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function () {
                var d = req.result;
                if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
        dbPromise.catch(function () { dbPromise = null; });
        return dbPromise;
    }

    function tx(mode, fn) {
        return db().then(function (d) {
            return new Promise(function (resolve, reject) {
                var t = d.transaction(STORE, mode);
                var result = fn(t.objectStore(STORE));
                t.oncomplete = function () { resolve(result && result.result !== undefined ? result.result : undefined); };
                t.onerror = function () { reject(t.error); };
                t.onabort = function () { reject(t.error); };
            });
        });
    }

    /** Lista das obras guardadas, mais novas primeiro. Nunca rejeita. */
    function listArt() {
        return tx('readonly', function (s) { return s.getAll(); })
            .then(function (all) {
                all = (all || []).filter(function (a) { return a && (a.blob || a.url); });
                all.sort(function (a, b) { return (b.added || 0) - (a.added || 0); });
                return all;
            })
            .catch(function () { return []; });
    }

    function putArt(item) { return tx('readwrite', function (s) { s.put(item); }); }
    function deleteArt(id) { return tx('readwrite', function (s) { s['delete'](id); }); }

    function fetchWithTimeout(url, ms) {
        return new Promise(function (resolve, reject) {
            var done = false;
            var timer = setTimeout(function () { done = true; reject(new Error('timeout')); }, ms);
            global.fetch(url).then(function (r) {
                if (done) return;
                clearTimeout(timer);
                if (!r.ok) reject(new Error('HTTP ' + r.status)); else resolve(r);
            }, function (e) { if (!done) { clearTimeout(timer); reject(e); } });
        });
    }

    function shuffle(a) {
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    /** Miniatura de 360 px para a galeria: decodificar a obra inteira em cada item travaria a TV. */
    function makeThumb(blob) {
        return new Promise(function (resolve) {
            var url = global.URL.createObjectURL(blob);
            var img = new global.Image();
            img.onload = function () {
                global.URL.revokeObjectURL(url);
                try {
                    var w = 360, h = Math.max(1, Math.round(img.height * w / img.width));
                    var c = global.document.createElement('canvas');
                    c.width = w; c.height = h;
                    c.getContext('2d').drawImage(img, 0, 0, w, h);
                    if (c.toBlob) c.toBlob(function (b) { resolve(b); }, 'image/jpeg', 0.85);
                    else resolve(null);
                } catch (e) { resolve(null); }
            };
            img.onerror = function () { global.URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
        });
    }

    var thumbing = false;

    /** Gera miniaturas que faltam, uma por vez. Nunca rejeita. */
    function ensureThumbs() {
        if (thumbing) return Promise.resolve();
        thumbing = true;
        return listArt().then(function (all) {
            return all.filter(function (a) { return a.blob && !a.thumb; }).reduce(function (p, a) {
                return p.then(function () {
                    return makeThumb(a.blob).then(function (t) { if (t) { a.thumb = t; return putArt(a); } });
                }).catch(function () {});
            }, Promise.resolve());
        }).catch(function () {}).then(function () { thumbing = false; });
    }

    function isImageBlob(blob) {
        return blob && blob.size > 1000 && /^image\//.test(blob.type || 'image/jpeg');
    }

    function fetchArtInstitute(knownIds) {
        var page = 1 + Math.floor(Math.random() * 20);
        var url = 'https://api.artic.edu/api/v1/artworks/search'
            + '?query%5Bbool%5D%5Bmust%5D%5B0%5D%5Bterm%5D%5Bis_public_domain%5D=true'
            + '&query%5Bbool%5D%5Bmust%5D%5B1%5D%5Bterm%5D%5Bartwork_type_id%5D=1'
            + '&fields=id,title,image_id,artist_title,date_display,thumbnail&limit=40&page=' + page;
        return fetchWithTimeout(url, 15000).then(function (r) { return r.json(); }).then(function (res) {
            var iiif = (res.config && res.config.iiif_url) || 'https://www.artic.edu/iiif/2';
            var items = shuffle((res.data || []).slice()).filter(function (o) {
                if (!o || !o.image_id || knownIds['aic:' + o.id]) return false;
                var th = o.thumbnail;
                if (th && th.width > 0 && th.height > 0) {
                    var ratio = th.width / th.height;
                    if (ratio < 0.55 || ratio > 2.4) return false;
                }
                return true;
            }).slice(0, PER_REFRESH);
            return downloadAll(items.map(function (o) {
                return {
                    id: 'aic:' + o.id,
                    title: o.title || 'Sem título',
                    artist: o.artist_title || '',
                    date: o.date_display || '',
                    url: iiif + '/' + o.image_id + '/full/1686,/0/default.jpg'
                };
            }));
        });
    }

    /** Wikimedia Commons: pinturas destacadas, API com CORS liberado (origin=*). */
    function fetchCommons(knownIds) {
        var url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*'
            + '&generator=categorymembers&gcmtitle=Category:Featured_pictures_of_paintings&gcmtype=file&gcmlimit=60'
            + '&gcmsort=timestamp&gcmdir=' + (Math.random() < 0.5 ? 'asc' : 'desc')
            + '&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1920&iiextmetadatafilter=ObjectName|Artist|DateTimeOriginal';
        return fetchWithTimeout(url, 15000).then(function (r) { return r.json(); }).then(function (res) {
            var pages = res.query && res.query.pages ? res.query.pages : {};
            var list = [];
            Object.keys(pages).forEach(function (k) {
                var p = pages[k], ii = p.imageinfo && p.imageinfo[0];
                if (!ii || !ii.thumburl || knownIds['wm:' + p.pageid]) return;
                if (ii.width && ii.height) {
                    var ratio = ii.width / ii.height;
                    if (ratio < 0.55 || ratio > 2.4) return;
                }
                var md = ii.extmetadata || {};
                var plain = function (f) { return f && f.value ? String(f.value).replace(/<[^>]*>/g, '').trim().slice(0, 80) : ''; };
                list.push({
                    id: 'wm:' + p.pageid,
                    title: plain(md.ObjectName) || String(p.title || '').replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
                    artist: plain(md.Artist),
                    date: plain(md.DateTimeOriginal),
                    url: ii.thumburl,
                    // o Wikimedia só serve miniaturas em tamanhos padrão; se 1920 falhar, tenta 1280
                    alt: ii.thumburl.indexOf('/1920px-') > 0 ? ii.thumburl.replace('/1920px-', '/1280px-') : ''
                });
            });
            return downloadAll(shuffle(list).slice(0, PER_REFRESH));
        });
    }

    function fetchMet(knownIds) {
        var base = 'https://collectionapi.metmuseum.org/public/collection/v1/';
        return fetchWithTimeout(base + 'search?hasImages=true&isHighlight=true&medium=Paintings&q=painting', 15000)
            .then(function (r) { return r.json(); })
            .then(function (res) {
                var ids = shuffle((res.objectIDs || []).slice()).filter(function (id) { return !knownIds['met:' + id]; })
                    .slice(0, PER_REFRESH * 2);
                return Promise.all(ids.map(function (id) {
                    return fetchWithTimeout(base + 'objects/' + id, 15000).then(function (r) { return r.json(); })
                        .then(function (o) {
                            if (!o.isPublicDomain || !o.primaryImage) return null;
                            return { id: 'met:' + id, title: o.title || 'Sem título', artist: o.artistDisplayName || '',
                                date: o.objectDate || '', url: o.primaryImageSmall || o.primaryImage };
                        }, function () { return null; });
                }));
            })
            .then(function (list) { return downloadAll(list.filter(Boolean).slice(0, PER_REFRESH)); });
    }

    /** Confere se a imagem abre direto pela URL (sem CORS — é assim que um <img> carrega). */
    function probeImage(url) {
        return new Promise(function (resolve) {
            var img = new global.Image();
            var timer = setTimeout(function () { img.src = ''; resolve(false); }, 30000);
            img.onload = function () { clearTimeout(timer); resolve(img.width > 0); };
            img.onerror = function () { clearTimeout(timer); resolve(false); };
            img.src = url;
        });
    }

    /**
     * Baixa uma por vez (a rede e a memória da TV agradecem). Se a TV não deixar baixar o arquivo
     * (bloqueio de CORS), guarda só o endereço: a obra aparece direto da internet.
     */
    function downloadAll(items) {
        var saved = [];
        return items.reduce(function (p, it) {
            return p.then(function () {
                var rec = { id: it.id, title: it.title, artist: it.artist, date: it.date, added: Date.now() };
                return fetchWithTimeout(it.url, 30000).then(function (r) { return r.blob(); }).then(function (blob) {
                    if (!isImageBlob(blob)) throw new Error('não é imagem');
                    rec.blob = blob;
                    return makeThumb(blob).then(function (t) { if (t) rec.thumb = t; });
                }).catch(function () {
                    return probeImage(it.url).then(function (ok) {
                        if (ok) { rec.url = it.url; return; }
                        if (it.alt) return probeImage(it.alt).then(function (ok2) { if (ok2) rec.url = it.alt; });
                    });
                }).then(function () {
                    if (!rec.blob && !rec.url) return;
                    return putArt(rec).then(function () { saved.push(rec); });
                }).catch(function () { /* pula esta obra */ });
            });
        }, Promise.resolve()).then(function () { return saved; });
    }

    var refreshing = null;

    /** Atualiza o acervo no máximo a cada 12 h (ou já, se force). Nunca rejeita. */
    function refreshArt(force) {
        if (refreshing) return refreshing;
        if (!global.fetch) return Promise.resolve(0);
        refreshing = listArt().then(function (existing) {
            if (!force && Date.now() - Prefs.get('lastArtFetch') < REFRESH_MS && existing.length >= 12) return 0;
            var known = {};
            existing.forEach(function (a) { known[a.id] = true; });
            var errors = [];
            // tenta um museu de cada vez até um funcionar
            var sources = [['Wikimedia', fetchCommons], ['Art Institute', fetchArtInstitute], ['Met', fetchMet]];
            var used = '';
            return sources.reduce(function (p, src) {
                return p.then(function (got) {
                    if (got.length) return got;
                    return src[1](known).then(function (list) {
                        if (!list.length) errors.push(src[0] + ': nenhuma imagem abriu');
                        used = src[0];
                        return list;
                    }, function (e) { errors.push(src[0] + ': ' + errText(e)); return []; });
                });
            }, Promise.resolve([]))
                .then(function (got) {
                    if (!got.length) {
                        Diag.set('art', 'falhou — ' + errors.join(' | '));
                        return 0;
                    }
                    Diag.set('art', got.length + ' obras novas (' + used + ')' + (got[0].blob ? '' : ' · direto da internet'));
                    Prefs.set('lastArtFetch', Date.now());
                    return listArt().then(function (all) {
                        var extra = all.slice(MAX_CACHED);
                        return Promise.all(extra.map(function (a) { return deleteArt(a.id).catch(function () {}); }));
                    }).then(function () { return got.length; });
                });
        }).catch(function (e) { Diag.set('art', 'falhou — ' + errText(e)); return 0; })
            .then(function (n) { refreshing = null; return n; });
        return refreshing;
    }

    global.Store = { Prefs: Prefs, listArt: listArt, putArt: putArt, refreshArt: refreshArt, ensureThumbs: ensureThumbs,
        Diag: Diag, errText: errText };
})(this);
