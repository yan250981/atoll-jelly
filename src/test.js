const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'file:///' + path.resolve(process.argv[2] || 'atoll-jelly.html').replace(/\\/g, '/');

const args = [
  '--headless=new',
  '--remote-debugging-port=9333',
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
  '--use-angle=swiftshader',
  '--disable-vulkan-surface',
  '--use-gl=angle',
  '--no-sandbox',
  '--allow-file-access-from-files',
  '--window-size=1280,860',
  '--hide-scrollbars',
  'about:blank',
];
const proc = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let chromeErr = '';
proc.stderr.on('data', (d) => { chromeErr += d.toString(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const http = require('http');
function hget(url) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: 'GET', headers: { Host: '127.0.0.1' } }, (r) => {
      let b = ''; r.on('data', (d) => b += d); r.on('end', () => res(b));
    });
    req.on('error', rej); req.setTimeout(4000, () => { req.destroy(new Error('timeout')); }); req.end();
  });
}

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const j = JSON.parse(await hget('http://127.0.0.1:9333/json/version'));
      return j.webSocketDebuggerUrl;
    } catch (e) { await sleep(300); }
  }
  throw new Error('chrome did not start: ' + chromeErr.slice(0, 400));
}

let idc = 0;
function mk(ws, msgs) {
  return (method, params) => new Promise((res, rej) => {
    const id = ++idc;
    const h = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === id) { ws.removeEventListener('message', h); res(m); }
    };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    setTimeout(() => rej(new Error('timeout ' + method)), 60000);
  });
}

(async () => {
  const ver = await getTarget();
  const base = ver.split('/devtools/')[0];
  const page = JSON.parse(await new Promise((res, rej) => {
    const req = http.request(base + '/json/new?about:blank', { method: 'PUT' }, (r) => { let b=''; r.on('data',d=>b+=d); r.on('end',()=>res(b)); });
    req.on('error', rej); req.end();
  }));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const logs = [];
  await new Promise((res) => { ws.addEventListener('open', res); });
  const send = mk(ws, logs);
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push({ type: m.params.type, text: m.params.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ') });
    }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push({ type: 'exception', text: JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text) });
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(3500);

  const probe = await send('Runtime.evaluate', {
    expression: `(function(){
      const a = window.__aj;
      if (!a) return { ok:false, reason:'no __aj', body: document.body.innerHTML.length };
      return { ok:true, ready:a.ready, canvas:[document.getElementById('gpu').width, document.getElementById('gpu').height], frames: a.qa ? a.qa.frames : -1, errors: a.qa ? a.qa.errors : [] };
    })()`,
    returnByValue: true,
  });
  console.log('PROBE', JSON.stringify(probe.result && probe.result.result && probe.result.result.value));
  console.log('LOGS', JSON.stringify(logs.slice(0, 30), null, 1));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) fs.writeFileSync('shot1.png', Buffer.from(shot.result.data, 'base64'));

  ws.close();
  proc.kill();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); console.error(chromeErr.slice(0, 800)); proc.kill(); process.exit(1); });
