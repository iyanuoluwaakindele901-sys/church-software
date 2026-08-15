import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PORT = 5174;
const rootCertificateFile = path.resolve(globalThis.process.cwd(), '.cert/rootCA.pem');

if (!globalThis.__solaCertificateBootstrap && existsSync(rootCertificateFile)) {
  const rootCertificate = readFileSync(rootCertificateFile);
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (request.url === '/rootCA.pem') {
      response.writeHead(200, {
        'Content-Type': 'application/x-pem-file',
        'Content-Disposition': 'attachment; filename="sola-worship-rootCA.pem"',
      });
      response.end(rootCertificate);
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sola Worship Phone Trust</title><style>body{font-family:system-ui;background:#111;color:#fff;margin:0;padding:28px;line-height:1.5}main{max-width:560px;margin:auto}a{display:inline-block;background:#d4a574;color:#17120e;padding:12px 16px;text-decoration:none;font-weight:700;border-radius:6px}code{color:#d4a574}</style></head><body><main><h1>Sola Worship Phone Trust</h1><p>Install this public local certificate once so your phone trusts the secure camera connection.</p><p><a href="/rootCA.pem">Download trust certificate</a></p><p><strong>iPhone/iPad:</strong> install the downloaded profile, then enable full trust under Settings &gt; General &gt; About &gt; Certificate Trust Settings.</p><p><strong>Android:</strong> install it as a CA certificate under Security settings. Your phone may require a screen lock.</p><p>After installation, return to the Sola Worship computer and scan the secure camera pairing QR.</p><p>Only <code>rootCA.pem</code> is shared. The private CA key remains on the computer.</p></main></body></html>`);
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`Certificate setup port ${PORT} is already in use; the existing setup page will be reused.`);
      return;
    }
    console.error(`Certificate setup server failed: ${error.message}`);
  });
  server.listen(PORT, '0.0.0.0');
  globalThis.__solaCertificateBootstrap = server;
}
