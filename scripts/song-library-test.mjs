import https from 'node:https';

const request = (method, body) => new Promise((resolve, reject) => {
  const req = https.request({ hostname: 'localhost', port: 5180, path: '/__sola/song-library', method, rejectUnauthorized: false, headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {} }, (response) => {
    let payload = '';
    response.on('data', (chunk) => { payload += chunk; });
    response.on('end', () => response.statusCode >= 200 && response.statusCode < 300 ? resolve(payload) : reject(new Error(`HTTP ${response.statusCode}: ${payload}`)));
  });
  req.on('error', reject);
  if (body) req.write(body);
  req.end();
});

const existingPayload = await request('GET');
const songs = JSON.parse(existingPayload);
if (!Array.isArray(songs)) throw new Error('Song library did not return an array.');
const savedPayload = JSON.parse(await request('PUT', JSON.stringify(songs)));
console.log(JSON.stringify({ songs: songs.length, saved: savedPayload.saved, persistence: 'ok' }));
