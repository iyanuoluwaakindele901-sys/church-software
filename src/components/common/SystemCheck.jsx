import { useCallback, useEffect, useState } from 'react';
import { X } from './Icon';

const badgeColor = { pass: '#4ade80', warn: '#facc15', fail: '#f87171' };

export function SystemCheck({ onClose }) {
  const [checks, setChecks] = useState([]);
  const [running, setRunning] = useState(true);

  const runChecks = useCallback(async () => {
    setRunning(true);
    const next = [
      { name: 'Desktop application', status: window.solaDesktop?.isDesktop ? 'pass' : 'warn', detail: window.solaDesktop?.isDesktop ? 'Electron desktop features available' : 'Browser preview — projector automation, durable imports, and OBS controls are limited' },
      { name: 'Secure media access', status: window.isSecureContext ? 'pass' : 'fail', detail: window.isSecureContext ? 'Secure context active' : 'HTTPS is required for cameras and microphones' },
      { name: 'Local storage', status: window.indexedDB ? 'pass' : 'fail', detail: window.indexedDB ? 'IndexedDB available' : 'Projects cannot be saved reliably' },
      { name: 'Camera and microphone API', status: navigator.mediaDevices?.getUserMedia ? 'pass' : 'fail', detail: navigator.mediaDevices?.getUserMedia ? 'Media devices supported' : 'Camera/microphone capture unavailable' },
      { name: 'Screen capture', status: navigator.mediaDevices?.getDisplayMedia ? 'pass' : 'warn', detail: navigator.mediaDevices?.getDisplayMedia ? 'Screen capture supported' : 'Screen sources and recording unavailable' },
      { name: 'Program recording', status: globalThis.MediaRecorder ? 'pass' : 'warn', detail: globalThis.MediaRecorder ? 'MediaRecorder supported' : 'Recording unavailable' },
      { name: 'OBS streaming bridge', status: window.solaDesktop?.obs ? 'pass' : 'warn', detail: window.solaDesktop?.obs ? 'OBS controls available' : 'Open the installed desktop app to stream' },
    ];
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices?.() || [];
      const cameras = devices.filter((device) => device.kind === 'videoinput').length;
      const microphones = devices.filter((device) => device.kind === 'audioinput').length;
      next.push({ name: 'Detected inputs', status: cameras || microphones ? 'pass' : 'warn', detail: `${cameras} camera(s), ${microphones} microphone(s). Device names may require permission.` });
    } catch {
      next.push({ name: 'Detected inputs', status: 'warn', detail: 'Device enumeration was blocked by permissions.' });
    }
    setChecks(next);
    setRunning(false);
  }, []);

  useEffect(() => {
    window.queueMicrotask(runChecks);
  }, [runChecks]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 360, background: 'rgba(0,0,0,.82)', display: 'grid', placeItems: 'center', padding: '16px' }}>
      <div style={{ width: 'min(620px, 96vw)', maxHeight: '92vh', overflowY: 'auto', background: '#181818', color: 'white', border: '1px solid rgba(255,255,255,.16)', borderRadius: '10px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}><div><div style={{ fontWeight: 800 }}>System Check</div><div style={{ color: 'rgba(255,255,255,.5)', fontSize: '10px' }}>Run this before every service.</div></div><button onClick={onClose} style={{ padding: '6px', borderRadius: '5px', border: '1px solid rgba(255,255,255,.15)', background: '#292929', color: 'white', cursor: 'pointer' }}><X size={15} /></button></div>
        <div style={{ display: 'grid', gap: '6px' }}>{checks.map((check) => <div key={check.name} style={{ display: 'grid', gridTemplateColumns: '18px 145px 1fr', gap: '7px', alignItems: 'center', padding: '8px', background: '#101010', borderRadius: '5px', border: '1px solid rgba(255,255,255,.08)', fontSize: '10px' }}><span style={{ color: badgeColor[check.status], fontSize: '15px' }}>{check.status === 'pass' ? '●' : check.status === 'warn' ? '▲' : '✕'}</span><strong>{check.name}</strong><span style={{ color: 'rgba(255,255,255,.55)' }}>{check.detail}</span></div>)}</div>
        <button disabled={running} onClick={runChecks} style={{ width: '100%', marginTop: '12px', padding: '9px', border: '1px solid #d4a574', borderRadius: '5px', background: 'rgba(212,165,116,.14)', color: '#d4a574', fontWeight: 700, cursor: 'pointer' }}>{running ? 'Checking…' : 'Run Again'}</button>
      </div>
    </div>
  );
}
