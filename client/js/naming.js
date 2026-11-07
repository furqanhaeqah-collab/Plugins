/**
 * File Naming Utility.
 * Tokens: {key} {preset} {platform} {name} {w} {h} {index} {n} {doc} {date} {time} {scale}
 */
SMDA.Naming = (function () {
    var CONVENTIONS = {
        preset: { label: 'Preset name  (Instagram_Post)', tpl: '{key}' },
        dims: { label: 'Preset + size  (Instagram_Post_1080x1080)', tpl: '{key}_{w}x{h}' },
        doc: { label: 'Document + preset  (Brand_Instagram_Post)', tpl: '{doc}_{key}' },
        dated: { label: 'Preset + date  (Instagram_Post_2026-11-08)', tpl: '{key}_{date}' },
        custom: { label: 'Custom template', tpl: null }
    };

    function sanitize(s) {
        s = String(s).replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, '_');
        s = s.replace(/^_+|_+$/g, '').replace(/\.+$/, '');
        return s.length ? s : 'untitled';
    }

    function pad(n, len) {
        n = String(n);
        while (n.length < len) n = '0' + n;
        return n;
    }

    function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2); }
    function timeStr(d) { return pad(d.getHours(), 2) + pad(d.getMinutes(), 2); }

    function apply(template, ctx) {
        var now = new Date();
        var full = {
            date: dateStr(now), time: timeStr(now), index: 1, n: '01', doc: 'Document',
            key: '', preset: '', platform: '', name: '', w: '', h: '', scale: ''
        };
        for (var k in ctx) if (ctx.hasOwnProperty(k)) full[k] = ctx[k];
        var out = String(template).replace(/\{(\w+)\}/g, function (m, key) {
            return full.hasOwnProperty(key) ? full[key] : m;
        });
        return sanitize(out);
    }

    function templateFor(convention, customTpl) {
        var c = CONVENTIONS[convention];
        if (c && c.tpl) return c.tpl;
        return customTpl && customTpl.length ? customTpl : '{key}';
    }

    function docBase(name) { return sanitize(String(name || 'Document').replace(/\.[^.]+$/, '')); }

    function scaleSuffix(percent) {
        var x = Math.round(percent) / 100;
        return '@' + (Math.round(x * 100) / 100) + 'x';
    }

    return {
        CONVENTIONS: CONVENTIONS, sanitize: sanitize, pad: pad, apply: apply,
        templateFor: templateFor, docBase: docBase, scaleSuffix: scaleSuffix
    };
})();
