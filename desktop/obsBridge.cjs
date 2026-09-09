const crypto = require('node:crypto');
const WebSocket = require('ws');

const encodeSha256 = (value) => crypto.createHash('sha256').update(value).digest('base64');

function makeAuthentication(password, salt, challenge) {
  const secret = encodeSha256(`${password}${salt}`);
  return encodeSha256(`${secret}${challenge}`);
}

class ObsBridge {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.pending = new Map();
  }

  disconnect() {
    this.connected = false;
    for (const pending of this.pending.values()) pending.reject(new Error('OBS connection closed.'));
    this.pending.clear();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }
  }

  connect({ host = '127.0.0.1', port = 4455, password = '' } = {}) {
    this.disconnect();
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://${host}:${Number(port) || 4455}`);
      this.socket = socket;
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.disconnect();
        reject(new Error('OBS connection timed out. Ensure OBS WebSocket is enabled.'));
      }, 8000);

      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      socket.on('error', (error) => fail(new Error(`Could not connect to OBS: ${error.message}`)));
      socket.on('close', () => {
        this.connected = false;
        fail(new Error('OBS closed the connection. Check the WebSocket password.'));
      });
      socket.on('message', (raw) => {
        let message;
        try { message = JSON.parse(raw.toString()); } catch { return; }
        if (message.op === 0) {
          const identify = { rpcVersion: 1, eventSubscriptions: 0 };
          if (message.d?.authentication) {
            identify.authentication = makeAuthentication(password, message.d.authentication.salt, message.d.authentication.challenge);
          }
          socket.send(JSON.stringify({ op: 1, d: identify }));
          return;
        }
        if (message.op === 2) {
          this.connected = true;
          settled = true;
          clearTimeout(timeout);
          resolve({ connected: true, rpcVersion: message.d?.negotiatedRpcVersion || 1 });
          return;
        }
        if (message.op === 7) {
          const pending = this.pending.get(message.d?.requestId);
          if (!pending) return;
          this.pending.delete(message.d.requestId);
          clearTimeout(pending.timeout);
          if (message.d.requestStatus?.result) pending.resolve(message.d.responseData || {});
          else pending.reject(new Error(message.d.requestStatus?.comment || `OBS request failed (${message.d.requestStatus?.code || 'unknown'}).`));
        }
      });
    });
  }

  request(requestType, requestData = {}) {
    if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Connect to OBS first.'));
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`OBS did not answer ${requestType}.`));
      }, 8000);
      this.pending.set(requestId, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });
  }

  async status() {
    const [stream, virtualCamera] = await Promise.all([
      this.request('GetStreamStatus'),
      this.request('GetVirtualCamStatus'),
    ]);
    return {
      connected: true,
      streaming: Boolean(stream.outputActive),
      reconnecting: Boolean(stream.outputReconnecting),
      durationMs: Number(stream.outputDuration || 0),
      bytes: Number(stream.outputBytes || 0),
      skippedFrames: Number(stream.outputSkippedFrames || 0),
      totalFrames: Number(stream.outputTotalFrames || 0),
      virtualCamera: Boolean(virtualCamera.outputActive),
    };
  }

  async configureStream({ server, key }) {
    if (!server || !key) throw new Error('RTMP server and stream key are required.');
    await this.request('SetStreamServiceSettings', {
      streamServiceType: 'rtmp_custom',
      streamServiceSettings: { server, key, use_auth: false },
    });
    return { configured: true };
  }

  startStream() { return this.request('StartStream'); }
  stopStream() { return this.request('StopStream'); }
  startVirtualCamera() { return this.request('StartVirtualCam'); }
  stopVirtualCamera() { return this.request('StopVirtualCam'); }
}

module.exports = { ObsBridge, makeAuthentication };
