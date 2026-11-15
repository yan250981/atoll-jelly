/* minimal CDP client over a hand-rolled websocket */
const net = require('net');
const crypto = require('crypto');
const http = require('http');

function hget(url) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: 'GET', headers: { Host: '127.0.0.1' } }, (r) => {
      let b = ''; r.on('data', (d) => b += d); r.on('end', () => res(b));
    });
    req.on('error', rej); req.setTimeout(4000, () => req.destroy(new Error('timeout'))); req.end();
  });
}

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0);
    let shook = false;
    const handlers = [];
    const api = {
      onMessage: null,
      send(obj) {
        const data = Buffer.from(JSON.stringify(obj));
        const len = data.length;
        let head;
        if (len < 126) { head = Buffer.alloc(2); head[1] = 0x80 | len; }
        else if (len < 65536) { head = Buffer.alloc(4); head[1] = 0x80 | 126; head.writeUInt16BE(len, 2); }
        else { head = Buffer.alloc(10); head[1] = 0x80 | 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(len, 6); }
        head[0] = 0x81;
        const mask = crypto.randomBytes(4);
        const masked = Buffer.alloc(len);
        for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i & 3];
        sock.write(Buffer.concat([head, mask, masked]));
      },
      close() { try { sock.destroy(); } catch (e) { } },
    };
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!shook) {
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        const head = buf.slice(0, i).toString();
        if (!/101/.test(head)) { reject(new Error('handshake failed: ' + head.slice(0, 120))); return; }
        buf = buf.slice(i + 4);
        shook = true;
        resolve(api);
      }
      while (buf.length >= 2) {
        const b0 = buf[0], b1 = buf[1];
        let len = b1 & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const payload = buf.slice(off, off + len);
        const op = b0 & 0x0f;
        buf = buf.slice(off + len);
        if (op === 1 && api.onMessage) { try { api.onMessage(JSON.parse(payload.toString())); } catch (e) { } }
        if (op === 8) { api.close(); return; }
      }
    });
    sock.on('error', reject);
  });
}

module.exports = { hget, wsConnect };
