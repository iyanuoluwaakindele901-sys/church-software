import { useState } from 'react';

export function Modal({ modal, onClose }) {
  const [value, setValue] = useState(modal.value || '');
  if (!modal) return null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(event) => event.stopPropagation()} style={{ background: '#1e1e1e', border: '1px solid #d4a574', borderRadius: '10px', padding: '18px', width: '300px', boxShadow: '0 8px 30px rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'white', marginBottom: '12px' }}>{modal.title}</div>
        {modal.type === 'prompt' && (
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && modal.onSubmit(value)}
            style={{ width: '100%', padding: '8px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '5px', color: 'white', fontSize: '12px', boxSizing: 'border-box', marginBottom: '14px' }}
          />
        )}
        {modal.message && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '14px' }}>{modal.message}</div>}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          {modal.type !== 'alert' && <button onClick={onClose} style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '5px', color: 'white', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>}
          <button onClick={() => { if (modal.type === 'prompt') modal.onSubmit(value); else if (modal.type === 'confirm') modal.onConfirm(); else onClose(); }} style={{ padding: '7px 14px', background: '#d4a574', border: 'none', borderRadius: '5px', color: '#1a1a1a', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>{modal.type === 'alert' ? 'OK' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}
