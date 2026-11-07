/**
 * Social Media Design Automation - Illustrator host engine (ExtendScript)
 *
 * Modules (all under the SMDA namespace):
 *   SMDA.Json        - JSON polyfill (ExtendScript has no native JSON)
 *   SMDA.Util        - shared helpers
 *   SMDA.Layers      - layer helpers
 *   SMDA.Scaling     - scaling engine (fit / fill / original, margins)
 *   SMDA.Placement   - design placement engine (duplicate, scale, align, background)
 *   SMDA.Artboards   - artboard generator and renamer
 *   SMDA.Safe        - safe zone guides
 *   SMDA.Export      - export manager (PNG / JPEG / SVG / PDF)
 *   SMDA.Api         - public entry points, called from the panel via smdaCall()
 *
 * Every Api function takes one plain object and returns a plain object.
 * smdaCall() wraps results as {ok, data} / {ok:false, error}.
 *
 * Coordinates: Illustrator scripting uses points, Y axis pointing UP.
 * Rect arrays are [left, top, right, bottom] with top > bottom.
 */

var SMDA = {};

/* ------------------------------------------------------------------ */
/* JSON polyfill                                                       */
/* ------------------------------------------------------------------ */
SMDA.Json = (function () {
    function quote(s) {
        var out = '"';
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i);
            var code = s.charCodeAt(i);
            if (c === '"') out += '\\"';
            else if (c === '\\') out += '\\\\';
            else if (c === '\n') out += '\\n';
            else if (c === '\r') out += '\\r';
            else if (c === '\t') out += '\\t';
            else if (code < 32 || code > 126) {
                var h = code.toString(16);
                while (h.length < 4) h = '0' + h;
                out += '\\u' + h;
            } else out += c;
        }
        return out + '"';
    }
    function stringify(v) {
        if (v === null || v === undefined) return 'null';
        var t = typeof v;
        if (t === 'number') return isFinite(v) ? String(v) : 'null';
        if (t === 'boolean') return String(v);
        if (t === 'string') return quote(v);
        if (v instanceof Array) {
            var a = [];
            for (var i = 0; i < v.length; i++) a.push(stringify(v[i]));
            return '[' + a.join(',') + ']';
        }
        var parts = [];
        for (var k in v) {
            if (v.hasOwnProperty(k) && typeof v[k] !== 'function' && v[k] !== undefined) {
                parts.push(quote(k) + ':' + stringify(v[k]));
            }
        }
        return '{' + parts.join(',') + '}';
    }
    function parse(s) {
        // Input always originates from our own panel (JSON.stringify output).
        return eval('(' + s + ')');
    }
    return { stringify: stringify, parse: parse };
})();

/* ------------------------------------------------------------------ */
/* Util                                                                */
/* ------------------------------------------------------------------ */
SMDA.Util = {
    MAX_ARTBOARDS: 100,
    GROUP_PREFIX: 'SMDA: ',

    requireDoc: function () {
        if (app.documents.length === 0) {
            throw new Error('Open a document in Illustrator first.');
        }
        return app.activeDocument;
    },

    round: function (n, d) {
        var p = Math.pow(10, d || 0);
        return Math.round(n * p) / p;
    },

    /** Safe file name: no path separators or reserved characters. */
    sanitize: function (name) {
        var s = String(name).replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_');
        s = s.replace(/^\s+|\s+$/g, '').replace(/\.+$/, '');
        return s.length ? s : 'untitled';
    },

    rectOf: function (ab) {
        var r = ab.artboardRect;
        return { l: r[0], t: r[1], r: r[2], b: r[3], w: r[2] - r[0], h: r[1] - r[3] };
    },

    /** Union of geometric or visible bounds of an array of items -> [l,t,r,b] */
    unionBounds: function (items, visible) {
        var u = null;
        for (var i = 0; i < items.length; i++) {
            var b = visible ? items[i].visibleBounds : items[i].geometricBounds;
            if (!u) u = [b[0], b[1], b[2], b[3]];
            else {
                if (b[0] < u[0]) u[0] = b[0];
                if (b[1] > u[1]) u[1] = b[1];
                if (b[2] > u[2]) u[2] = b[2];
                if (b[3] < u[3]) u[3] = b[3];
            }
        }
        return u;
    },

    selectionArray: function (doc) {
        var out = [];
        var s = doc.selection;
        if (s instanceof Array) {
            for (var i = 0; i < s.length; i++) out.push(s[i]);
        }
        return out;
    },

    /** Index of the artboard that contains the centre of the bounds, else -1 */
    artboardAt: function (doc, b) {
        var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        for (var i = 0; i < doc.artboards.length; i++) {
            var r = SMDA.Util.rectOf(doc.artboards[i]);
            if (cx >= r.l && cx <= r.r && cy <= r.t && cy >= r.b) return i;
        }
        return -1;
    },

    ensureFolder: function (path) {
        var f = new Folder(path);
        if (!f.exists) {
            if (!f.create()) throw new Error('Could not create folder: ' + path);
        }
        return f;
    },

    uniqueFile: function (folder, base, ext) {
        var f = new File(folder.fsName + '/' + base + '.' + ext);
        var n = 2;
        while (f.exists) {
            f = new File(folder.fsName + '/' + base + '_' + n + '.' + ext);
            n++;
        }
        return f;
    }
};

