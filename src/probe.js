const { spawn } = require('child_process');
const path = require('path');
const { hget, wsConnect } = require('./cdp');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = 'file:///' + path.resolve('..', 'atoll-jelly.html').replace(/\\/g, '/');

const SETS = [
  ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'],
  ['--enable-unsafe-webgpu'],
  ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--disable-gpu-sandbox'],
  ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-webgpu-adapter=swiftshader', '--disable-gpu-sandbox', '--in-process-gpu'],
  ['--enable-unsafe-webgpu', '--use-angle=gl', '--disable-gpu-sandbox', '--enable-features=Vulkan'],
  ['--enable-unsafe-webgpu', '--disable-dawn-features=disallow_unsafe_apis', '--enable-features=WebGPUService'],
];

(async () => {
  for (let s = 0; s < SETS.length; s++) {
    const PORT = 9600 + s * 7;
    const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=800,600', 'about:blank', ...SETS[s]], { stdio: 'ignore' });
    await sleep(1500);
    let ok = 'launch-fail';
    try {
      let wsUrl = null;
      for (let i = 0; i < 30; i++) {
        try { wsUrl = JSON.parse(await hget(`http://127.0.0.1:${PORT}/json/version`)).webSocketDebuggerUrl; break; } catch (e) { await sleep(250); }
      }
      if (!wsUrl) { console.log('SET' + s, 'no devtools'); proc.kill(); continue; }
      const fix = (u) => u.replace(/^(wss?:\/\/)([^\/:]+)(\/)/, '$1$2:' + PORT + '$3');
      const page = JSON.parse(await new Promise((res, rej) => {
        const req = require('http').request('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' }, (r) => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); });
        req.on('error', rej); req.end();
      }));
      const ws = await wsConnect(fix(page.webSocketDebuggerUrl));
      let idc = 0; const pend = new Map();
      ws.onMessage = (m) => { if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
      const send = (method, params) => new Promise((res) => { const id = ++idc; pend.set(id, res); ws.send({ id, method, params: params || {} }); setTimeout(() => res({}), 25000); });
      await send('Runtime.enable');
      await send('Page.enable');
      await send('Page.navigate', { url: URL });
      await sleep(2500);
      const r = await send('Runtime.evaluate', {
        expression: `(async()=>{ try{ if(!navigator.gpu) return 'no-navigator-gpu';
          const a = await navigator.gpu.requestAdapter(); if(!a) return 'null-adapter';
          const d = await a.requestDevice();
          return 'OK vendor=' + (a.info? a.info.vendor:'?') + ' arch=' + (a.info? a.info.architecture:'?');
        }catch(e){ return 'ERR '+e.message } })()`,
        awaitPromise: true, returnByValue: true,
      });
      ok = r.result && r.result.result && r.result.result.value;
      ws.close();
    } catch (e) { ok = 'err ' + e.message; }
    console.log('SET' + s, JSON.stringify(SETS[s]), '=>', ok);
    try { proc.kill(); } catch (e) { }
    await sleep(400);
  }
  process.exit(0);
})();
