import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

function customHorizon(): Plugin {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const localPython = fileURLToPath(new URL(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python', import.meta.url));
  const python = process.env.SERAPHIM_PYTHON || (existsSync(localPython) ? localPython : 'python');
  let computing = false;
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/api/custom-horizon') return next();
    const send = (status: number, body: string) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(body);
    };
    if (req.method !== 'GET') return send(405, '{"error":"Use GET."}');
    const lat = Number(url.searchParams.get('lat') ?? NaN);
    const lon = Number(url.searchParams.get('lon') ?? NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return send(400, '{"error":"Invalid lunar coordinates."}');
    if (computing) return send(503, '{"error":"Terrain calculator is busy. Try again."}');
    computing = true;
    execFile(python, ['scripts/custom_horizon.py', String(lat), String(lon)], { cwd: root, timeout: 30_000 }, (error, stdout) => {
      computing = false;
      if (error) {
        console.error('Custom horizon:', error.message);
        send(503, '{"error":"Local LOLA terrain data or the Python environment is unavailable."}');
      } else send(200, stdout);
    });
  };
  return {
    name: 'seraphim-custom-horizon',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig({
  plugins: [react(), customHorizon()],
  base: './',
  build: { chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