/* ------------------------------------------------------------------ */
/* Layers                                                              */
/* ------------------------------------------------------------------ */
SMDA.Layers = {
    getOrCreate: function (doc, name) {
        var layer = null;
        try { layer = doc.layers.getByName(name); } catch (e) { layer = null; }
        if (!layer) {
            layer = doc.layers.add();
            layer.name = name;
        }
        layer.locked = false;
        layer.visible = true;
        return layer;
    },
    removeByName: function (doc, name) {
        try {
            var l = doc.layers.getByName(name);
            l.locked = false;
            l.remove();
            return true;
        } catch (e) { return false; }
    }
};

/* ------------------------------------------------------------------ */
/* Scaling engine                                                      */
/* ------------------------------------------------------------------ */
SMDA.Scaling = {
    /**
     * Compute the uniform scale factor (1 = 100%).
     * mode: 'fit' | 'fill' | 'original'
     */
    factor: function (mode, artW, artH, availW, availH) {
        if (artW <= 0 || artH <= 0) return 1;
        var sx = availW / artW, sy = availH / artH;
        if (mode === 'fill') return Math.max(sx, sy);
        if (mode === 'original') return 1;
        return Math.min(sx, sy);
    },

    /** Uniformly scale an item about its centre. */
    scaleItem: function (item, factor, scaleStrokes) {
        if (Math.abs(factor - 1) < 0.00001) return;
        var pct = factor * 100;
        item.resize(pct, pct, true, true, true, true, scaleStrokes ? pct : 100, Transformation.CENTER);
    },

    /** Stretch an item to exactly cover a rect [l,t,r,b] (used for backgrounds). */
    stretchToRect: function (item, rect) {
        var b = item.geometricBounds;
        var w = b[2] - b[0], h = b[1] - b[3];
        if (w <= 0 || h <= 0) return;
        item.left = rect[0];
        item.top = rect[1];
        var sx = ((rect[2] - rect[0]) / w) * 100;
        var sy = ((rect[1] - rect[3]) / h) * 100;
        item.resize(sx, sy, true, true, true, true, 100, Transformation.TOPLEFT);
        // correct tiny drift caused by strokes / rounding
        var nb = item.geometricBounds;
        item.translate(rect[0] - nb[0], rect[1] - nb[1]);
    }
};

