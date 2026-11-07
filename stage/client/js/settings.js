/**
 * Settings Manager - persistent panel settings in localStorage.
 * Paths use dot notation: Settings.get('export.scale').
 */
SMDA.Settings = (function () {
    var KEY = 'smda.settings.v1';

    var DEFAULTS = {
        selectedPresets: ['instagram_post', 'instagram_story', 'facebook_post', 'linkedin_post', 'youtube_thumbnail'],
        recent: [],
        customPresets: [],
        defaults: { fmt: 'png', convention: 'preset', scale: 100, folder: '' },
        gen: { qty: 1, gap: 100, layout: 'platform-rows', tpl: '{key}', placeAfter: true, safeAfter: false },
        auto: {
            source: -1, useSelection: false, target: 'all', mode: 'fit', margin: 5,
            scaleStrokes: true, clip: false, alignX: 'center', alignY: 'middle',
            bgMode: 'extend', replace: true, groupLayers: true, safeText: true, safeOverlays: true
        },
        exp: {
            scope: 'all', fmt_png: true, fmt_jpg: false, fmt_svg: false, fmt_pdf: false,
            scale: 100, quality: 90, transparent: true, convention: 'preset', tpl: '{key}',
            scaleSuffix: true, folder: ''
        }
    };

    var data = null;

    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    function merge(target, src) {
        for (var k in src) {
            if (!src.hasOwnProperty(k)) continue;
            if (src[k] && typeof src[k] === 'object' && !(src[k] instanceof Array) &&
                target[k] && typeof target[k] === 'object' && !(target[k] instanceof Array)) {
                merge(target[k], src[k]);
            } else {
                target[k] = src[k];
            }
        }
        return target;
    }

    function load() {
        data = clone(DEFAULTS);
        try {
            var raw = window.localStorage.getItem(KEY);
            if (raw) merge(data, JSON.parse(raw));
        } catch (e) { /* storage unavailable: run with defaults */ }
    }

    function save() {
        try { window.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    }

    function walk(path, create) {
        var parts = path.split('.');
        var o = data;
        for (var i = 0; i < parts.length - 1; i++) {
            if (o[parts[i]] === undefined || o[parts[i]] === null) {
                if (!create) return null;
                o[parts[i]] = {};
            }
            o = o[parts[i]];
        }
        return { obj: o, key: parts[parts.length - 1] };
    }

    function get(path) {
        if (!data) load();
        var w = walk(path, false);
        return w ? w.obj[w.key] : undefined;
    }

    function set(path, value) {
        if (!data) load();
        var w = walk(path, true);
        w.obj[w.key] = value;
        save();
    }

    function reset() {
        data = clone(DEFAULTS);
        save();
    }

    function pushRecent(ids) {
        var cur = (get('recent') || []).slice();
        ids.forEach(function (id) {
            cur = cur.filter(function (x) { return x !== id; });
            cur.unshift(id);
        });
        set('recent', cur.slice(0, 8));
    }

    load();
    return { get: get, set: set, reset: reset, pushRecent: pushRecent, DEFAULTS: DEFAULTS };
})();
