const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { hget, wsConnect } = require('./cdp');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FILE = process.argv[2] || 'atoll-jelly.html';
const URL = 'file:///' + path.resolve('..', FILE).replace(/\\/g, '/');
const OUTFILE = process.argv[3] || 'shot1.png';
const PORT = 9333 + Math.floor(Math.random() * 200);

const args = [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader',
  '--no-sandbox',
  '--allow-file-access-from-files',
  '--window-size=1280,860',
  '--hide-scrollbars',
  '--disable-gpu-sandbox',
  'about:blank',
];
const proc = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let chromeErr = '';
proc.stderr.on('data', (d) => { chromeErr += d.toString(); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let wsUrl = null;
  for (let i = 0; i < 50; i++) {
    try { wsUrl = JSON.parse(await hget(`http://127.0.0.1:${PORT}/json/version`)).webSocketDebuggerUrl; break; } catch (e) { await sleep(300); }
  }
  if (!wsUrl) throw new Error('no devtools');
  const fix = (u) => u.replace(/^(wss?:\/\/)([^\/:]+)(\/)/, '$1$2:' + PORT + '$3');
  wsUrl = fix(wsUrl);
  const base = 'http://127.0.0.1:' + PORT;
  const page = JSON.parse(await new Promise((res, rej) => {
    const req = require('http').request(base + '/json/new?about:blank', { method: 'PUT' }, (r) => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); });
    req.on('error', rej); req.end();
  }));
  const ws = await wsConnect(fix(page.webSocketDebuggerUrl));
  const logs = [];
  ws.onMessage = (m) => {
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push({ t: m.params.type, s: m.params.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ') });
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push({ t: 'EXCEPTION', s: (d.exception && d.exception.description) || d.text });
    } else if (m.method === 'Log.entryAdded') {
      logs.push({ t: 'log:' + m.params.entry.level, s: m.params.entry.text });
    }
  };
  let idc = 0;
  const pending = new Map();
  const raw = ws.onMessage;
  ws.onMessage = (m) => { if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } raw(m); };
  const send = (method, params) => new Promise((res, rej) => {
    const id = ++idc;
    pending.set(id, res);
    ws.send({ id, method, params: params || {} });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 90000);
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(4000);

  const probe = await send('Runtime.evaluate', {
    expression: `(function(){
      const a = window.__aj;
      const c = document.getElementById('gpu');
      if (!a) return { ok:false, reason:'no __aj', html: document.documentElement.outerHTML.length };
      return { ok:true, ready:a.ready, canvas:[c.width,c.height], frames:a.qa? a.qa.frames:-1,
               errors:(a.qa?a.qa.errors:[]).slice(0,4), errCount: a.qa?a.qa.errors.length:0,
               gpu: !!navigator.gpu };
    })()`, returnByValue: true,
  });
  console.log('PROBE', JSON.stringify(probe.result && probe.result.result && probe.result.result.value));
  if (logs.length) console.log('LOGS', JSON.stringify(logs.slice(0, 20), null, 1));

  if (process.argv[5]) {
    const ev = await send('Runtime.evaluate', { expression: process.argv[5], awaitPromise: true, returnByValue: true });
    console.log('EVAL', String(JSON.stringify(ev.result && ev.result.result && ev.result.result.value)).slice(0, 800));
    await sleep(1500);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) { fs.writeFileSync(OUTFILE, Buffer.from(shot.result.data, 'base64')); console.log('shot saved', OUTFILE); }

  if (process.argv[4] === 'checks') {
    const chk = await send('Runtime.evaluate', { expression: 'window.__aj.check()', awaitPromise: true, returnByValue: true, timeout: 180000 });
    const v = chk.result && chk.result.result && chk.result.result.value;
    if (v) {
      console.log('\nQA ' + v.pass + '/' + v.total);
      for (const r of v.results) console.log((r.pass ? ' ok   ' : ' FAIL ') + r.name + (r.detail ? '  |  ' + r.detail : ''));
    } else console.log('CHECK RAW', JSON.stringify(chk.result).slice(0, 600));
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    if (shot2.result && shot2.result.data) fs.writeFileSync(OUTFILE.replace('.png', '-qa.png'), Buffer.from(shot2.result.data, 'base64'));
  }

  ws.close(); proc.kill(); process.exit(0);
})().catch((e) => { console.error('ERR', e.message); console.error(chromeErr.slice(0, 900)); proc.kill(); process.exit(1); });