/* ------------------------------------------------------------------ */
/* Placement engine                                                    */
/* ------------------------------------------------------------------ */
SMDA.Placement = {
    /**
     * Collect source artwork: the current selection, or every unlocked,
     * visible object on the source artboard.
     */
    collectSource: function (doc, sourceIndex, useSelection) {
        var items = [];
        if (useSelection) items = SMDA.Util.selectionArray(doc);
        if (!items.length) {
            doc.artboards.setActiveArtboardIndex(sourceIndex);
            doc.selection = null;
            doc.selectObjectsOnActiveArtboard();
            items = SMDA.Util.selectionArray(doc);
            doc.selection = null;
        }
        if (!items.length) {
            throw new Error('No source artwork found. Select artwork or put objects on the source artboard.');
        }
        return items;
    },

    /**
     * Duplicate items in place and group them, preserving stacking order.
     * Returns a group that is the working "master copy".
     */
    buildMaster: function (doc, items, layerForMaster) {
        doc.selection = null;
        var count = 0;
        for (var i = 0; i < items.length; i++) {
            try {
                var d = items[i].duplicate();
                d.selected = true;
                count++;
            } catch (e) { /* locked / unsupported item: skip */ }
        }
        if (!count) throw new Error('Could not duplicate the source artwork (are the layers locked?).');
        var sel = SMDA.Util.selectionArray(doc);
        var master;
        if (sel.length > 1) {
            app.executeMenuCommand('group');
            master = doc.selection[0];
        } else {
            master = sel[0];
            if (master.typename !== 'GroupItem') {
                var g = doc.groupItems.add();
                master.move(g, ElementPlacement.PLACEATEND);
                master = g;
            }
        }
        doc.selection = null;
        master.move(layerForMaster, ElementPlacement.PLACEATBEGINNING);
        return master;
    },

    /** Find the child that acts as a full-artboard background, or -1. */
    findBackground: function (group, srcRect) {
        var srcArea = srcRect.w * srcRect.h;
        var best = -1, bestArea = 0;
        for (var i = 0; i < group.pageItems.length; i++) {
            var it = group.pageItems[i];
            if (it.typename !== 'PathItem' && it.typename !== 'CompoundPathItem') continue;
            var b = it.geometricBounds;
            var area = (b[2] - b[0]) * (b[1] - b[3]);
            if (area >= srcArea * 0.85 && area > bestArea) {
                best = i;
                bestArea = area;
            }
        }
        return best;
    },

    removePrevious: function (doc, artboardName) {
        var target = SMDA.Util.GROUP_PREFIX + artboardName;
        var removed = 0;
        for (var li = 0; li < doc.layers.length; li++) {
            var layer = doc.layers[li];
            if (layer.name.indexOf('SMDA') !== 0) continue;
            if (layer.name === 'SMDA Safe Zones') continue;
            for (var gi = layer.groupItems.length - 1; gi >= 0; gi--) {
                var g = layer.groupItems[gi];
                if (g.name === target) {
                    g.remove();
                    removed++;
                }
            }
        }
        return removed;
    },

    /**
     * Place a copy of master onto one target artboard.
     * opts: mode, margin (percent per side), alignX, alignY, bgMode, clip, scaleStrokes
     * target: { index, name, platform }
     */
    placeOne: function (doc, master, bgIndex, srcRect, target, opts, layer) {
        var ab = doc.artboards[target.index];
        var tr = SMDA.Util.rectOf(ab);
        var mx = tr.w * (opts.margin / 100);
        var my = tr.h * (opts.margin / 100);

        var dup = master.duplicate();
        dup.move(layer, ElementPlacement.PLACEATBEGINNING);

        // 1. background handling
        var bg = null;
        if (bgIndex >= 0 && opts.bgMode === 'extend') {
            bg = dup.pageItems[bgIndex];
            bg.move(layer, ElementPlacement.PLACEATEND);
        }
        var art = dup;
        if (bg && dup.pageItems.length === 0) {
            dup.remove();
            art = null;
        }

        // 2. scale + align artwork
        if (art) {
            var vb = art.visibleBounds;
            var aw = vb[2] - vb[0], ah = vb[1] - vb[3];
            var availW = Math.max(1, tr.w - 2 * mx);
            var availH = Math.max(1, tr.h - 2 * my);
            var f = SMDA.Scaling.factor(opts.mode, aw, ah, availW, availH);
            SMDA.Scaling.scaleItem(art, f, opts.scaleStrokes);

            vb = art.visibleBounds;
            var regL = tr.l + mx, regR = tr.r - mx, regT = tr.t - my, regB = tr.b + my;
            var dx, dy;
            if (opts.alignX === 'left') dx = regL - vb[0];
            else if (opts.alignX === 'right') dx = regR - vb[2];
            else dx = (regL + regR) / 2 - (vb[0] + vb[2]) / 2;
            if (opts.alignY === 'top') dy = regT - vb[1];
            else if (opts.alignY === 'bottom') dy = regB - vb[3];
            else dy = (regT + regB) / 2 - (vb[1] + vb[3]) / 2;
            art.translate(dx, dy);
        }

        // 3. background stretch
        if (bg) SMDA.Scaling.stretchToRect(bg, [tr.l, tr.t, tr.r, tr.b]);

        // 4. wrap in a named group (optionally clipped to the artboard)
        var wrap = layer.groupItems.add();
        wrap.name = SMDA.Util.GROUP_PREFIX + target.name;
        if (art) art.move(wrap, ElementPlacement.PLACEATBEGINNING);
        if (bg) bg.move(wrap, ElementPlacement.PLACEATEND);
        if (opts.clip) {
            var clipRect = layer.pathItems.rectangle(tr.t, tr.l, tr.w, tr.h);
            clipRect.filled = false;
            clipRect.stroked = false;
            clipRect.move(wrap, ElementPlacement.PLACEATBEGINNING);
            wrap.clipped = true;
        }
        return wrap;
    },

    /**
     * Place the source artwork on all targets.
     * a: { sourceIndex, useSelection, targets:[{index,name,platform}], mode, margin,
     *      alignX, alignY, bgMode, clip, scaleStrokes, groupByPlatform, replace }
     */
    run: function (a) {
        var doc = SMDA.Util.requireDoc();
        var srcIndex = a.sourceIndex;
        if (srcIndex < 0 || srcIndex >= doc.artboards.length) srcIndex = doc.artboards.getActiveArtboardIndex();
        var srcRect = SMDA.Util.rectOf(doc.artboards[srcIndex]);

        var targets = [];
        for (var i = 0; i < a.targets.length; i++) {
            if (a.targets[i].index !== srcIndex && a.targets[i].index < doc.artboards.length) targets.push(a.targets[i]);
        }
        if (!targets.length) throw new Error('No target artboards. Create artboards first or select targets.');

        var items = this.collectSource(doc, srcIndex, a.useSelection);
        var hasBgCandidate = !a.useSelection;

        var tempLayer = SMDA.Layers.getOrCreate(doc, 'SMDA Temp');
        var master = this.buildMaster(doc, items, tempLayer);
        var bgIndex = hasBgCandidate ? this.findBackground(master, srcRect) : -1;

        var placed = 0;
        try {
            for (var t = 0; t < targets.length; t++) {
                var tg = targets[t];
                if (a.replace) this.removePrevious(doc, tg.name);
                var layerName = a.groupByPlatform ? ('SMDA ' + tg.platform) : 'SMDA Designs';
                var layer = SMDA.Layers.getOrCreate(doc, layerName);
                this.placeOne(doc, master, bgIndex, srcRect, tg, a, layer);
                placed++;
            }
        } finally {
            try { master.remove(); } catch (e1) {}
            SMDA.Layers.removeByName(doc, 'SMDA Temp');
        }
        doc.selection = null;
        return { placed: placed, backgroundDetected: bgIndex >= 0 };
    }
};

