import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

function customHorizon(): Plugin {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const localPython = fileURLToPath(new URL(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python', import.meta.url));
  const python = process.env.SERAPHIM_PYTHON || (existsSync(localPython) ? localPython : 'python');

  // One long-lived Python worker keeps the two LOLA DEMs in memory: reading them
  // costs ~5 s, a horizon from the resident DEMs ~1 s. The worker starts on the
  // first request and exits after IDLE_MS without one, releasing its ~0.5 GB.
  const IDLE_MS = 5 * 60_000;
  const TIMEOUT_MS = 60_000;
  let worker: ChildProcess | null = null;
  let buffer = '';
  let pending: ((line: string | null) => void) | null = null;
  let idle: NodeJS.Timeout | undefined;
  const stop = () => { clearTimeout(idle); worker?.kill(); };
  const start = (): ChildProcess => {
    const child = spawn(python, ['scripts/custom_horizon.py', '--serve'], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'] });
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      buffer += chunk;
      for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        const done = pending;
        pending = null;
        done?.(line);
      }
    });
    child.stdin!.on('error', () => {});
    const gone = () => {
      if (worker === child) { worker = null; buffer = ''; }
      const done = pending;
      pending = null;
      done?.(null);
    };
    child.once('exit', gone);
    child.once('error', gone);
    return child;
  };
  const query = (lat: number, lon: number) => new Promise<string | null>(resolve => {
    worker ??= start();
    clearTimeout(idle);
    const timer = setTimeout(() => { console.error('Custom horizon: timed out'); stop(); }, TIMEOUT_MS);
    pending = line => { clearTimeout(timer); idle = setTimeout(stop, IDLE_MS); idle.unref(); resolve(line); };
    worker.stdin!.write(`${lat} ${lon}\n`);
  });

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/api/custom-horizon') return next();
    const send = (status: number, body: string) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(body);
    };
    // Plugin middleware runs before Vite's own host/CORS checks, so repeat them: a loopback
    // Host blocks DNS rebinding; fetch metadata blocks cross-site triggers (<img>, forms).
    // shortcut: loopback only; add LAN hosts here if the server is ever run with --host.
    const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    const site = req.headers['sec-fetch-site'];
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host) || (site && site !== 'same-origin' && site !== 'none'))
      return send(403, '{"error":"Forbidden."}');
    if (req.method !== 'GET') return send(405, '{"error":"Use GET."}');
    const lat = Number(url.searchParams.get('lat') ?? NaN);
    const lon = Number(url.searchParams.get('lon') ?? NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return send(400, '{"error":"Invalid lunar coordinates."}');
    if (pending) return send(409, '{"error":"Terrain calculator is busy."}');
    const unavailable = () => send(503, '{"error":"Local LOLA terrain data or the Python environment is unavailable."}');
    // A client that gives up does not interrupt the worker (that would discard its
    // resident DEMs); the answer is ignored and the client's 409 retry covers the wait.
    void query(lat, lon).then(line => {
      if (line === null) return unavailable();
      let reply: { ok?: boolean; result?: unknown; error?: string };
      try { reply = JSON.parse(line); } catch { return unavailable(); }
      if (!reply.ok) { console.error('Custom horizon:', reply.error); return unavailable(); }
      send(200, JSON.stringify(reply.result ?? null));
    });
  };
  return {
    name: 'seraphim-custom-horizon',
    configureServer(server) { server.middlewares.use(middleware); server.httpServer?.once('close', stop); },
    configurePreviewServer(server) { server.middlewares.use(middleware); server.httpServer?.once('close', stop); },
  };
}

export default defineConfig({
  plugins: [react(), customHorizon()],
  base: './',
  build: { chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
