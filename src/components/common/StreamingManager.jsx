import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera as CameraIcon, X } from './Icon';

const PROVIDERS = {
  youtube: { label: 'YouTube', server: 'rtmps://a.rtmps.youtube.com/live2' },
  facebook: { label: 'Facebook', server: 'rtmps://live-api-s.facebook.com:443/rtmp/' },
  custom: { label: 'Custom RTMP', server: '' },
};

const initialStatus = { connected: false, streaming: false, virtualCamera: false, durationMs: 0, bytes: 0, skippedFrames: 0, totalFrames: 0 };
const fieldStyle = { width: '100%', boxSizing: 'border-box', padding: '8px', borderRadius: '5px', border: '1px solid rgba(255,255,255,.18)', background: '#101010', color: 'white', fontSize: '11px' };
const buttonStyle = { padding: '9px', borderRadius: '5px', border: '1px solid rgba(255,255,255,.18)', background: '#292929', color: 'white', fontSize: '11px', fontWeight: '700', cursor: 'pointer' };

export function StreamingManager({ onClose }) {
  const bridge = window.solaDesktop?.obs;
  const [settings, setSettings] = useState({ host: '127.0.0.1', port: 4455, password: '', provider: 'youtube', server: PROVIDERS.youtube.server, key: '' });
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(bridge ? 'Connect OBS to begin.' : 'Streaming controls require the Electron desktop app.');

  useEffect(() => {
    if (!bridge?.loadSettings) return undefined;
    let active = true;
    bridge.loadSettings().then((saved) => {
      if (active && saved) setSettings((current) => ({ ...current, ...saved }));
    }).catch(() => {});
    return () => { active = false; };
  }, [bridge]);

  const refreshStatus = useCallback(async () => {
    if (!bridge || !status.connected) return;
    try {
      const next = await bridge.status();
      setStatus(next);
      setMessage(next.streaming ? 'Live stream is active.' : 'OBS connected and ready.');
    } catch (error) {
      setStatus(initialStatus);
      setMessage(error.message);
    }
  }, [bridge, status.connected]);

  useEffect(() => {
    if (!status.connected) return undefined;
    const timer = window.setInterval(refreshStatus, 2000);
    return () => window.clearInterval(timer);
  }, [refreshStatus, status.connected]);

  const update = (field, value) => setSettings((current) => ({ ...current, [field]: value }));
  const chooseProvider = (provider) => setSettings((current) => ({ ...current, provider, server: PROVIDERS[provider].server || current.server }));
  const run = async (label, operation) => {
    setBusy(label);
    try { await operation(); } catch (error) { setMessage(error.message); }
    finally { setBusy(''); }
  };
  const connect = () => run('connect', async () => {
    await bridge.saveSettings(settings);
    await bridge.connect(settings);
    if (settings.server && settings.key) await bridge.configureStream(settings);
    setStatus((current) => ({ ...current, connected: true }));
    setMessage(settings.key ? 'OBS connected and RTMP configured.' : 'OBS connected. Enter a stream key before going live.');
  });
  const toggleStream = () => run('stream', async () => {
    if (status.streaming) await bridge.stopStream();
    else {
      await bridge.configureStream(settings);
      await bridge.saveSettings(settings);
      await bridge.startStream();
    }
    const next = await bridge.status();
    setStatus(next);
  });
  const toggleVirtualCamera = () => run('camera', async () => {
    if (status.virtualCamera) await bridge.stopVirtualCamera();
    else await bridge.startVirtualCamera();
    setStatus(await bridge.status());
  });
  const averageMbps = useMemo(() => status.durationMs > 0 ? ((status.bytes * 8) / status.durationMs / 1000).toFixed(2) : '0.00', [status.bytes, status.durationMs]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 350, background: 'rgba(0,0,0,.82)', display: 'grid', placeItems: 'center', padding: '16px' }}>
      <div style={{ width: 'min(680px, 96vw)', maxHeight: '94vh', overflowY: 'auto', background: '#181818', color: 'white', border: '1px solid rgba(255,255,255,.16)', borderRadius: '10px', padding: '16px', boxShadow: '0 20px 70px rgba(0,0,0,.6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div><div style={{ fontWeight: 800 }}>Live Streaming & Virtual Camera</div><div style={{ color: 'rgba(255,255,255,.5)', fontSize: '10px', marginTop: '3px' }}>Powered by OBS Studio WebSocket 5.x</div></div>
          <button onClick={onClose} style={{ ...buttonStyle, padding: '6px' }}><X size={15} /></button>
        </div>
        {!bridge && <div style={{ padding: '12px', background: 'rgba(248,113,113,.1)', border: '1px solid #f87171', borderRadius: '6px', color: '#fecaca', fontSize: '11px' }}>Open Sola Worship through Electron to use streaming. Browser preview mode cannot control OBS.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '8px', marginTop: '12px' }}>
          <label style={{ fontSize: '10px' }}>OBS computer<input value={settings.host} onChange={(event) => update('host', event.target.value)} style={fieldStyle} /></label>
          <label style={{ fontSize: '10px' }}>Port<input type="number" value={settings.port} onChange={(event) => update('port', Number(event.target.value))} style={fieldStyle} /></label>
        </div>
        <label style={{ display: 'block', fontSize: '10px', marginTop: '8px' }}>OBS WebSocket password<input type="password" value={settings.password} onChange={(event) => update('password', event.target.value)} style={fieldStyle} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px', marginTop: '8px' }}>
          <label style={{ fontSize: '10px' }}>Provider<select value={settings.provider} onChange={(event) => chooseProvider(event.target.value)} style={fieldStyle}>{Object.entries(PROVIDERS).map(([id, provider]) => <option key={id} value={id}>{provider.label}</option>)}</select></label>
          <label style={{ fontSize: '10px' }}>RTMP server<input value={settings.server} onChange={(event) => update('server', event.target.value)} style={fieldStyle} /></label>
        </div>
        <label style={{ display: 'block', fontSize: '10px', marginTop: '8px' }}>Stream key<input type="password" value={settings.key} onChange={(event) => update('key', event.target.value)} style={fieldStyle} /></label>
        <div style={{ color: 'rgba(255,255,255,.45)', fontSize: '9px', marginTop: '5px' }}>Passwords and stream keys are encrypted by Windows before being saved.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '7px', marginTop: '14px' }}>
          <button disabled={!bridge || busy} onClick={connect} style={{ ...buttonStyle, background: status.connected ? 'rgba(74,222,128,.16)' : '#292929', borderColor: status.connected ? '#4ade80' : 'rgba(255,255,255,.18)', color: status.connected ? '#86efac' : 'white' }}>{busy === 'connect' ? 'Connecting…' : status.connected ? 'Reconnect OBS' : 'Connect OBS'}</button>
          <button disabled={!status.connected || busy} onClick={toggleStream} style={{ ...buttonStyle, background: status.streaming ? '#991b1b' : '#2563eb', opacity: status.connected ? 1 : .45 }}>{busy === 'stream' ? 'Please wait…' : status.streaming ? 'STOP STREAM' : 'GO LIVE'}</button>
          <button disabled={!status.connected || busy} onClick={toggleVirtualCamera} style={{ ...buttonStyle, background: status.virtualCamera ? '#166534' : '#292929', opacity: status.connected ? 1 : .45, display: 'flex', gap: '5px', alignItems: 'center', justifyContent: 'center' }}><CameraIcon size={13} /> {status.virtualCamera ? 'Stop Virtual Cam' : 'Start Virtual Cam'}</button>
        </div>
        <div style={{ marginTop: '12px', padding: '10px', borderRadius: '6px', background: '#101010', border: '1px solid rgba(255,255,255,.1)', fontSize: '10px' }}>
          <div style={{ color: status.streaming ? '#4ade80' : status.connected ? '#d4a574' : '#f87171', marginBottom: '7px', fontWeight: 700 }}>{message}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', color: 'rgba(255,255,255,.55)' }}><span>Bitrate {averageMbps} Mbps</span><span>Frames {status.totalFrames}</span><span>Dropped {status.skippedFrames}</span><span>Time {Math.floor(status.durationMs / 60000)}m {Math.floor(status.durationMs / 1000) % 60}s</span></div>
        </div>
        <div style={{ marginTop: '12px', color: 'rgba(255,255,255,.55)', fontSize: '10px', lineHeight: 1.5 }}>In OBS: open Tools → WebSocket Server Settings, enable the server, and use port 4455. Add Sola Worship’s projector window as a Window Capture source, then connect here.</div>
      </div>
    </div>
  );
}
