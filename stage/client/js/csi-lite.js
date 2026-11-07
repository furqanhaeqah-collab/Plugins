/**
 * Minimal CEP bridge (subset of Adobe's CSInterface) so the panel has no
 * external dependency. Uses the host-injected window.__adobe_cep__ object.
 */
var SMDA = window.SMDA || {};
window.SMDA = SMDA;

SMDA.CSI = (function () {
    function cep() {
        if (!window.__adobe_cep__) throw new Error('Not running inside an Adobe CEP panel.');
        return window.__adobe_cep__;
    }
    return {
        available: function () { return !!window.__adobe_cep__; },
        evalScript: function (script, cb) { cep().evalScript(script, cb || function () {}); },
        hostEnv: function () { return JSON.parse(cep().getHostEnvironment()); },
        /** Local file-system path of this extension folder. */
        extensionPath: function () {
            var p = cep().getSystemPath('extension');
            p = decodeURI(p.replace(/^file:\/\//, ''));
            if (/^\/[A-Za-z]:/.test(p)) p = p.substring(1); // Windows: /C:/...
            return p;
        },
        onThemeChange: function (cb) {
            cep().addEventListener('com.adobe.csxs.events.ThemeColorChanged', cb);
        },
        /** Native folder chooser via cep.fs. Resolves to a path or null. */
        chooseFolder: function (title, defaultPath) {
            if (!window.cep || !window.cep.fs) return null;
            var r = window.cep.fs.showOpenDialogEx(false, true, title || 'Choose folder', defaultPath || '', [], '');
            if (r && r.err === 0 && r.data && r.data.length) return r.data[0];
            return null;
        }
    };
})();
