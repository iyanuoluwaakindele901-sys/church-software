import { X } from './Icon';
import { RECORDING_QUALITIES, RECORDING_RESOLUTIONS } from '../../recording/engine';

const formatTime = (milliseconds) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const statusLabel = {
  idle: 'READY',
  selecting: 'SELECT PROGRAM SOURCE',
  recording: 'RECORDING',
  paused: 'PAUSED',
  finalizing: 'FINALIZING FILE',
  complete: 'FILE COMPLETE',
  error: 'ERROR',
};

export function RecordingManager({
  open, onClose, status, elapsedMs, settings, onSettingsChange, formats,
  saveLocation, onChooseLocation, onOpenProgram, onStart, onPause, onResume, onStop,
  error, completion,
}) {
  if (!open) return null;
  const active = ['selecting', 'recording', 'paused', 'finalizing'].includes(status);
  const canStart = ['idle', 'complete', 'error'].includes(status) && formats.length > 0;
  const update = (key, value) => onSettingsChange({ ...settings, [key]: value });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 380, display: 'grid', placeItems: 'center', padding: '16px', background: 'rgba(0,0,0,0.84)' }}>
      <div style={{ width: 'min(560px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', background: '#171717', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '8px', color: 'white' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', background: '#171717', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '750' }}>Recording Manager</div>
            <div style={{ marginTop: '3px', color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>PROGRAM OUTPUT + MASTER AUDIO</div>
          </div>
          <button onClick={onClose} title="Close recording manager" style={{ width: '32px', height: '32px', display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: 'white', cursor: 'pointer' }}><X size={15} /></button>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '14px', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div>
              <div style={{ color: status === 'recording' ? '#f87171' : status === 'complete' ? '#4ade80' : status === 'error' ? '#fbbf24' : '#d4a574', fontSize: '11px', fontWeight: '800' }}>{statusLabel[status] || status.toUpperCase()}</div>
              <div style={{ marginTop: '4px', color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>{status === 'selecting' ? 'Choose the Sola Worship projector tab in the browser picker.' : saveLocation || 'Save destination: Browser Downloads'}</div>
            </div>
            <div style={{ minWidth: '118px', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', textAlign: 'right', fontSize: '25px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>{formatTime(elapsedMs)}</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div><div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.58)' }}>Video source</div><div style={{ marginTop: '3px', fontSize: '11px' }}>Sola Worship projector tab</div></div>
            <button disabled={active} onClick={onOpenProgram} style={{ padding: '8px 11px', background: 'rgba(37,99,235,0.16)', border: '1px solid #3b82f6', borderRadius: '4px', color: '#bfdbfe', cursor: active ? 'not-allowed' : 'pointer' }}>Open Program Window</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '14px 0' }}>
            <label style={{ display: 'grid', gap: '5px', fontSize: '10px', color: 'rgba(255,255,255,0.58)' }}>Format
              <select disabled={active} value={settings.format} onChange={(event) => update('format', event.target.value)} style={{ padding: '9px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white' }}>
                {formats.map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '5px', fontSize: '10px', color: 'rgba(255,255,255,0.58)' }}>Quality
              <select disabled={active} value={settings.quality} onChange={(event) => update('quality', event.target.value)} style={{ padding: '9px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white' }}>
                {Object.entries(RECORDING_QUALITIES).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '5px', fontSize: '10px', color: 'rgba(255,255,255,0.58)' }}>Resolution
              <select disabled={active} value={settings.resolution} onChange={(event) => update('resolution', event.target.value)} style={{ padding: '9px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white' }}>
                {Object.entries(RECORDING_RESOLUTIONS).map(([id, option]) => <option key={id} value={id}>{id} - {option.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '5px', fontSize: '10px', color: 'rgba(255,255,255,0.58)' }}>Frame rate
              <select disabled={active} value={settings.fps} onChange={(event) => update('fps', Number(event.target.value))} style={{ padding: '9px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white' }}>
                {[24, 25, 30, 50, 60].map((fps) => <option key={fps} value={fps}>{fps} FPS</option>)}
              </select>
            </label>
          </div>

          <label style={{ display: 'grid', gap: '5px', paddingBottom: '14px', fontSize: '10px', color: 'rgba(255,255,255,0.58)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Automatic filename
            <input disabled={active} value={settings.filename} onChange={(event) => update('filename', event.target.value)} style={{ padding: '9px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white' }} />
          </label>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.58)' }}>Save location</div>
              <div style={{ marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'white', fontSize: '11px' }}>{saveLocation || 'Browser Downloads'}</div>
            </div>
            <button disabled={active || !window.showSaveFilePicker} onClick={onChooseLocation} style={{ flexShrink: 0, padding: '8px 11px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '4px', color: 'white', cursor: active ? 'not-allowed' : 'pointer', opacity: window.showSaveFilePicker ? 1 : 0.5 }}>{window.showSaveFilePicker ? 'Choose Location' : 'Downloads Only'}</button>
          </div>

          {error && <div style={{ marginTop: '12px', color: '#fca5a5', fontSize: '11px', lineHeight: 1.45 }}>{error}</div>}
          {completion && status === 'complete' && <div style={{ marginTop: '12px', color: '#86efac', fontSize: '11px', lineHeight: 1.45 }}>{completion.filename} completed ({Math.max(1, Math.round(completion.bytes / 1024 / 1024))} MB) in {completion.saveMethod}.</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '16px' }}>
            {status === 'recording' && <button onClick={onPause} style={{ padding: '9px 14px', background: '#2b2b2b', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>Pause</button>}
            {status === 'paused' && <button onClick={onResume} style={{ padding: '9px 14px', background: '#2b2b2b', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>Resume</button>}
            {(status === 'recording' || status === 'paused') && <button onClick={onStop} style={{ padding: '9px 14px', background: '#b91c1c', border: '1px solid #dc2626', borderRadius: '4px', color: 'white', fontWeight: '700', cursor: 'pointer' }}>Stop Recording</button>}
            {canStart && <button onClick={onStart} style={{ padding: '9px 14px', background: '#dc2626', border: '1px solid #ef4444', borderRadius: '4px', color: 'white', fontWeight: '700', cursor: 'pointer' }}>Choose Program and Start</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
