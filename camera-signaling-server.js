import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import http from 'node:http';
import https from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PORT = globalThis.process?.env?.PORT || 3001;
const certificateFile = path.resolve(globalThis.process.cwd(), '.cert/sola-worship.pem');
const certificateKeyFile = path.resolve(globalThis.process.cwd(), '.cert/sola-worship-key.pem');
const hasCertificate = existsSync(certificateFile) && existsSync(certificateKeyFile);
const transportServer = hasCertificate
  ? https.createServer({ cert: readFileSync(certificateFile), key: readFileSync(certificateKeyFile) })
  : http.createServer();
const wss = new WebSocketServer({ server: transportServer });
let heartbeatInterval;
let listenFailed = false;

const handleListenError = (error) => {
  if (listenFailed) return;
  listenFailed = true;
  if (error.code === 'EADDRINUSE') {
    console.warn(`Camera signaling port ${PORT} is already in use; the existing signaling server will be reused.`);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    wss.close();
    return;
  }
  console.error(`Camera signaling server failed: ${error.message}`);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  wss.close();
};

transportServer.on('error', handleListenError);
wss.on('error', handleListenError);
transportServer.listen(PORT, '0.0.0.0');

wss.on('listening', () => {
  console.log(`Camera signaling server running on ${hasCertificate ? 'wss' : 'ws'}://0.0.0.0:${PORT}`);
});

const controllers = new Map();
const controllerCodes = new Map();
const phones = new Map();
const presentationControllers = new Map();
const presentationDisplays = new Map();

const makePairCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const send = (ws, payload) => {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
};

const broadcastControllerPhones = (controller) => {
  const list = [];
  phones.forEach((phone) => {
    if (phone.pairCode === controller.pairCode) {
      list.push({ deviceId: phone.deviceId, label: phone.label, facingMode: phone.facingMode, resolution: phone.resolution, fps: phone.fps, connected: phone.connected, lastSeen: phone.lastSeen });
    }
  });
  send(controller.ws, { type: 'registered', pairCode: controller.pairCode, devices: list });
};

const cleanupPhone = (deviceId) => {
  const phone = phones.get(deviceId);
  if (!phone) return;
  phones.delete(deviceId);
  const controller = controllers.get(phone.pairCode);
  if (controller) {
    send(controller.ws, { type: 'phone-disconnected', deviceId });
  }
};

const cleanupController = (pairCode) => {
  const controller = controllers.get(pairCode);
  if (!controller) return;
  controller.ws = null;
};

