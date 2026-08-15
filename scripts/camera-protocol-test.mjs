import WebSocket from 'ws';
import { existsSync, readFileSync } from 'node:fs';

const rootCertificateFile = new URL('../.cert/rootCA.pem', import.meta.url);
const secure = existsSync(rootCertificateFile);
const socketUrl = `${secure ? 'wss' : 'ws'}://127.0.0.1:3001`;
const socketOptions = secure ? { ca: readFileSync(rootCertificateFile) } : undefined;

const once = (socket, type) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 5000);
  const handler = (data) => {
    const message = JSON.parse(data.toString());
    if (message.type !== type) return;
    clearTimeout(timer);
    socket.off('message', handler);
    resolve(message);
  };
  socket.on('message', handler);
});

const open = (socket) => new Promise((resolve, reject) => {
  socket.once('open', resolve);
  socket.once('error', reject);
});

const controller = new WebSocket(socketUrl, socketOptions);
await open(controller);
controller.send(JSON.stringify({ type: 'register', role: 'controller', controllerId: `protocol-test-${Date.now()}` }));
const registered = await once(controller, 'registered');

const phone = new WebSocket(socketUrl, socketOptions);
await open(phone);
const discovered = once(controller, 'phone-connected');
phone.send(JSON.stringify({ type: 'register', role: 'phone', pairCode: registered.pairCode, deviceId: 'protocol-test-phone', label: 'Protocol Test Phone' }));
await once(phone, 'registered');
await discovered;

const pingReceived = once(phone, 'device-ping');
controller.send(JSON.stringify({ type: 'device-ping', target: 'protocol-test-phone', time: Date.now() }));
const ping = await pingReceived;
const pongReceived = once(controller, 'device-pong');
phone.send(JSON.stringify({ type: 'device-pong', deviceId: 'protocol-test-phone', time: ping.time }));
const pong = await pongReceived;

console.log(JSON.stringify({ pairCode: registered.pairCode, device: pong.source, protocol: 'ok' }));
phone.close();
controller.close();
