import crypto from 'node:crypto';

export const uid = (p = '') => p + crypto.randomBytes(9).toString('base64url');
export const now = () => Date.now();
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  const send = (event, data) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch { /* client gone */ }
  };
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
  res.on('close', () => clearInterval(ping));
  return { send, close: () => { clearInterval(ping); try { res.end(); } catch {} } };
}
