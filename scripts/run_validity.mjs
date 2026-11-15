// Vite loads the same TypeScript modules and import.meta.env as the browser.
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const runtime = await server.ssrLoadModule('/scripts/validity_runtime.ts');
  await runtime.run(process.argv[2] ?? 'evaluate');
} finally { await server.close(); }
