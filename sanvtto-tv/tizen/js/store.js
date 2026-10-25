/* Ajustes (localStorage) e acervo do quadro (IndexedDB, funciona offline). */
(function (global) {
    'use strict';

    var DEFAULTS = {
        theme: 0,        // 0 automático, 1 claro, 2 escuro
        idleMin: 10,     // abrir o quadro após N min sem uso (0 = nunca)
        frameStyle: 1,   // 0 tela cheia, 1 passe-partout branco, 2 preto, 3 madeira, 4 moldura preta
        artInterval: 15, // minutos entre obras
        nightDim: true,
        artClock: true,
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
                all = (all || []).filter(function (a) { return a && a.blob; });
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

    /** Baixa uma por vez (a rede e a memória da TV agradecem). */
    function downloadAll(items) {
        var saved = [];
        return items.reduce(function (p, it) {
            return p.then(function () {
                return fetchWithTimeout(it.url, 30000).then(function (r) { return r.blob(); }).then(function (blob) {
                    if (!isImageBlob(blob)) return;
                    var rec = { id: it.id, title: it.title, artist: it.artist, date: it.date, blob: blob, added: Date.now() };
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
            if (global.navigator && global.navigator.onLine === false) return 0;
            var known = {};
            existing.forEach(function (a) { known[a.id] = true; });
            return fetchArtInstitute(known)
                .catch(function () { return []; })
                .then(function (got) { return got.length ? got : fetchMet(known).catch(function () { return []; }); })
                .then(function (got) {
                    if (!got.length) return 0;
                    Prefs.set('lastArtFetch', Date.now());
                    return listArt().then(function (all) {
                        var extra = all.slice(MAX_CACHED);
                        return Promise.all(extra.map(function (a) { return deleteArt(a.id).catch(function () {}); }));
                    }).then(function () { return got.length; });
                });
        }).catch(function () { return 0; }).then(function (n) { refreshing = null; return n; });
        return refreshing;
    }

    global.Store = { Prefs: Prefs, listArt: listArt, putArt: putArt, refreshArt: refreshArt };
})(this);
