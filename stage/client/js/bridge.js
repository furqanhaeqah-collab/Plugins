/**
 * Illustrator Integration Layer (panel side).
 * Wraps evalScript in promises and speaks the {ok,data|error} protocol
 * implemented by smdaCall() in host/host.jsx.
 */
SMDA.Bridge = (function () {
    var hostChecked = false;

    function raw(script) {
        return new Promise(function (resolve) {
            SMDA.CSI.evalScript(script, resolve);
        });
    }

    /** Make sure host.jsx is loaded (CEP normally loads it via ScriptPath). */
    function ensureHost() {
        if (hostChecked) return Promise.resolve();
        return raw('typeof smdaCall').then(function (t) {
            if (t === 'function') { hostChecked = true; return; }
            var path = SMDA.CSI.extensionPath() + '/host/host.jsx';
            return raw('$.evalFile(' + JSON.stringify(path) + ')').then(function () {
                return raw('typeof smdaCall');
            }).then(function (t2) {
                if (t2 !== 'function') throw new Error('Could not load host/host.jsx into Illustrator.');
                hostChecked = true;
            });
        });
    }

    function call(fn, args) {
        return ensureHost().then(function () {
            var script = 'smdaCall(' + JSON.stringify(fn) + ',' + JSON.stringify(JSON.stringify(args || {})) + ')';
            return raw(script);
        }).then(function (res) {
            if (res === undefined || res === 'undefined' || res === null || res === '') {
                throw new Error('Illustrator returned no result (is a dialog open?).');
            }
            if (res === 'EvalScript error.') throw new Error('Illustrator script error (host.jsx failed to run).');
            var o;
            try { o = JSON.parse(res); } catch (e) { throw new Error('Unexpected reply from Illustrator: ' + String(res).slice(0, 200)); }
            if (!o.ok) throw new Error(o.error || 'Unknown Illustrator error');
            return o.data;
        });
    }

    return { call: call };
})();
