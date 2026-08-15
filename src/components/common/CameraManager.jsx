import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toDataURL } from 'qrcode';
import { CameraView } from './CameraView';
import { X, Plus, Trash2, Camera as CameraIcon, Settings, CheckSquare, ArrowLeft } from './Icon';

const SIGNALING_PORT = 3001;
const RECONNECT_DELAY = 3000;

const makeControllerId = () => `controller-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
const formatLatency = (latency) => (latency == null ? '—' : `${Math.round(latency)} ms`);
const formatAge = (ms) => {
  if (ms == null) return '—';
  if (ms < 1000) return 'just now';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
};

export function CameraManager({ onClose }) {
  const [wsStatus, setWsStatus] = useState('connecting');
  const [pairCode, setPairCode] = useState('');
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [socketUrl, setSocketUrl] = useState(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:${SIGNALING_PORT}`);
  const [serverNote, setServerNote] = useState('Use the QR link below to open the phone camera page or enter the pairing code.');
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  const wsRef = useRef(null);
  const controllerIdRef = useRef(makeControllerId());
  const pendingReconnect = useRef(null);
  const peersRef = useRef(new Map());
  const deviceMapRef = useRef(new Map());
  const pingRef = useRef({ lastSent: null, lastRcv: null });

  const phonePageUrl = useMemo(() => `${window.location.origin}/camera.html?pairCode=${pairCode}`, [pairCode]);
  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId) || null;

  useEffect(() => {
    if (!phonePageUrl) return undefined;
    let active = true;
    toDataURL(phonePageUrl, { margin: 1, scale: 10 })
      .then((dataUrl) => {
        if (active) setQrCodeUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrCodeUrl('');
      });
    return () => {
      active = false;
    };
  }, [phonePageUrl]);

  const updateDevice = useCallback((partial) => {
    setDevices((current) => {
      const existing = current.find((device) => device.deviceId === partial.deviceId);
      const next = existing ? current.map((device) => (device.deviceId === partial.deviceId ? { ...device, ...partial } : device)) : [...current, partial];
      const sorted = next.slice().sort((a, b) => {
        if (a.status === 'connected' && b.status !== 'connected') return -1;
        if (b.status === 'connected' && a.status !== 'connected') return 1;
        return (b.lastSeen || 0) - (a.lastSeen || 0);
      });
      sorted.forEach((device) => deviceMapRef.current.set(device.deviceId, device));
      return sorted;
    });
  }, []);

  const removeDevice = useCallback((deviceId) => {
    setDevices((current) => current.filter((device) => device.deviceId !== deviceId));
    deviceMapRef.current.delete(deviceId);
    const pc = peersRef.current.get(deviceId);
    if (pc) {
      pc.close();
      peersRef.current.delete(deviceId);
    }
    if (selectedDeviceId === deviceId) setSelectedDeviceId(null);
  }, [selectedDeviceId]);

  const closePeer = useCallback((deviceId) => {
    const pc = peersRef.current.get(deviceId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      peersRef.current.delete(deviceId);
    }
    updateDevice({ deviceId, status: 'disconnected', connectionState: 'closed', previewStream: null });
  }, [updateDevice]);

  const sendWs = useCallback((message) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, []);

  const registerController = useCallback(() => {
    sendWs({ type: 'register', role: 'controller', controllerId: controllerIdRef.current, label: 'Sola Worship Camera Server' });
  }, [sendWs]);

  const cleanupConnection = useCallback(() => {
    if (pendingReconnect.current) {
      window.clearTimeout(pendingReconnect.current);
      pendingReconnect.current = null;
    }
    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;
    }
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (pendingReconnect.current) return;
    pendingReconnect.current = window.setTimeout(() => {
      pendingReconnect.current = null;
      connect();
    }, RECONNECT_DELAY);
  }, []);

  const createPeerConnection = useCallback((deviceId) => {
    const pc = new RTCPeerConnection();

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWs({ type: 'ice-candidate', target: deviceId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      updateDevice({ deviceId, previewStream: stream, status: 'connected', connectionState: pc.connectionState });
    };

    pc.onconnectionstatechange = () => {
      updateDevice({ deviceId, connectionState: pc.connectionState, status: pc.connectionState === 'connected' ? 'connected' : pc.connectionState });
    };

    pc.oniceconnectionstatechange = () => {
      updateDevice({ deviceId, connectionState: pc.iceConnectionState, status: pc.iceConnectionState === 'connected' ? 'connected' : pc.iceConnectionState });
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        setTimeout(() => {
          if (pc.iceConnectionState !== 'connected') {
            closePeer(deviceId);
          }
        }, 3000);
      }
    };

    peersRef.current.set(deviceId, pc);
    return pc;
  }, [closePeer, sendWs, updateDevice]);

  const handleIncomingOffer = useCallback(async (message) => {
    const { source, sdp } = message;
    if (!source || !sdp) return;
    const pc = peersRef.current.get(source) || createPeerConnection(source);
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendWs({ type: 'answer', target: source, sdp: answer.sdp });
      updateDevice({ deviceId: source, status: 'connected', connectionState: pc.connectionState });
    } catch (error) {
      console.error('Camera manager offer handling failed', error);
      updateDevice({ deviceId: source, status: 'error', meta: 'answer failed' });
    }
  }, [createPeerConnection, sendWs, updateDevice]);

  const handleIncomingIce = useCallback((message) => {
    const { source, candidate } = message;
    if (!source || !candidate) return;
    const pc = peersRef.current.get(source);
    if (!pc) return;
    pc.addIceCandidate(candidate).catch(() => null);
  }, []);

  const connect = useCallback(() => {
    cleanupConnection();
    setWsStatus('connecting');
    setServerNote('Connecting to signaling server...');
    const ws = new WebSocket(socketUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      setServerNote('Connected. Your pairing code is ready.');
      registerController();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'registered':
            if (message.pairCode) setPairCode(message.pairCode);
            if (Array.isArray(message.devices)) {
              message.devices.forEach((device) => updateDevice({ ...device, status: 'available' }));
            }
            break;
          case 'phone-connected':
            updateDevice({
              deviceId: message.device.deviceId,
              label: message.device.label || 'Phone Camera',
              customLabel: message.device.customLabel || '',
              status: 'available',
              connectionState: 'disconnected',
              latencyMs: null,
              lastSeen: Date.now(),
              facingMode: message.device.facingMode || 'unknown',
              resolution: message.device.resolution || 'auto',
              fps: message.device.fps || 'auto',
            });
            break;
          case 'phone-disconnected':
            removeDevice(message.deviceId);
            break;
          case 'phone-metadata':
            updateDevice({
              deviceId: message.deviceId,
              label: message.label || deviceMapRef.current.get(message.deviceId)?.label,
              status: message.connected ? 'connected' : 'available',
              connectionState: message.connected ? 'connected' : 'disconnected',
              latencyMs: message.latencyMs || null,
              lastSeen: Date.now(),
              facingMode: message.facingMode || deviceMapRef.current.get(message.deviceId)?.facingMode,
              resolution: message.resolution || deviceMapRef.current.get(message.deviceId)?.resolution,
              fps: message.fps || deviceMapRef.current.get(message.deviceId)?.fps,
            });
            break;
          case 'offer':
            handleIncomingOffer(message);
            break;
          case 'ice-candidate':
            handleIncomingIce(message);
            break;
          case 'pong':
            if (pingRef.current.lastSent) {
              const latency = Date.now() - pingRef.current.lastSent;
              pingRef.current.lastRcv = Date.now();
              updateDevice({ deviceId: selectedDeviceId || '', latencyMs: latency });
            }
            break;
          case 'error':
            setServerNote(`Signaling error: ${message.message || 'unknown'}`);
            break;
          default:
            break;
        }
      } catch (error) {
        console.warn('Invalid camera manager message', error);
      }
    };

    ws.onerror = () => {
      setWsStatus('error');
      setServerNote('Signaling server cannot be reached. Check your network and run the camera signaling server.');
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
      setServerNote('Disconnected from signaling server. Reconnecting...');
      scheduleReconnect();
      setDevices((current) => current.map((device) => ({ ...device, status: 'offline' })));
    };
  }, [cleanupConnection, handleIncomingIce, handleIncomingOffer, registerController, scheduleReconnect, sendWs, socketUrl, updateDevice]);

  useEffect(() => {
    connect();
    return cleanupConnection;
  }, [connect, cleanupConnection]);

  const sendPing = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      pingRef.current.lastSent = Date.now();
      sendWs({ type: 'ping', time: Date.now() });
    }
  }, [sendWs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        sendPing();
      }
    }, 10000);
    return () => window.clearInterval(interval);
  }, [sendPing]);

  const handleConnectDevice = (deviceId) => {
    updateDevice({ deviceId, status: 'requested', connectionState: 'connecting' });
    sendWs({ type: 'connect-phone', target: deviceId });
    setSelectedDeviceId(deviceId);
  };

  const handleDisconnectDevice = (deviceId) => {
    sendWs({ type: 'disconnect-phone', target: deviceId });
    closePeer(deviceId);
    updateDevice({ deviceId, status: 'offline', connectionState: 'closed' });
  };

  const handleRenameDevice = (deviceId, customLabel) => {
    updateDevice({ deviceId, customLabel });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(phonePageUrl);
      setServerNote('Mobile link copied to clipboard.');
    } catch {
      setServerNote('Copy failed — use the link text manually.');
    }
  };

  const currentStatus = selectedDevice ? selectedDevice.status : 'No device selected';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '18px' }}>
      <div style={{ width: '100%', maxWidth: '1160px', maxHeight: '96vh', overflowY: 'auto', background: '#121212', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', color: 'white', padding: '18px', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '6px' }}>Camera Manager</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Manage phone cameras over the local network.</div>
            </div>
            <button onClick={onClose} style={{ width: '34px', height: '34px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.04)', color: 'white', cursor: 'pointer' }}><X size={16} /></button>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Signaling server</div>
                <div style={{ fontSize: '13px', fontWeight: '600' }}>{socketUrl}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: wsStatus === 'connected' ? '#4ade80' : wsStatus === 'connecting' ? '#facc15' : '#f87171' }}>{wsStatus.toUpperCase()}</span>
                <button onClick={connect} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.16)', background: '#1f1f1f', color: 'white', cursor: 'pointer', fontSize: '11px' }}>Reconnect</button>
              </div>
            </div>
            <div style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '14px', display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Pairing code</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', letterSpacing: '0.25em' }}>{pairCode || '—'}</div>
                </div>
                <button onClick={copyLink} style={{ padding: '9px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.16)', background: '#d4a574', color: '#1a1a1a', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}>Copy mobile URL</button>
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>{serverNote}</div>
              <textarea readOnly value={phonePageUrl} style={{ width: '100%', minHeight: '66px', resize: 'none', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: '#0f0f0f', color: 'white', fontSize: '12px' }} />
              {qrCodeUrl && <img alt="Scan to pair" src={qrCodeUrl} style={{ width: '180px', height: '180px', marginTop: '12px', borderRadius: '18px', background: 'white' }} />}
            </div>
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Found phones</div>
                <div style={{ fontSize: '13px', fontWeight: '600' }}>{devices.length} device{devices.length === 1 ? '' : 's'}</div>
              </div>
              <button onClick={() => setDevices([])} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.16)', background: '#1f1f1f', color: 'white', cursor: 'pointer', fontSize: '11px' }}>Clear list</button>
            </div>
            <div style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', display: 'grid', gap: '8px', padding: '10px', maxHeight: '320px', overflowY: 'auto' }}>
              {devices.length === 0 && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Waiting for phone cameras to register with the pairing code...</div>}
              {devices.map((device) => (
                <div key={device.deviceId} style={{ display: 'grid', gap: '8px', padding: '10px', borderRadius: '12px', background: selectedDeviceId === device.deviceId ? 'rgba(212,165,116,0.08)' : 'rgba(255,255,255,0.02)', border: selectedDeviceId === device.deviceId ? '1px solid rgba(212,165,116,0.18)' : '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '700' }}>{device.customLabel || device.label || 'Phone Camera'}</div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>ID: {device.deviceId.slice(0, 8)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setSelectedDeviceId(device.deviceId)} style={{ padding: '5px 9px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: selectedDeviceId === device.deviceId ? '#d4a574' : '#1f1f1f', color: selectedDeviceId === device.deviceId ? '#1a1a1a' : 'white', cursor: 'pointer', fontSize: '11px' }}>Select</button>
                      <button onClick={() => handleDisconnectDevice(device.deviceId)} style={{ padding: '5px 9px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#1f1f1f', color: 'white', cursor: 'pointer', fontSize: '11px' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button onClick={() => handleConnectDevice(device.deviceId)} disabled={device.status === 'connected' || device.status === 'requested'} style={{ flex: '1', minWidth: '104px', padding: '8px 10px', borderRadius: '10px', border: 'none', background: device.status === 'connected' ? '#4ade80' : '#d4a574', color: '#1a1a1a', fontWeight: '700', cursor: device.status === 'connected' ? 'default' : 'pointer', fontSize: '11px' }}>{device.status === 'connected' ? 'Connected' : device.status === 'requested' ? 'Connecting…' : 'Connect'}</button>
                    <button onClick={() => updateDevice({ deviceId: device.deviceId, customLabel: prompt('Enter a custom camera name:', device.customLabel || device.label || 'Phone Camera') || device.customLabel })} style={{ flex: '1', minWidth: '104px', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: '#1f1f1f', color: 'white', cursor: 'pointer', fontSize: '11px' }}>Rename</button>
                  </div>
                  <div style={{ display: 'grid', gap: '6px', fontSize: '10px', color: 'rgba(255,255,255,0.65)' }}>
                    <div><span style={{ color: '#fff' }}>State:</span> {device.connectionState || 'offline'}</div>
                    <div><span style={{ color: '#fff' }}>Facing:</span> {device.facingMode || 'unknown'}</div>
                    <div><span style={{ color: '#fff' }}>Resolution:</span> {device.resolution || 'auto'} · {device.fps || 'auto'} FPS</div>
                    <div><span style={{ color: '#fff' }}>Latency:</span> {formatLatency(device.latencyMs)}</div>
                    <div><span style={{ color: '#fff' }}>Last seen:</span> {formatAge(Date.now() - (device.lastSeen || Date.now()))}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Selected device</div>
              <div style={{ fontSize: '16px', fontWeight: '700' }}>{selectedDevice?.customLabel || selectedDevice?.label || 'No device selected'}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={copyLink} style={{ padding: '8px 11px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.16)', background: '#1f1f1f', color: 'white', cursor: 'pointer', fontSize: '11px' }}>Copy link</button>
              <button onClick={() => handleDisconnectDevice(selectedDevice?.deviceId)} disabled={!selectedDevice} style={{ padding: '8px 11px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.16)', background: '#1f1f1f', color: 'white', cursor: selectedDevice ? 'pointer' : 'not-allowed', fontSize: '11px' }}>Disconnect</button>
            </div>
          </div>
          <div style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '18px', overflow: 'hidden', minHeight: '320px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Preview</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                <CameraIcon size={14} /> {currentStatus}
              </div>
            </div>
            <div style={{ flex: 1, position: 'relative', background: '#000', minHeight: '260px' }}>
              {selectedDevice ? <CameraView stream={selectedDevice.previewStream} /> : <div style={{ color: 'rgba(255,255,255,0.4)', padding: '18px', fontSize: '12px' }}>Select a connected phone to preview its camera stream here.</div>}
            </div>
          </div>
          <div style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '14px', display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Stream controls</div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <button onClick={() => handleConnectDevice(selectedDevice?.deviceId)} disabled={!selectedDevice || selectedDevice.status === 'connected' || selectedDevice.status === 'requested'} style={{ padding: '10px', borderRadius: '12px', border: 'none', background: '#d4a574', color: '#1a1a1a', fontWeight: '700', cursor: selectedDevice ? 'pointer' : 'not-allowed', fontSize: '12px' }}>Prepare selected camera</button>
              <button onClick={() => handleDisconnectDevice(selectedDevice?.deviceId)} disabled={!selectedDevice} style={{ padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.16)', background: '#1f1f1f', color: 'white', cursor: selectedDevice ? 'pointer' : 'not-allowed', fontSize: '12px' }}>Disconnect selected camera</button>
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)' }}>Every connected phone creates a dedicated WebRTC stream. Use the preview to choose which device feeds your scenes.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