/* ------------------------------------------------------------------ */
/* Artboard generator                                                  */
/* ------------------------------------------------------------------ */
SMDA.Artboards = {
    /**
     * a: { items:[{name,w,h,platform}], layout:'row'|'platform-rows', gap }
     * Returns created artboards [{index,name,w,h,platform}]
     */
    create: function (a) {
        var doc = SMDA.Util.requireDoc();
        if (!a.items || !a.items.length) throw new Error('Select at least one preset or enter a custom size.');
        if (doc.artboards.length + a.items.length > SMDA.Util.MAX_ARTBOARDS) {
            throw new Error('Illustrator allows at most ' + SMDA.Util.MAX_ARTBOARDS + ' artboards per document. This would create ' + (doc.artboards.length + a.items.length) + '.');
        }
        var gap = a.gap >= 0 ? a.gap : 100;

        // origin: right of all existing artboards, aligned to the top-most one
        var maxRight = -1e9, topY = -1e9;
        for (var i = 0; i < doc.artboards.length; i++) {
            var r = SMDA.Util.rectOf(doc.artboards[i]);
            if (r.r > maxRight) maxRight = r.r;
            if (r.t > topY) topY = r.t;
        }
        var x0 = maxRight + gap * 2;
        var x = x0, y = topY, rowH = 0;
        var lastPlatform = null;
        var created = [];

        for (var k = 0; k < a.items.length; k++) {
            var it = a.items[k];
            if (!(it.w > 0 && it.h > 0) || it.w > 16383 || it.h > 16383) {
                throw new Error('Invalid size for "' + it.name + '": ' + it.w + ' x ' + it.h + ' (max 16383).');
            }
            if (a.layout === 'platform-rows' && lastPlatform !== null && it.platform !== lastPlatform) {
                y -= rowH + gap;
                x = x0;
                rowH = 0;
            }
            lastPlatform = it.platform;

            var ab = doc.artboards.add([x, y, x + it.w, y - it.h]);
            ab.name = it.name;
            created.push({
                index: doc.artboards.length - 1,
                name: ab.name,
                w: it.w,
                h: it.h,
                platform: it.platform
            });
            x += it.w + gap;
            if (it.h > rowH) rowH = it.h;
        }
        return created;
    },

    rename: function (a) {
        var doc = SMDA.Util.requireDoc();
        var n = 0;
        for (var i = 0; i < a.renames.length; i++) {
            var rn = a.renames[i];
            if (rn.index >= 0 && rn.index < doc.artboards.length) {
                doc.artboards[rn.index].name = rn.name;
                n++;
            }
        }
        return { renamed: n };
    },

    list: function () {
        var doc = SMDA.Util.requireDoc();
        var out = [];
        for (var i = 0; i < doc.artboards.length; i++) {
            var r = SMDA.Util.rectOf(doc.artboards[i]);
            out.push({ index: i, name: doc.artboards[i].name, w: SMDA.Util.round(r.w, 2), h: SMDA.Util.round(r.h, 2) });
        }
        return out;
    }
};

