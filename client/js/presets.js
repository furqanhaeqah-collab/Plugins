/**
 * Preset Manager.
 * Built-in social media sizes plus user-defined custom presets.
 *
 * safe: percentages of the artboard.
 *   text     = [left, top, right, bottom] insets for the text-safe area
 *   overlays = rectangles (x, y, w, h) where platform UI usually covers content
 * Safe zones are APPROXIMATE - platforms change their UI. Treat them as guidance.
 */
SMDA.Presets = (function () {
    var DEFAULT_SAFE = { text: [6, 6, 6, 6], overlays: [] };

    function p(platform, name, w, h, safe) {
        return {
            id: (platform + '_' + name).toLowerCase().replace(/\s+/g, '-'),
            platform: platform,
            name: name,
            w: w,
            h: h,
            key: platform + '_' + name,
            builtin: true,
            safe: safe || DEFAULT_SAFE
        };
    }

    var BUILTIN = [
        p('Instagram', 'Post', 1080, 1080, { text: [8, 8, 8, 8], overlays: [] }),
        p('Instagram', 'Portrait', 1080, 1350, { text: [8, 8, 8, 10], overlays: [] }),
        p('Instagram', 'Story', 1080, 1920, {
            text: [6, 13, 6, 18],
            overlays: [
                { label: 'Story header UI', x: 0, y: 0, w: 100, h: 13 },
                { label: 'Story reply bar', x: 0, y: 82, w: 100, h: 18 }
            ]
        }),
        p('Facebook', 'Post', 1200, 630, { text: [6, 8, 6, 8], overlays: [] }),
        p('Facebook', 'Cover', 1640, 624, {
            text: [15, 12, 15, 12],
            overlays: [{ label: 'Profile photo', x: 3, y: 55, w: 18, h: 45 }]
        }),
        p('LinkedIn', 'Post', 1200, 627, { text: [6, 8, 6, 8], overlays: [] }),
        p('LinkedIn', 'Cover', 1584, 396, {
            text: [25, 10, 5, 10],
            overlays: [{ label: 'Profile photo', x: 0, y: 15, w: 25, h: 85 }]
        }),
        p('YouTube', 'Thumbnail', 1280, 720, {
            text: [5, 5, 5, 5],
            overlays: [{ label: 'Duration badge', x: 80, y: 85, w: 20, h: 15 }]
        }),
        p('Pinterest', 'Pin', 1000, 1500, { text: [8, 8, 8, 12], overlays: [] }),
        p('TikTok', 'Cover', 1080, 1920, {
            text: [8, 12, 8, 25],
            overlays: [
                { label: 'Bottom caption UI', x: 0, y: 75, w: 100, h: 25 },
                { label: 'Right action rail', x: 85, y: 45, w: 15, h: 40 }
            ]
        })
    ];

    function custom() {
        var list = SMDA.Settings.get('customPresets') || [];
        return list.map(function (c) {
            return {
                id: c.id, platform: 'Custom', name: c.name, w: c.w, h: c.h,
                key: 'Custom_' + SMDA.Naming.sanitize(c.name), builtin: false, safe: DEFAULT_SAFE
            };
        });
    }

    function all() { return BUILTIN.concat(custom()); }

    function byId(id) {
        var l = all();
        for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
        return null;
    }

    function near(a, b) { return Math.abs(a - b) < 0.5; }

    /** Match an existing artboard to a preset by name first, then by exact size. */
    function detect(ab) {
        var l = all(), i;
        var base = String(ab.name).replace(/_\d+$/, '');
        for (i = 0; i < l.length; i++) if (base === l[i].key) return l[i];
        for (i = 0; i < l.length; i++) if (near(ab.w, l[i].w) && near(ab.h, l[i].h)) return l[i];
        return null;
    }

    function addCustom(name, w, h) {
        var list = (SMDA.Settings.get('customPresets') || []).slice();
        var id = 'custom_' + Date.now();
        list.push({ id: id, name: name, w: w, h: h });
        SMDA.Settings.set('customPresets', list);
        return id;
    }

    function removeCustom(id) {
        var list = (SMDA.Settings.get('customPresets') || []).filter(function (c) { return c.id !== id; });
        SMDA.Settings.set('customPresets', list);
    }

    return { all: all, byId: byId, detect: detect, addCustom: addCustom, removeCustom: removeCustom, DEFAULT_SAFE: DEFAULT_SAFE };
})();
