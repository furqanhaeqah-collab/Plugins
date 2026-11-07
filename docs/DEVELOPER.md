# Developer guide

## Architecture

```
 UI (index.html + app.js)
   │  Settings / Presets / Naming  (pure JS, no Illustrator)
   ▼
 bridge.js  ── Promise wrapper ──►  CSInterface.evalScript("smdaCall(fn, json)")
                                            │
                                            ▼
                                   host/host.jsx  (ExtendScript)
                                   SMDA.Api → Placement / Artboards / Safe / Export
```

Protocol: `smdaCall(fnName, jsonArgs)` returns a JSON string `{ok:true,data}` or `{ok:false,error,line}`. `bridge.js` turns it into a resolved or rejected Promise.

The host is **stateless**: the panel owns presets, naming and settings and sends concrete values (artboard names, sizes, file base names, safe-zone percentages). To add a platform, edit only `client/js/presets.js`.

## Adding a host function

1. Add `myFn: function (a) { ... return {...}; }` to `SMDA.Api`.
2. Call `SMDA.Bridge.call('myFn', {...})` from `app.js`.
Throw `new Error('message')` for user-facing errors; they appear as toasts.

## Conventions

- Illustrator coordinates: points, Y up; rects `[l, t, r, b]`.
- ExtendScript is ES3: no `let/const`, arrow functions, `JSON`, `Array.forEach`. `host.jsx` ships its own JSON polyfill. Panel code may use ES6 but avoids `Promise.finally` for old CEP runtimes.
- Never edit user artwork in place when generating: duplicate to a master group, place copies, delete the master (`SMDA Temp` layer, removed in a `finally`).
- Names created by the plugin: layers `SMDA <Platform>`, `SMDA Designs`, `SMDA Safe Zones`; groups `SMDA: <artboard>`.

## Debugging

- Panel: with `.debug` installed, open `http://localhost:8099`.
- Host: attach the VS Code "ExtendScript Debugger" to Illustrator, or temporarily `$.writeln()` and read ESTK output.
- After editing `host.jsx`, reopen the panel (CEP caches the script per session). After editing client files, right-click the debug page → reload.

## Porting to UXP later

When Illustrator exposes a public UXP API, replace `bridge.js` and port `host.jsx` function-by-function (the `SMDA.Api` surface is the contract). UI, presets, naming and settings carry over unchanged.