/* ------------------------------------------------------------------ */
/* Safe zone guides                                                    */
/* ------------------------------------------------------------------ */
SMDA.Safe = {
    LAYER: 'SMDA Safe Zones',

    /**
     * a: { artboards:[{index, safe:{text:[l,t,r,b], overlays:[{label,x,y,w,h}]}}],
     *      showText, showOverlays }
     * All safe values are percentages of the artboard.
     */
    draw: function (a) {
        var doc = SMDA.Util.requireDoc();
        SMDA.Layers.removeByName(doc, this.LAYER);
        var layer = SMDA.Layers.getOrCreate(doc, this.LAYER);
        var drawn = 0;

        for (var i = 0; i < a.artboards.length; i++) {
            var spec = a.artboards[i];
            if (!spec.safe || spec.index >= doc.artboards.length) continue;
            var r = SMDA.Util.rectOf(doc.artboards[spec.index]);

            if (a.showText && spec.safe.text) {
                var ins = spec.safe.text;
                var l = r.l + r.w * ins[0] / 100;
                var t = r.t - r.h * ins[1] / 100;
                var w = r.w * (1 - (ins[0] + ins[2]) / 100);
                var h = r.h * (1 - (ins[1] + ins[3]) / 100);
                var g1 = layer.pathItems.rectangle(t, l, w, h);
                g1.name = 'Text safe: ' + doc.artboards[spec.index].name;
                g1.guides = true;
                drawn++;
            }
            if (a.showOverlays && spec.safe.overlays) {
                for (var o = 0; o < spec.safe.overlays.length; o++) {
                    var ov = spec.safe.overlays[o];
                    var g2 = layer.pathItems.rectangle(
                        r.t - r.h * ov.y / 100,
                        r.l + r.w * ov.x / 100,
                        r.w * ov.w / 100,
                        r.h * ov.h / 100
                    );
                    g2.name = 'UI overlay: ' + ov.label;
                    g2.guides = true;
                    drawn++;
                }
            }
        }
        return { guides: drawn };
    },

    clear: function () {
        var doc = SMDA.Util.requireDoc();
        return { cleared: SMDA.Layers.removeByName(doc, this.LAYER) };
    }
};

