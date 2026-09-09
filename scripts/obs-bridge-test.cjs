const { WebSocketServer } = require('ws');
const { ObsBridge, makeAuthentication } = require('../desktop/obsBridge.cjs');

const expectedAuthentication = 'V8pVriFPEtnaK7wzQPlqOgkXegTAwSevsIeJLiFx/Nw=';
const actualAuthentication = makeAuthentication('supersecret', 'salt123', 'challenge456');
if (actualAuthentication !== expectedAuthentication) throw new Error('OBS authentication calculation changed unexpectedly.');

(async () => {
const server = new WebSocketServer({ port: 0 });
await new Promise((resolve) => server.once('listening', resolve));
const port = server.address().port;
let streaming = false;
let virtualCamera = false;
let configured = false;

server.on('connection', (socket) => {
  socket.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.6.0', rpcVersion: 1 } }));
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.op === 1) {
      socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      return;
    }
    if (message.op !== 6) return;
    const { requestType, requestId, requestData } = message.d;
    let responseData = {};
    if (requestType === 'SetStreamServiceSettings') configured = Boolean(requestData.streamServiceSettings?.server && requestData.streamServiceSettings?.key);
    if (requestType === 'StartStream') streaming = true;
    if (requestType === 'StopStream') streaming = false;
    if (requestType === 'StartVirtualCam') virtualCamera = true;
    if (requestType === 'StopVirtualCam') virtualCamera = false;
    if (requestType === 'GetStreamStatus') responseData = { outputActive: streaming, outputDuration: 1200, outputBytes: 900000, outputSkippedFrames: 0, outputTotalFrames: 36 };
    if (requestType === 'GetVirtualCamStatus') responseData = { outputActive: virtualCamera };
    socket.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: { result: true, code: 100 }, responseData } }));
  });
});

const bridge = new ObsBridge();
await bridge.connect({ host: '127.0.0.1', port });
await bridge.configureStream({ server: 'rtmps://example.test/live', key: 'secret-key' });
await bridge.startStream();
await bridge.startVirtualCamera();
const status = await bridge.status();
if (!configured || !status.streaming || !status.virtualCamera || status.totalFrames !== 36) throw new Error('OBS bridge protocol test failed.');
await bridge.stopStream();
await bridge.stopVirtualCamera();
bridge.disconnect();
await new Promise((resolve) => server.close(resolve));

console.log(JSON.stringify({ authentication: 'ok', configuration: 'ok', streaming: 'ok', virtualCamera: 'ok' }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
