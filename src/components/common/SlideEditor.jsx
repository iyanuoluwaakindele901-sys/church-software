import { useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Maximize2, Minimize2, X } from './Icon';

export function SlideEditor({ presName, slide, bgCss, onSave, onClose }) {
  const [text, setText] = useState(slide.text || '');
  const [fontSize, setFontSize] = useState(slide.fontSize || 28);
  const [align, setAlign] = useState(slide.align || 'center');
  const [bold, setBold] = useState(slide.bold !== false);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div onClick={(event) => event.stopPropagation()} style={{ background: '#1a1a1a', border: '1px solid #d4a574', borderRadius: '12px', width: '100%', maxWidth: '760px', boxShadow: '0 10px 40px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#d4a574' }}>✏️ Slide Editor — {presName}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="rgba(255,255,255,0.6)" /></button>
        </div>
        <div style={{ padding: '16px 16px 0' }}>
          <div style={{ width: '100%', aspectRatio: '16/9', background: bgCss, borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ width: '90%', textAlign: align, fontSize: `${fontSize}px`, fontWeight: bold ? '700' : '400', color: 'white', lineHeight: '1.5', whiteSpace: 'pre-wrap', textShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
              {text || <span style={{ opacity: 0.3 }}>Type your slide text below...</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginTop: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '3px' }}>
            <button onClick={() => setAlign('left')} title="Align left" style={{ width: '28px', height: '28px', background: align === 'left' ? 'rgba(212,165,116,0.25)' : 'rgba(255,255,255,0.06)', border: '1px solid ' + (align === 'left' ? '#d4a574' : 'rgba(255,255,255,0.15)'), borderRadius: '4px', color: align === 'left' ? '#d4a574' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlignLeft size={13} /></button>
            <button onClick={() => setAlign('center')} title="Align center" style={{ width: '28px', height: '28px', background: align === 'center' ? 'rgba(212,165,116,0.25)' : 'rgba(255,255,255,0.06)', border: '1px solid ' + (align === 'center' ? '#d4a574' : 'rgba(255,255,255,0.15)'), borderRadius: '4px', color: align === 'center' ? '#d4a574' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlignCenter size={13} /></button>
            <button onClick={() => setAlign('right')} title="Align right" style={{ width: '28px', height: '28px', background: align === 'right' ? 'rgba(212,165,116,0.25)' : 'rgba(255,255,255,0.06)', border: '1px solid ' + (align === 'right' ? '#d4a574' : 'rgba(255,255,255,0.15)'), borderRadius: '4px', color: align === 'right' ? '#d4a574' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlignRight size={13} /></button>
          </div>
          <button onClick={() => setBold((current) => !current)} title="Bold" style={{ width: '28px', height: '28px', background: bold ? 'rgba(212,165,116,0.25)' : 'rgba(255,255,255,0.06)', border: '1px solid ' + (bold ? '#d4a574' : 'rgba(255,255,255,0.15)'), borderRadius: '4px', color: bold ? '#d4a574' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Bold size={13} /></button>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)' }} />
          <button onClick={() => setFontSize((current) => Math.max(12, current - 2))} title="Smaller text" style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minimize2 size={12} /></button>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', minWidth: '30px', textAlign: 'center' }}>{fontSize}px</span>
          <button onClick={() => setFontSize((current) => Math.min(80, current + 2))} title="Larger text" style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Maximize2 size={12} /></button>
          <input type="range" min="12" max="80" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} style={{ flex: 1, minWidth: '80px', accentColor: '#d4a574' }} />
        </div>
        <div style={{ padding: '16px' }}>
          <textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} rows={4} style={{ width: '100%', padding: '10px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'white', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <button onClick={onClose} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '6px', color: 'white', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => onSave({ text, fontSize, align, bold })} style={{ padding: '8px 18px', background: '#d4a574', border: 'none', borderRadius: '6px', color: '#1a1a1a', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>Save Slide</button>
          </div>
        </div>
      </div>
    </div>
  );
}