/* ------------------------------------------------------------------ */
/* Export manager                                                      */
/* ------------------------------------------------------------------ */
SMDA.Export = {
    /** Export one artboard via native artboard clipping (PNG / JPEG). */
    raster: function (doc, index, file, fmt, o) {
        doc.artboards.setActiveArtboardIndex(index);
        var white = new RGBColor();
        white.red = 255; white.green = 255; white.blue = 255;
        var scale = o.scale > 0 ? o.scale : 100;

        if (fmt === 'png') {
            var p = new ExportOptionsPNG24();
            p.artBoardClipping = true;
            p.antiAliasing = true;
            p.transparency = !!o.transparent;
            if (!o.transparent) { p.matte = true; p.matteColor = white; }
            p.horizontalScale = scale;
            p.verticalScale = scale;
            doc.exportFile(file, ExportType.PNG24, p);
        } else {
            var j = new ExportOptionsJPEG();
            j.artBoardClipping = true;
            j.antiAliasing = true;
            j.qualitySetting = Math.max(0, Math.min(100, o.quality >= 0 ? o.quality : 90));
            j.optimization = true;
            j.matte = true;
            j.matteColor = white;
            j.horizontalScale = scale;
            j.verticalScale = scale;
            doc.exportFile(file, ExportType.JPEG, j);
        }
    },

    /**
     * SVG and PDF cannot be cropped to one artboard via exportFile on the
     * source document, so the artboard contents are pasted into a temporary
     * document of exactly the artboard size, exported, and closed.
     */
    viaTempDoc: function (doc, index, file, fmt, o) {
        var ab = doc.artboards[index];
        var r = SMDA.Util.rectOf(ab);
        doc.artboards.setActiveArtboardIndex(index);
        doc.selection = null;
        doc.selectObjectsOnActiveArtboard();
        var sel = SMDA.Util.selectionArray(doc);
        if (!sel.length) {
            throw new Error('Artboard "' + ab.name + '" has no selectable artwork to export.');
        }
        var ob = SMDA.Util.unionBounds(sel, false);
        var offX = ob[0] - r.l, offY = ob[1] - r.t;

        var space = doc.documentColorSpace;
        app.copy();
        doc.selection = null;

        var tmp = app.documents.add(space, r.w, r.h);
        try {
            app.paste();
            var pasted = SMDA.Util.selectionArray(tmp);
            var item;
            if (pasted.length > 1) {
                app.executeMenuCommand('group');
                item = tmp.selection[0];
            } else {
                item = pasted[0];
            }
            var nr = tmp.artboards[0].artboardRect;
            var gb = item.geometricBounds;
            item.translate(nr[0] + offX - gb[0], nr[1] + offY - gb[1]);

            // crop to the artboard so overflowing artwork does not alter the bounds
            var wrap = tmp.groupItems.add();
            item.move(wrap, ElementPlacement.PLACEATEND);
            var clip = tmp.pathItems.rectangle(nr[1], nr[0], r.w, r.h);
            clip.filled = false;
            clip.stroked = false;
            clip.move(wrap, ElementPlacement.PLACEATBEGINNING);
            wrap.clipped = true;

            if (fmt === 'svg') {
                var s = new ExportOptionsSVG();
                s.embedRasterImages = true;
                s.fontType = SVGFontType.OUTLINEFONT;
                s.cssProperties = SVGCSSPropertyLocation.STYLEATTRIBUTES;
                s.documentEncoding = SVGDocumentEncoding.UTF8;
                s.coordinatePrecision = 3;
                tmp.exportFile(file, ExportType.SVG, s);
            } else {
                var pdf = new PDFSaveOptions();
                pdf.compatibility = PDFCompatibility.ACROBAT7;
                pdf.preserveEditability = false;
                pdf.generateThumbnails = false;
                pdf.viewAfterSaving = false;
                try { pdf.pDFPreset = '[High Quality Print]'; } catch (e) {}
                tmp.saveAs(file, pdf);
            }
        } finally {
            try { tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
            app.activeDocument = doc;
        }
    },

    /**
     * a: { index, format:'png'|'jpg'|'svg'|'pdf', folder, base, scale (percent),
     *      transparent, quality }
     */
    one: function (a) {
        var doc = SMDA.Util.requireDoc();
        if (a.index < 0 || a.index >= doc.artboards.length) throw new Error('Artboard ' + a.index + ' does not exist.');
        if (!a.folder) throw new Error('Choose a destination folder.');
        var folder = SMDA.Util.ensureFolder(a.folder);
        var ext = a.format === 'jpg' ? 'jpg' : a.format;
        var file = SMDA.Util.uniqueFile(folder, SMDA.Util.sanitize(a.base), ext);

        if (a.format === 'png' || a.format === 'jpg') this.raster(doc, a.index, file, a.format, a);
        else if (a.format === 'svg' || a.format === 'pdf') this.viaTempDoc(doc, a.index, file, a.format, a);
        else throw new Error('Unsupported format: ' + a.format);

        if (!file.exists) throw new Error('Illustrator reported success but the file was not written: ' + file.fsName);
        return { path: file.fsName, name: file.name };
    }
};

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
SMDA.Api = {
    ping: function () { return { version: app.version, name: app.name }; },

    getDocInfo: function () {
        if (app.documents.length === 0) return { open: false };
        var d = app.activeDocument;
        var selCount = SMDA.Util.selectionArray(d).length;
        var abs = [];
        for (var i = 0; i < d.artboards.length; i++) {
            var r = SMDA.Util.rectOf(d.artboards[i]);
            abs.push({ index: i, name: d.artboards[i].name, w: SMDA.Util.round(r.w, 2), h: SMDA.Util.round(r.h, 2) });
        }
        var cs = String(d.documentColorSpace).indexOf('CMYK') >= 0 ? 'CMYK' : 'RGB';
        return {
            open: true,
            name: d.name,
            colorSpace: cs,
            artboardCount: d.artboards.length,
            activeArtboard: d.artboards.getActiveArtboardIndex(),
            selectionCount: selCount,
            artboards: abs,
            illustratorVersion: app.version
        };
    },

    createArtboards: function (a) { return { created: SMDA.Artboards.create(a) }; },
    renameArtboards: function (a) { return SMDA.Artboards.rename(a); },
    placeDesign: function (a) { return SMDA.Placement.run(a); },

    /** Create artboards and place the design on them in one undo-friendly call. */
    generateVariations: function (a) {
        var doc = SMDA.Util.requireDoc();
        if (a.place.sourceIndex < 0 || a.place.sourceIndex >= doc.artboards.length) {
            a.place.sourceIndex = doc.artboards.getActiveArtboardIndex();
        }
        // validate the source BEFORE creating anything, so a failure leaves the document untouched
        SMDA.Placement.collectSource(doc, a.place.sourceIndex, a.place.useSelection);
        doc.selection = null;
        var created = SMDA.Artboards.create(a.create);
        var targets = [];
        for (var i = 0; i < created.length; i++) {
            targets.push({ index: created[i].index, name: created[i].name, platform: created[i].platform });
        }
        a.place.targets = targets;
        var res = SMDA.Placement.run(a.place);
        return { created: created, placed: res.placed, backgroundDetected: res.backgroundDetected };
    },

    /** Fit or centre the current selection inside its artboard (in place). */
    fitSelection: function (a) {
        var doc = SMDA.Util.requireDoc();
        var items = SMDA.Util.selectionArray(doc);
        if (!items.length) throw new Error('Select the artwork first.');
        var vb = SMDA.Util.unionBounds(items, true);
        var idx = SMDA.Util.artboardAt(doc, vb);
        if (idx < 0) idx = doc.artboards.getActiveArtboardIndex();
        var tr = SMDA.Util.rectOf(doc.artboards[idx]);

        var group;
        if (items.length > 1) {
            app.executeMenuCommand('group');
            group = doc.selection[0];
        } else {
            group = items[0];
        }
        var mx = tr.w * a.margin / 100, my = tr.h * a.margin / 100;
        var b = group.visibleBounds;
        if (a.action === 'fit') {
            var f = SMDA.Scaling.factor(a.mode || 'fit', b[2] - b[0], b[1] - b[3], Math.max(1, tr.w - 2 * mx), Math.max(1, tr.h - 2 * my));
            SMDA.Scaling.scaleItem(group, f, a.scaleStrokes);
        }
        b = group.visibleBounds;
        group.translate((tr.l + tr.r) / 2 - (b[0] + b[2]) / 2, (tr.t + tr.b) / 2 - (b[1] + b[3]) / 2);
        if (items.length > 1) {
            app.executeMenuCommand('ungroup');
        }
        return { artboard: doc.artboards[idx].name };
    },

    drawSafeZones: function (a) { return SMDA.Safe.draw(a); },
    clearSafeZones: function () { return SMDA.Safe.clear(); },
    exportArtboard: function (a) { return SMDA.Export.one(a); },

    getDefaultFolder: function () {
        var f = new Folder(Folder.desktop.fsName + '/Social Media Exports');
        return { path: f.fsName };
    },

    revealFolder: function (a) {
        var f = new Folder(a.path);
        if (!f.exists) throw new Error('Folder does not exist yet: ' + a.path);
        f.execute();
        return {};
    }
};

/**
 * Entry point used by the panel (CSInterface.evalScript).
 * @param {string} fn      name of an SMDA.Api function
 * @param {string} argJson JSON string with the arguments
 */
function smdaCall(fn, argJson) {
    try {
        if (!SMDA.Api[fn]) throw new Error('Unknown host function: ' + fn);
        var args = argJson ? SMDA.Json.parse(argJson) : {};
        var data = SMDA.Api[fn](args);
        return SMDA.Json.stringify({ ok: true, data: data });
    } catch (e) {
        return SMDA.Json.stringify({ ok: false, error: String(e.message || e), line: e.line });
    }
}
