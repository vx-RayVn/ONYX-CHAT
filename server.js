/** Hosting entry: always starts when loaded directly or by a managed Node launcher. */
import { createServer } from 'node:http';
import { createHandler } from './server-handler.js';

createHandler().then(handler => {
  const server = createServer((req, res) => void handler(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }));
  server.on('error', () => {
    console.error('ONYX startup failed: server listener unavailable.');
    process.exitCode = 1;
  });
  server.listen(Number(process.env.PORT) || 3000, '0.0.0.0');
}).catch(() => {
  console.error('ONYX startup failed: check public configuration and build output.');
  process.exitCode = 1;
});