wss.on('connection', (ws) => {
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const { type } = message;
    if (type === 'register') {
      if (message.role === 'presentation-controller') {
        if (!message.pairCode) return;
        ws.role = 'presentation-controller';
        ws.pairCode = message.pairCode;
        presentationControllers.set(message.pairCode, ws);
        send(ws, { type: 'presentation-registered', pairCode: message.pairCode });
        return;
      }

      if (message.role === 'presentation-display') {
        if (!message.pairCode) return;
        ws.role = 'presentation-display';
        ws.pairCode = message.pairCode;
        if (!presentationDisplays.has(message.pairCode)) presentationDisplays.set(message.pairCode, new Set());
        presentationDisplays.get(message.pairCode).add(ws);
        send(presentationControllers.get(message.pairCode), { type: 'presentation-display-ready' });
        return;
      }

      if (message.role === 'controller') {
        let pairCode = message.pairCode || controllerCodes.get(message.controllerId) || makePairCode();
        while (controllers.has(pairCode)) {
          const existing = controllers.get(pairCode);
          if (existing.controllerId === message.controllerId) break;
          pairCode = makePairCode();
        }
        ws.role = 'controller';
        ws.pairCode = pairCode;
        const controller = { ws, controllerId: message.controllerId, pairCode };
        controllers.set(pairCode, controller);
        controllerCodes.set(message.controllerId, pairCode);
        broadcastControllerPhones(controller);
        return;
      }

      if (message.role === 'phone') {
        const pairCode = message.pairCode;
        if (!pairCode) {
          send(ws, { type: 'error', message: 'pairCode is required' });
          return;
        }
        const controller = controllers.get(pairCode);
        if (!controller) {
          send(ws, { type: 'error', message: 'No controller registered for that pairing code' });
          return;
        }
        ws.role = 'phone';
        ws.deviceId = message.deviceId;
        ws.pairCode = pairCode;
        phones.set(message.deviceId, {
          ws,
          deviceId: message.deviceId,
          pairCode,
          label: message.label || 'Phone Camera',
          facingMode: message.facingMode || 'unknown',
          resolution: message.resolution || 'auto',
          fps: message.fps || 'auto',
          connected: false,
          lastSeen: Date.now(),
        });
        send(ws, { type: 'registered', deviceId: message.deviceId });
        send(controller.ws, {
          type: 'phone-connected',
          device: {
            deviceId: message.deviceId,
            label: message.label || 'Phone Camera',
            facingMode: message.facingMode || 'unknown',
            resolution: message.resolution || 'auto',
            fps: message.fps || 'auto',
            connected: false,
          },
        });
        return;
      }
    }

    if (type === 'phone-metadata') {
      const phone = phones.get(message.deviceId);
      if (!phone) return;
      phone.label = message.label || phone.label;
      phone.facingMode = message.facingMode || phone.facingMode;
      phone.resolution = message.resolution || phone.resolution;
      phone.fps = message.fps || phone.fps;
      phone.lastSeen = Date.now();
      const controller = controllers.get(phone.pairCode);
      if (controller) {
        send(controller.ws, {
          type: 'phone-metadata',
          deviceId: phone.deviceId,
          label: phone.label,
          facingMode: phone.facingMode,
          resolution: phone.resolution,
          fps: phone.fps,
          connected: phone.connected,
          lastSeen: phone.lastSeen,
        });
      }
      return;
    }

    if (type === 'connect-phone' || type === 'disconnect-phone') {
      const phone = phones.get(message.target);
      if (!phone || ws.role !== 'controller' || phone.pairCode !== ws.pairCode) {
        send(ws, { type: 'error', message: 'Target phone not found' });
        return;
      }
      const payload = { type: type === 'connect-phone' ? 'connect-request' : 'disconnect', source: message.source || 'controller', target: message.target };
      send(phone.ws, payload);
      return;
    }

    if (type === 'presentation-state' && ws.role === 'presentation-controller') {
      presentationDisplays.get(ws.pairCode)?.forEach((display) => send(display, { type: 'presentation-state', state: message.state }));
      return;
    }

    if (type === 'device-command' || type === 'device-ping') {
      const phone = phones.get(message.target);
      if (!phone || ws.role !== 'controller' || phone.pairCode !== ws.pairCode) {
        send(ws, { type: 'error', message: 'Target phone not found' });
        return;
      }
      send(phone.ws, { ...message, source: ws.pairCode });
      return;
    }

    if (type === 'remove-phone') {
      const phone = phones.get(message.target);
      if (!phone || ws.role !== 'controller' || phone.pairCode !== ws.pairCode) return;
      send(phone.ws, { type: 'disconnect', reason: 'removed by controller' });
      phone.ws.close(4000, 'removed');
      return;
    }

    if (type === 'rename-device') {
      const phone = phones.get(message.target);
      if (!phone || ws.role !== 'controller' || phone.pairCode !== ws.pairCode) return;
      phone.label = message.label || phone.label;
      send(phone.ws, { type: 'device-command', command: 'rename', label: phone.label });
      broadcastControllerPhones(controllers.get(phone.pairCode));
      return;
    }

    if (type === 'device-pong' || type === 'webrtc-state' || type === 'phone-ready') {
      const phone = phones.get(message.deviceId || ws.deviceId);
      if (!phone || ws.role !== 'phone') return;
      if (type === 'webrtc-state') phone.connected = message.state === 'connected';
      phone.lastSeen = Date.now();
      const controller = controllers.get(phone.pairCode);
      send(controller?.ws, { ...message, source: phone.deviceId });
      return;
    }

    if (type === 'offer' || type === 'answer' || type === 'ice-candidate') {
      const targetId = message.target;
      if (!targetId) return;
      const targetPhone = phones.get(targetId);
      if (message.type === 'offer' && targetPhone) {
        send(targetPhone.ws, message);
        return;
      }
      if (message.type === 'offer' && controllers.has(targetId)) {
        send(controllers.get(targetId).ws, message);
        return;
      }
      if (message.type === 'answer' && controllers.has(targetId)) {
        send(controllers.get(targetId).ws, message);
        return;
      }
      if (message.type === 'answer' && targetPhone) {
        send(targetPhone.ws, message);
        return;
      }
      if (message.type === 'ice-candidate') {
        if (targetPhone) {
          send(targetPhone.ws, message);
          return;
        }
        if (controllers.has(targetId)) {
          send(controllers.get(targetId).ws, message);
          return;
        }
      }
      return;
    }

    if (type === 'ping') {
      send(ws, { type: 'pong', time: message.time || Date.now() });
      return;
    }
  });

  ws.on('close', () => {
    if (ws.role === 'presentation-controller' && presentationControllers.get(ws.pairCode) === ws) presentationControllers.delete(ws.pairCode);
    if (ws.role === 'presentation-display') {
      const displays = presentationDisplays.get(ws.pairCode);
      displays?.delete(ws);
      if (displays?.size === 0) presentationDisplays.delete(ws.pairCode);
    }
    if (ws.role === 'controller') {
      cleanupController(ws.pairCode);
    }
    if (ws.role === 'phone') {
      cleanupPhone(ws.deviceId);
    }
  });
});

heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
});

