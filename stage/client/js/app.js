/**
 * Panel controller: UI Components + wiring between the UI, Settings, Presets,
 * Naming and the Illustrator bridge.
 * Written in ES5-compatible style with Promises (no .finally) for older CEP runtimes.
 */
(function () {
    'use strict';

    var S = window.SMDA;
    var Bridge = S.Bridge, Settings = S.Settings, Presets = S.Presets, Naming = S.Naming;

    var state = {
        doc: null,
        busy: false,
        sel: { auto: {}, exp: {} },
        abSig: '',
        lastError: ''
    };

    /* ---------------- DOM helpers ---------------- */
    function $(id) { return document.getElementById(id); }
    function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

    function el(tag, props, children) {
        var n = document.createElement(tag);
        props = props || {};
        for (var k in props) {
            if (!props.hasOwnProperty(k)) continue;
            if (k === 'text') n.textContent = props[k];
            else if (k === 'class') n.className = props[k];
            else if (k === 'on') { for (var ev in props.on) n.addEventListener(ev, props.on[ev]); }
            else if (k === 'checked' || k === 'disabled' || k === 'value') n[k] = props[k];
            else n.setAttribute(k, props[k]);
        }
        (children || []).forEach(function (c) { if (c) n.appendChild(c); });
        return n;
    }

    var toastTimer = null;
    function toast(msg, kind) {
        var t = $('toast');
        t.textContent = msg;
        t.className = 'show ' + (kind || '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.className = ''; }, kind === 'err' ? 7000 : 3500);
    }

    /* ---------------- Theme ---------------- */
    function applyTheme() {
        try {
            var c = S.CSI.hostEnv().appSkinInfo.panelBackgroundColor.color;
            var lum = 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue;
            document.documentElement.setAttribute('data-theme', lum > 150 ? 'light' : 'dark');
        } catch (e) { /* keep default */ }
    }

    /* ---------------- Tabs ---------------- */
    function showTab(name) {
        $$('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
        $$('.tab').forEach(function (t) { t.classList.toggle('active', t.id === 'tab-' + name); });
    }

    /* ---------------- Settings bindings ---------------- */
    function readEl(e) {
        var type = e.getAttribute('data-type');
        if (e.type === 'checkbox') return e.checked;
        if (type === 'int') { var v = parseInt(e.value, 10); return isNaN(v) ? 0 : v; }
        return e.value;
    }
    function writeEl(e, v) {
        if (e.type === 'checkbox') e.checked = !!v;
        else e.value = (v === undefined || v === null) ? '' : String(v);
    }
    function refreshBindings() {
        $$('[data-s]').forEach(function (e) { writeEl(e, Settings.get(e.getAttribute('data-s'))); });
        $('marginOut').textContent = Settings.get('auto.margin') + '%';
        $('qualOut').textContent = Settings.get('exp.quality');
        refreshAlign();
        updateNamePreview();
    }
    function bindSettings() {
        $$('[data-s]').forEach(function (e) {
            var handler = function () {
                Settings.set(e.getAttribute('data-s'), readEl(e));
                if (e.hasAttribute('data-default')) applyDefaults();
                $('marginOut').textContent = Settings.get('auto.margin') + '%';
                $('qualOut').textContent = Settings.get('exp.quality');
                updateNamePreview();
            };
            e.addEventListener(e.tagName === 'SELECT' || e.type === 'checkbox' ? 'change' : 'input', handler);
        });
    }
    function applyDefaults() {
        var d = Settings.get('defaults');
        ['png', 'jpg', 'svg', 'pdf'].forEach(function (f) { Settings.set('exp.fmt_' + f, f === d.fmt); });
        Settings.set('exp.convention', d.convention);
        Settings.set('exp.scale', d.scale);
        if (d.folder) Settings.set('exp.folder', d.folder);
        refreshBindings();
    }

    /* ---------------- Busy handling ---------------- */
    function setBusy(b) {
        state.busy = b;
        $$('.btn, .qa').forEach(function (x) { x.disabled = b; });
    }
    function run(label, fn) {
        if (state.busy) { toast('Another operation is still running.', 'err'); return Promise.resolve(); }
        if (!state.doc || !state.doc.open) { toast('Open a document in Illustrator first.', 'err'); return Promise.resolve(); }
        setBusy(true);
        return Promise.resolve().then(fn).then(function () {
            setBusy(false);
            return refreshDoc();
        }).catch(function (err) {
            setBusy(false);
            toast(label + ' failed: ' + (err && err.message ? err.message : err), 'err');
            return refreshDoc();
        });
    }

    /* ---------------- Document info ---------------- */
    function refreshDoc() {
        if (state.busy) return Promise.resolve();
        return Bridge.call('getDocInfo').then(function (info) {
            state.doc = info;
            state.lastError = '';
            renderDoc();
        }).catch(function (err) {
            state.doc = null;
            if (state.lastError !== err.message) {
                state.lastError = err.message;
                renderDoc(err.message);
            }
        });
    }

    function renderDoc(error) {
        var d = state.doc, info = $('docInfo');
        info.innerHTML = '';
        function row(k, v) { info.appendChild(el('dt', { text: k })); info.appendChild(el('dd', { text: String(v) })); }
        if (error) {
            $('docBadge').textContent = 'Not connected';
            row('Status', error);
            return;
        }
        if (!d || !d.open) {
            $('docBadge').textContent = 'No document open';
            row('Status', 'Open or create a document');
            renderArtLists();
            return;
        }
        $('docBadge').textContent = d.name + ' · ' + d.artboardCount + ' artboard' + (d.artboardCount === 1 ? '' : 's');
        row('Name', d.name);
        row('Color mode', d.colorSpace);
        row('Artboards', d.artboardCount);
        var act = d.artboards[d.activeArtboard];
        row('Active artboard', act ? act.name + ' (' + act.w + '×' + act.h + ')' : '—');
        row('Selected objects', d.selectionCount);
        row('Illustrator', d.illustratorVersion);
        if (d.colorSpace === 'CMYK') row('Note', 'CMYK doc: PNG/JPG export as RGB');

        var sig = d.artboards.map(function (a) { return a.index + a.name + a.w + 'x' + a.h; }).join('|') + '#' + d.activeArtboard;
        if (sig !== state.abSig) { state.abSig = sig; renderArtLists(); }
    }

    /* ---------------- Artboard lists ---------------- */
    function renderArtList(container, key) {
        container.innerHTML = '';
        var d = state.doc;
        if (!d || !d.open) { container.appendChild(el('div', { class: 'muted', text: 'No document open.' })); return; }
        d.artboards.forEach(function (ab) {
            if (state.sel[key][ab.index] === undefined) state.sel[key][ab.index] = true;
            var cb = el('input', { type: 'checkbox', checked: !!state.sel[key][ab.index], on: { change: function (e) {
                state.sel[key][ab.index] = e.target.checked; updateNamePreview();
            } } });
            container.appendChild(el('label', { class: 'preset' }, [
                cb, el('span', { text: ab.name }), el('span', { class: 'dim', text: ab.w + '×' + ab.h })
            ]));
        });
    }
    function renderSourceSelect() {
        var sel = $('srcArtboard'), cur = sel.value || '-1';
        sel.innerHTML = '';
        sel.appendChild(el('option', { value: '-1', text: 'Active artboard' }));
        if (state.doc && state.doc.open) {
            state.doc.artboards.forEach(function (ab) {
                sel.appendChild(el('option', { value: String(ab.index), text: (ab.index + 1) + '. ' + ab.name }));
            });
        }
        sel.value = cur;
        if (sel.value !== cur) sel.value = '-1';
    }
    function renderArtLists() {
        renderArtList($('autoList'), 'auto');
        renderArtList($('expList'), 'exp');
        renderSourceSelect();
        updateNamePreview();
    }

    /* ---------------- Presets UI ---------------- */
    function selectedPresetIds() { return Settings.get('selectedPresets') || []; }

    function renderPresets() {
        var box = $('presetList');
        box.innerHTML = '';
        var groups = {}, order = [];
        Presets.all().forEach(function (p) {
            if (!groups[p.platform]) { groups[p.platform] = []; order.push(p.platform); }
            groups[p.platform].push(p);
        });
        var chosen = selectedPresetIds();
        order.forEach(function (plat) {
            box.appendChild(el('div', { class: 'group-title', text: plat }));
            groups[plat].forEach(function (p) {
                var cb = el('input', { type: 'checkbox', checked: chosen.indexOf(p.id) >= 0, on: { change: function (e) {
                    var cur = selectedPresetIds().filter(function (x) { return x !== p.id; });
                    if (e.target.checked) cur.push(p.id);
                    Settings.set('selectedPresets', cur);
                    updateSelSummary();
                } } });
                var kids = [cb, el('span', { text: p.name }), el('span', { class: 'dim', text: p.w + '×' + p.h })];
                if (!p.builtin) kids.push(el('button', { class: 'x', title: 'Delete preset', text: '×', on: { click: function (ev) {
                    ev.preventDefault(); Presets.removeCustom(p.id);
                    Settings.set('selectedPresets', selectedPresetIds().filter(function (x) { return x !== p.id; }));
                    renderPresets(); renderCustomList();
                } } }));
                box.appendChild(el('label', { class: 'preset' }, kids));
            });
        });
        updateSelSummary();
    }
    function updateSelSummary() {
        var n = selectedPresetIds().filter(function (id) { return Presets.byId(id); }).length;
        var q = Math.max(1, Settings.get('gen.qty') || 1);
        $('selSummary').textContent = n + ' preset' + (n === 1 ? '' : 's') + ' selected → ' + (n * q) + ' artboard' + (n * q === 1 ? '' : 's');
    }
    function renderRecent() {
        var box = $('recentChips');
        box.innerHTML = '';
        var recent = (Settings.get('recent') || []).map(Presets.byId).filter(Boolean);
        if (!recent.length) { box.appendChild(el('span', { class: 'muted', text: 'Presets you create will appear here.' })); return; }
        recent.forEach(function (p) {
            box.appendChild(el('button', { class: 'chip', text: p.key.replace('_', ' ') + ' · ' + p.w + '×' + p.h, on: { click: function () {
                Settings.set('selectedPresets', [p.id]);
                renderPresets();
                showTab('artboards');
            } } }));
        });
    }
    function renderCustomList() {
        var box = $('customList');
        box.innerHTML = '';
        var list = Settings.get('customPresets') || [];
        if (!list.length) { box.appendChild(el('div', { class: 'muted', text: 'No custom presets yet.' })); return; }
        list.forEach(function (c) {
            box.appendChild(el('div', { class: 'preset' }, [
                el('span', { text: c.name }), el('span', { class: 'dim', text: c.w + '×' + c.h }),
                el('button', { class: 'x', text: '×', title: 'Delete', on: { click: function () {
                    Presets.removeCustom(c.id);
                    Settings.set('selectedPresets', selectedPresetIds().filter(function (x) { return x !== c.id; }));
                    renderPresets(); renderCustomList();
                } } })
            ]));
        });
    }

    /* ---------------- Alignment ---------------- */
    function refreshAlign() {
        var ax = Settings.get('auto.alignX'), ay = Settings.get('auto.alignY');
        $$('#alignGrid button').forEach(function (b) {
            b.classList.toggle('on', b.getAttribute('data-x') === ax && b.getAttribute('data-y') === ay);
        });
    }

    /* ---------------- Naming helpers ---------------- */
    function existingNames() {
        var m = {};
        if (state.doc && state.doc.open) state.doc.artboards.forEach(function (a) { m[a.name] = true; });
        return m;
    }
    function uniqueName(name, taken) {
        var out = name, n = 2;
        while (taken[out]) { out = name + '_' + n; n++; }
        taken[out] = true;
        return out;
    }
    function ctxFor(preset, extra) {
        var c = { key: preset.key, preset: preset.name, platform: preset.platform, name: preset.key, w: preset.w, h: preset.h };
        for (var k in extra) if (extra.hasOwnProperty(k)) c[k] = extra[k];
        return c;
    }
    function updateNamePreview() {
        var out = $('namePreview');
        if (!out) return;
        var d = state.doc;
        if (!d || !d.open || !d.artboards.length) { out.textContent = 'Open a document to preview'; return; }
        var ab = d.artboards[0];
        for (var i = 0; i < d.artboards.length; i++) if (state.sel.exp[d.artboards[i].index] !== false) { ab = d.artboards[i]; break; }
        out.textContent = exportBase(ab, 1, Settings.get('exp.scale')) + '.' + firstFormat();
    }

    /* ---------------- Artboard creation ---------------- */
    function buildCreateItems() {
        var chosen = selectedPresetIds();
        var list = Presets.all().filter(function (p) { return chosen.indexOf(p.id) >= 0; });
        if (!list.length) throw new Error('Select at least one preset on the Artboards tab.');
        var qty = Math.max(1, Math.min(20, Settings.get('gen.qty') || 1));
        var tpl = Settings.get('gen.tpl') || '{key}';
        var taken = existingNames();
        var items = [];
        list.forEach(function (p) {
            for (var q = 1; q <= qty; q++) {
                var t = tpl;
                if (qty > 1 && tpl.indexOf('{n}') < 0) t += '_{n}';
                var name = uniqueName(Naming.apply(t, ctxFor(p, { n: Naming.pad(q, 2), index: q })), taken);
                items.push({ name: name, w: p.w, h: p.h, platform: p.platform, presetId: p.id });
            }
        });
        return items;
    }
    function itemsForHost(items) {
        return items.map(function (i) { return { name: i.name, w: i.w, h: i.h, platform: i.platform }; });
    }

    function placeOptions() {
        var a = Settings.get('auto');
        var src = parseInt($('srcArtboard').value, 10);
        return {
            sourceIndex: isNaN(src) ? -1 : src,
            useSelection: !!a.useSelection,
            mode: a.mode, margin: a.margin, alignX: a.alignX, alignY: a.alignY,
            bgMode: a.bgMode, clip: !!a.clip, scaleStrokes: !!a.scaleStrokes,
            groupByPlatform: !!a.groupLayers, replace: !!a.replace
        };
    }

    function safeSpecs(artboards) {
        return artboards.map(function (ab) {
            var p = Presets.detect(ab);
            return { index: ab.index, safe: (p ? p.safe : Presets.DEFAULT_SAFE) };
        });
    }
    function drawSafe(artboards) {
        var a = Settings.get('auto');
        return Bridge.call('drawSafeZones', { artboards: safeSpecs(artboards), showText: !!a.safeText, showOverlays: !!a.safeOverlays });
    }

    function createFlow(withPlace) {
        return run('Create artboards', function () {
            var items = buildCreateItems();
            var drawAfter = Settings.get('gen.safeAfter');
            var gen = Settings.get('gen');
            var p;
            if (withPlace) {
                var po = placeOptions(); po.replace = false;
                p = Bridge.call('generateVariations', {
                    create: { items: itemsForHost(items), layout: gen.layout, gap: gen.gap },
                    place: po
                });
            } else {
                p = Bridge.call('createArtboards', { items: itemsForHost(items), layout: gen.layout, gap: gen.gap });
            }
            return p.then(function (res) {
                var created = res.created;
                Settings.pushRecent(items.map(function (i) { return i.presetId; }));
                renderRecent();
                var after = drawAfter ? drawSafe(created) : Promise.resolve();
                return after.then(function () {
                    var msg = 'Created ' + created.length + ' artboard' + (created.length === 1 ? '' : 's');
                    if (withPlace) msg += ' and placed the design on ' + res.placed;
                    if (withPlace && !res.backgroundDetected) msg += ' (no full-artboard background detected)';
                    toast(msg + '.', 'ok');
                });
            });
        });
    }

    function customAdd() {
        var name = $('customName').value.replace(/^\s+|\s+$/g, '');
        var w = parseInt($('customW').value, 10), h = parseInt($('customH').value, 10);
        if (!name) return toast('Enter a name for the custom size.', 'err');
        if (!(w > 0 && h > 0) || w > 16383 || h > 16383) return toast('Width and height must be between 1 and 16383.', 'err');
        var id = Presets.addCustom(name, w, h);
        Settings.set('selectedPresets', selectedPresetIds().concat([id]));
        $('customName').value = ''; $('customW').value = ''; $('customH').value = '';
        renderPresets(); renderCustomList();
        toast('Added "' + name + '" (' + w + '×' + h + ').', 'ok');
    }

    function autoRename() {
        run('Auto-rename', function () {
            var tpl = Settings.get('gen.tpl') || '{key}';
            var counters = {}, renames = [];
            state.doc.artboards.forEach(function (ab) {
                var p = Presets.detect(ab);
                if (!p) return;
                counters[p.id] = (counters[p.id] || 0) + 1;
                renames.push({ preset: p, ab: ab, n: counters[p.id] });
            });
            if (!renames.length) throw new Error('No artboards match a known preset name or size.');
            var taken = {};
            var payload = renames.map(function (r) {
                var t = tpl;
                if (counters[r.preset.id] > 1 && tpl.indexOf('{n}') < 0) t += '_{n}';
                var name = uniqueName(Naming.apply(t, ctxFor(r.preset, { n: Naming.pad(r.n, 2), index: r.n })), taken);
                return { index: r.ab.index, name: name };
            });
            return Bridge.call('renameArtboards', { renames: payload }).then(function (res) {
                toast('Renamed ' + res.renamed + ' artboard(s).', 'ok');
            });
        });
    }

    /* ---------------- Design automation ---------------- */
    function resolveSource() {
        var s = parseInt($('srcArtboard').value, 10);
        return (isNaN(s) || s < 0) ? state.doc.activeArtboard : s;
    }
    function resolveTargets() {
        var src = resolveSource();
        var mode = Settings.get('auto.target');
        return state.doc.artboards.filter(function (ab) {
            if (ab.index === src) return false;
            return mode === 'all' || state.sel.auto[ab.index] !== false;
        });
    }
    function placeFlow() {
        run('Place design', function () {
            var targets = resolveTargets();
            if (!targets.length) throw new Error('No target artboards. Create artboards first.');
            var po = placeOptions();
            po.targets = targets.map(function (ab) {
                var p = Presets.detect(ab);
                return { index: ab.index, name: ab.name, platform: p ? p.platform : 'Custom' };
            });
            return Bridge.call('placeDesign', po).then(function (r) {
                var msg = 'Placed design on ' + r.placed + ' artboard' + (r.placed === 1 ? '' : 's') + '.';
                if (!r.backgroundDetected && po.bgMode === 'extend' && !po.useSelection) msg += ' No full-artboard background was detected.';
                toast(msg, 'ok');
            });
        });
    }
    function fitFlow(action) {
        run(action === 'fit' ? 'Fit artwork' : 'Center artwork', function () {
            var a = Settings.get('auto');
            return Bridge.call('fitSelection', {
                action: action, mode: 'fit', margin: action === 'fit' ? a.margin : 0, scaleStrokes: !!a.scaleStrokes
            }).then(function (r) {
                toast((action === 'fit' ? 'Fitted' : 'Centered') + ' artwork on "' + r.artboard + '".', 'ok');
            });
        });
    }
    function safeDrawFlow() {
        run('Draw safe zones', function () {
            var targets = state.doc.artboards.filter(function (ab) {
                return Settings.get('auto.target') === 'all' || state.sel.auto[ab.index] !== false;
            });
            return drawSafe(targets).then(function (r) { toast('Drew ' + r.guides + ' guide(s) on layer "SMDA Safe Zones".', 'ok'); });
        });
    }
    function safeClearFlow() {
        run('Clear guides', function () {
            return Bridge.call('clearSafeZones', {}).then(function (r) {
                toast(r.cleared ? 'Safe zone guides removed.' : 'No safe zone guides found.', 'ok');
            });
        });
    }

    /* ---------------- Export ---------------- */
    function selectedFormats() {
        return ['png', 'jpg', 'svg', 'pdf'].filter(function (f) { return Settings.get('exp.fmt_' + f); });
    }
    function firstFormat() { return selectedFormats()[0] || 'png'; }

    function exportBase(ab, index, scale) {
        var p = Presets.detect(ab);
        var e = Settings.get('exp');
        var tpl = Naming.templateFor(e.convention, e.tpl);
        var ctx = {
            key: p ? p.key : Naming.sanitize(ab.name),
            preset: p ? p.name : ab.name,
            platform: p ? p.platform : 'Custom',
            name: ab.name, w: ab.w, h: ab.h, index: index, n: Naming.pad(index, 2),
            doc: Naming.docBase(state.doc ? state.doc.name : 'Document'),
            scale: Naming.scaleSuffix(scale).replace('@', '')
        };
        var base = Naming.apply(tpl, ctx);
        if (e.scaleSuffix && scale !== 100) base += Naming.scaleSuffix(scale);
        return base;
    }

    function ensureFolder() {
        var f = Settings.get('exp.folder');
        if (f) return Promise.resolve(f);
        return Bridge.call('getDefaultFolder', {}).then(function (r) {
            Settings.set('exp.folder', r.path);
            refreshBindings();
            return r.path;
        });
    }

    function exportFlow() {
        var formats = selectedFormats();
        if (!formats.length) return toast('Choose at least one export format.', 'err');
        run('Export', function () {
            var d = state.doc, e = Settings.get('exp');
            var abs = d.artboards.filter(function (ab) { return e.scope === 'all' || state.sel.exp[ab.index] !== false; });
            if (!abs.length) throw new Error('No artboards selected for export.');
            return ensureFolder().then(function (folder) {
                var jobs = [];
                abs.forEach(function (ab, i) {
                    formats.forEach(function (f) { jobs.push({ ab: ab, fmt: f, idx: i + 1 }); });
                });
                var log = $('exportLog'); log.innerHTML = '';
                $('progWrap').hidden = false; $('progBar').style.width = '0%';
                var done = 0, failed = 0;
                function update(msg) {
                    $('progBar').style.width = Math.round(done / jobs.length * 100) + '%';
                    $('progText').textContent = msg + ' (' + done + '/' + jobs.length + ')';
                }
                update('Starting…');
                var chain = Promise.resolve();
                jobs.forEach(function (job) {
                    chain = chain.then(function () {
                        update('Exporting ' + job.ab.name + ' → ' + job.fmt.toUpperCase());
                        return Bridge.call('exportArtboard', {
                            index: job.ab.index, format: job.fmt, folder: folder,
                            base: exportBase(job.ab, job.idx, e.scale),
                            scale: e.scale, transparent: !!e.transparent, quality: e.quality
                        }).then(function (r) {
                            done++; log.appendChild(el('li', { class: 'ok', text: r.name }));
                        }).catch(function (err) {
                            done++; failed++;
                            log.appendChild(el('li', { class: 'err', text: job.ab.name + ' (' + job.fmt + '): ' + err.message }));
                        });
                    });
                });
                return chain.then(function () {
                    update(failed ? 'Finished with errors' : 'Export complete');
                    var ok = jobs.length - failed;
                    toast(ok + ' file' + (ok === 1 ? '' : 's') + ' exported to ' + folder + (failed ? ' · ' + failed + ' failed' : ''), failed ? 'err' : 'ok');
                });
            });
        });
    }

    function browse() {
        var cur = Settings.get('exp.folder');
        var p = S.CSI.chooseFolder('Choose export folder', cur || '');
        if (p) { Settings.set('exp.folder', p); refreshBindings(); }
    }
    function openFolder() {
        var f = Settings.get('exp.folder');
        if (!f) return toast('Choose a destination folder first.', 'err');
        Bridge.call('revealFolder', { path: f }).catch(function (err) { toast(err.message, 'err'); });
    }

    /* ---------------- Quick actions ---------------- */
    function quickAction(name) {
        if (name === 'create') return createFlow(false);
        if (name === 'variations') return createFlow(true);
        if (name === 'duplicate') { return placeFlow(); }
        if (name === 'fit') return fitFlow('fit');
        if (name === 'center') return fitFlow('center');
        if (name === 'exportall') {
            Settings.set('exp.scope', 'all'); refreshBindings(); return exportFlow();
        }
    }

    /* ---------------- Init ---------------- */
    function init() {
        // populate naming convention selects
        ['expConv', 'defConv'].forEach(function (id) {
            var sel = $(id);
            Object.keys(Naming.CONVENTIONS).forEach(function (k) {
                sel.appendChild(el('option', { value: k, text: Naming.CONVENTIONS[k].label }));
            });
        });

        bindSettings();
        refreshBindings();
        renderPresets();
        renderRecent();
        renderCustomList();

        $$('.tab-btn').forEach(function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });
        $$('.qa').forEach(function (b) { b.addEventListener('click', function () { quickAction(b.getAttribute('data-action')); }); });
        $$('#alignGrid button').forEach(function (b) {
            b.addEventListener('click', function () {
                Settings.set('auto.alignX', b.getAttribute('data-x'));
                Settings.set('auto.alignY', b.getAttribute('data-y'));
                refreshAlign();
            });
        });

        $('selAll').addEventListener('click', function () { Settings.set('selectedPresets', Presets.all().map(function (p) { return p.id; })); renderPresets(); });
        $('selNone').addEventListener('click', function () { Settings.set('selectedPresets', []); renderPresets(); });
        $('qty').addEventListener('input', updateSelSummary);
        $('customAdd').addEventListener('click', customAdd);
        $('btnCreate').addEventListener('click', function () { createFlow(!!Settings.get('gen.placeAfter')); });
        $('btnRename').addEventListener('click', autoRename);
        $('btnPlace').addEventListener('click', placeFlow);
        $('btnSafeDraw').addEventListener('click', safeDrawFlow);
        $('btnSafeClear').addEventListener('click', safeClearFlow);
        $('btnExport').addEventListener('click', exportFlow);
        $('btnBrowse').addEventListener('click', browse);
        $('btnOpenFolder').addEventListener('click', openFolder);
        $('btnReset').addEventListener('click', function () {
            Settings.reset(); refreshBindings(); renderPresets(); renderRecent(); renderCustomList(); toast('Settings restored.', 'ok');
        });
        $('versionLine').textContent = 'Social Media Design Automation 1.0.0';

        if (S.CSI.available()) {
            applyTheme();
            try { S.CSI.onThemeChange(applyTheme); } catch (e) {}
        }
        refreshDoc();
        setInterval(refreshDoc, 2500);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
