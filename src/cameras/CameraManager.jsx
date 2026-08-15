import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toDataURL } from 'qrcode';
import { CameraView } from '../components/common/CameraView';
import { X, Trash2 } from '../components/common/Icon';

const SIGNALING_PORT = 3001;
const RECONNECT_DELAY = 3000;

const makeControllerId = () => {
	const saved = window.sessionStorage.getItem('sola-camera-controller-id');
	if (saved) return saved;
	const id = `controller-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
	window.sessionStorage.setItem('sola-camera-controller-id', id);
	return id;
};
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

export function CameraManager({ open = true, onClose, onUseCamera }) {
	const [wsStatus, setWsStatus] = useState('connecting');
	const [pairCode, setPairCode] = useState(() => window.sessionStorage.getItem('sola-camera-pair-code') || '');
	const [devices, setDevices] = useState([]);
	const [selectedDeviceId, setSelectedDeviceId] = useState(null);
	const [socketUrl] = useState(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:${SIGNALING_PORT}`);
	const [serverNote, setServerNote] = useState('Use the QR link below to open the phone camera page or enter the pairing code.');
	const [qrCodeUrl, setQrCodeUrl] = useState('');
	const [trustQrCodeUrl, setTrustQrCodeUrl] = useState('');
	const [now, setNow] = useState(0);
	const [lanHost, setLanHost] = useState(window.location.hostname);

	const wsRef = useRef(null);
	const controllerIdRef = useRef(makeControllerId());
	const pendingReconnect = useRef(null);
	const peersRef = useRef(new Map());
	const deviceMapRef = useRef(new Map());
	const pendingIceRef = useRef(new Map());
	const pingRef = useRef({ lastSent: null, lastRcv: null });
	const connectRef = useRef(null);
	const mountedRef = useRef(true);
	const desiredConnectionsRef = useRef(new Set());

	const phonePageUrl = useMemo(() => {
		const port = window.location.port ? `:${window.location.port}` : '';
		const origin = `${window.location.protocol}//${lanHost}${port}`;
		const signal = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${lanHost}:${SIGNALING_PORT}`;
		return `${origin}/camera.html?pairCode=${encodeURIComponent(pairCode)}&server=${encodeURIComponent(signal)}`;
	}, [lanHost, pairCode]);
	const trustSetupUrl = useMemo(() => `http://${lanHost}:5174/`, [lanHost]);
	const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId) || null;

	useEffect(() => {
		fetch('/__sola/network-info').then((response) => response.json()).then((data) => {
			if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && data.addresses?.[0]) setLanHost(data.addresses[0]);
		}).catch(() => null);
	}, []);

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

	useEffect(() => {
		if (window.location.protocol !== 'https:') return undefined;
		let active = true;
		toDataURL(trustSetupUrl, { margin: 1, scale: 8 })
			.then((dataUrl) => {
				if (active) setTrustQrCodeUrl(dataUrl);
			})
			.catch(() => {
				if (active) setTrustQrCodeUrl('');
			});
		return () => {
			active = false;
		};
	}, [trustSetupUrl]);

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
		setSelectedDeviceId((current) => current === deviceId ? null : current);
	}, []);

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
		sendWs({ type: 'register', role: 'controller', controllerId: controllerIdRef.current, pairCode, label: 'Sola Worship Camera Server' });
	}, [pairCode, sendWs]);

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
			if (mountedRef.current) connectRef.current?.();
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
			if ((pc.connectionState === 'failed' || pc.connectionState === 'disconnected') && desiredConnectionsRef.current.has(deviceId)) {
				window.setTimeout(() => sendWs({ type: 'connect-phone', target: deviceId }), 3000);
			}
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
		const existing = peersRef.current.get(source);
		if (existing) {
			existing.close();
			peersRef.current.delete(source);
		}
		const pc = createPeerConnection(source);
		try {
			await pc.setRemoteDescription({ type: 'offer', sdp });
			const queued = pendingIceRef.current.get(source) || [];
			for (const candidate of queued) await pc.addIceCandidate(candidate);
			pendingIceRef.current.delete(source);
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
		if (!pc?.remoteDescription) {
			pendingIceRef.current.set(source, [...(pendingIceRef.current.get(source) || []), candidate]);
			return;
		}
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
						if (message.pairCode) {
							setPairCode(message.pairCode);
							window.sessionStorage.setItem('sola-camera-pair-code', message.pairCode);
						}
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
						updateDevice({ deviceId: message.deviceId, status: 'offline', connectionState: 'disconnected', previewStream: null, lastSeen: Date.now() });
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
							setDevices((current) => current.map((device) => device.status === 'connected' ? { ...device, latencyMs: latency } : device));
						}
						break;
					case 'device-pong':
						updateDevice({ deviceId: message.source, latencyMs: Math.max(0, Date.now() - message.time), lastSeen: Date.now() });
						break;
					case 'webrtc-state':
						updateDevice({ deviceId: message.source, connectionState: message.state, status: message.state === 'connected' ? 'connected' : message.state, lastSeen: Date.now() });
						break;
					case 'phone-ready':
						if (desiredConnectionsRef.current.has(message.source)) sendWs({ type: 'connect-phone', target: message.source });
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
			setServerNote('Phone camera signaling is offline. Run "npm run camera-server" in the app folder, then reconnect.');
		};

		ws.onclose = () => {
			setWsStatus('disconnected');
			setServerNote('Disconnected from signaling server. Reconnecting...');
			scheduleReconnect();
			setDevices((current) => current.map((device) => ({ ...device, status: 'offline' })));
		};
	}, [cleanupConnection, handleIncomingIce, handleIncomingOffer, registerController, scheduleReconnect, sendWs, socketUrl, updateDevice]);
	useEffect(() => {
		connectRef.current = connect;
	}, [connect]);

	useEffect(() => {
		mountedRef.current = true;
		const startup = window.setTimeout(connect, 0);
		return () => {
			window.clearTimeout(startup);
			mountedRef.current = false;
			cleanupConnection();
		};
	}, [connect, cleanupConnection]);

	useEffect(() => {
		const updateClock = () => setNow(Date.now());
		const startup = window.setTimeout(updateClock, 0);
		const timer = window.setInterval(updateClock, 5000);
		return () => { window.clearTimeout(startup); window.clearInterval(timer); };
	}, []);

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
		desiredConnectionsRef.current.add(deviceId);
		updateDevice({ deviceId, status: 'requested', connectionState: 'connecting' });
		sendWs({ type: 'connect-phone', target: deviceId });
		setSelectedDeviceId(deviceId);
	};

	const handleDisconnectDevice = (deviceId) => {
		desiredConnectionsRef.current.delete(deviceId);
		sendWs({ type: 'disconnect-phone', target: deviceId });
		closePeer(deviceId);
		updateDevice({ deviceId, status: 'offline', connectionState: 'closed' });
	};

	const handleRemoveDevice = (deviceId) => {
		desiredConnectionsRef.current.delete(deviceId);
		sendWs({ type: 'remove-phone', target: deviceId });
		removeDevice(deviceId);
	};

	const renameDevice = (device) => {
		const label = window.prompt('Enter a custom camera name:', device.customLabel || device.label || 'Phone Camera');
		if (!label?.trim()) return;
		updateDevice({ deviceId: device.deviceId, customLabel: label.trim(), label: label.trim() });
		sendWs({ type: 'rename-device', target: device.deviceId, label: label.trim() });
	};

	const configureDevice = (deviceId, updates) => {
		updateDevice({ deviceId, ...updates, status: 'configuring' });
		sendWs({ type: 'device-command', target: deviceId, command: 'settings', ...updates });
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
		<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: open ? 'flex' : 'none', justifyContent: 'center', alignItems: 'center', padding: '18px' }}>
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
							{window.location.protocol !== 'https:' && lanHost !== 'localhost' && lanHost !== '127.0.0.1' && <div style={{ fontSize: '10px', color: '#facc15', lineHeight: 1.4 }}>Mobile browsers normally require HTTPS for camera permission. The network and WebRTC path is real, but this phone link must be served with a trusted HTTPS certificate for camera access on most devices.</div>}
							{window.location.protocol === 'https:' && trustQrCodeUrl && <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px', border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.06)', borderRadius: '8px' }}><img alt="Scan once to trust this computer" src={trustQrCodeUrl} style={{ width: '104px', height: '104px', background: 'white' }} /><div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.5 }}><strong style={{ color: '#4ade80' }}>First-time phone setup</strong><br />Scan this smaller QR and install the public trust certificate. Then scan the camera pairing QR below.<br /><span style={{ color: '#d4a574' }}>{trustSetupUrl}</span></div></div>}
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
											<button onClick={() => handleRemoveDevice(device.deviceId)} title="Remove phone" style={{ padding: '5px 9px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#1f1f1f', color: 'white', cursor: 'pointer', fontSize: '11px' }}><Trash2 size={14} /></button>
										</div>
									</div>
									<div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
										<button onClick={() => handleConnectDevice(device.deviceId)} disabled={device.status === 'connected' || device.status === 'requested'} style={{ flex: '1', minWidth: '104px', padding: '8px 10px', borderRadius: '10px', border: 'none', background: device.status === 'connected' ? '#4ade80' : '#d4a574', color: '#1a1a1a', fontWeight: '700', cursor: device.status === 'connected' ? 'default' : 'pointer', fontSize: '11px' }}>{device.status === 'connected' ? 'Connected' : device.status === 'requested' ? 'Connecting…' : 'Connect'}</button>
										<button onClick={() => renameDevice(device)} style={{ flex: '1', minWidth: '104px', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#1f1f1f', color: 'white', cursor: 'pointer', fontSize: '11px' }}>Rename</button>
									</div>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
										<select aria-label={`Facing mode for ${device.label}`} value={device.facingMode === 'user' ? 'user' : 'environment'} onChange={(event) => configureDevice(device.deviceId, { facingMode: event.target.value })} style={{ padding: '7px', background: '#111', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '6px', color: 'white', fontSize: '10px' }}><option value="environment">Rear camera</option><option value="user">Front camera</option></select>
										<select aria-label={`Resolution for ${device.label}`} value={String(device.resolution || 'auto').includes('@') ? device.resolution : 'auto'} onChange={(event) => configureDevice(device.deviceId, { resolution: event.target.value })} style={{ padding: '7px', background: '#111', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '6px', color: 'white', fontSize: '10px' }}><option value="auto">Auto</option><option value="640x480@30">480p 30</option><option value="1280x720@30">720p 30</option><option value="1920x1080@30">1080p 30</option><option value="1280x720@60">720p 60</option></select>
									</div>
									<div style={{ display: 'grid', gap: '6px', fontSize: '10px', color: 'rgba(255,255,255,0.65)' }}>
										<div><span style={{ color: '#fff' }}>State:</span> {device.connectionState || 'offline'}</div>
										<div><span style={{ color: '#fff' }}>Facing:</span> {device.facingMode || 'unknown'}</div>
										<div><span style={{ color: '#fff' }}>Resolution:</span> {device.resolution || 'auto'} · {device.fps || 'auto'} FPS</div>
										<div><span style={{ color: '#fff' }}>Latency:</span> {formatLatency(device.latencyMs)}</div>
										<div><span style={{ color: '#fff' }}>Last seen:</span> {formatAge(now && device.lastSeen ? now - device.lastSeen : null)}</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
						<div style={{ fontSize: '12px', fontWeight: '700' }}>{selectedDevice?.customLabel || selectedDevice?.label || 'Device Preview'}</div>
						<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
							<div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Status: {currentStatus}</div>
							<button onClick={() => selectedDevice && handleDisconnectDevice(selectedDevice.deviceId)} disabled={!selectedDevice} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#1f1f1f', color: 'white', cursor: 'pointer', fontSize: '11px' }}>Disconnect</button>
						</div>
					</div>
					<div style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '12px', minHeight: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						{selectedDevice && selectedDevice.previewStream ? <CameraView stream={selectedDevice.previewStream} /> : <div style={{ color: 'rgba(255,255,255,0.35)' }}>No preview available</div>}
					</div>
					<div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
						<div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Latency: {formatLatency(selectedDevice?.latencyMs)}</div>
						<div style={{ display: 'flex', gap: '8px' }}>
							{onUseCamera && <button onClick={() => selectedDevice?.previewStream && onUseCamera(selectedDevice)} disabled={!selectedDevice?.previewStream} style={{ padding: '6px 10px', borderRadius: '8px', border: 'none', background: '#d4a574', color: '#151515', cursor: selectedDevice?.previewStream ? 'pointer' : 'not-allowed', fontSize: '11px', fontWeight: '700' }}>Use in Scene</button>}
							<button onClick={() => selectedDevice && sendWs({ type: 'device-ping', target: selectedDevice.deviceId, time: Date.now() })} disabled={!selectedDevice} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#1f1f1f', color: 'white', cursor: 'pointer', fontSize: '11px' }}>Ping phone</button>
							<button onClick={() => setSelectedDeviceId(null)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#1f1f1f', color: 'white', cursor: 'pointer', fontSize: '11px' }}>Clear Selection</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
