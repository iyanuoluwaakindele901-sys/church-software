const SIGNALING_PORT = 3001;

export function defaultSignalingUrl() {
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:${SIGNALING_PORT}`;
}

export function makeControllerId() {
  return `controller-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
}

export function pingMessage() {
  return { type: 'ping', time: Date.now() };
}

export function registerMessage(controllerId) {
  return { type: 'register', role: 'controller', controllerId, label: 'Sola Worship Camera Server' };
}
