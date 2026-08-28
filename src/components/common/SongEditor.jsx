import { useMemo, useState } from 'react';
import { X } from './Icon';
import { slidesFromLyrics } from '../../utils/songUtils';

export function SongEditor({ onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [lyrics, setLyrics] = useState('');
  const slides = useMemo(() => slidesFromLyrics(lyrics), [lyrics]);
  const canSave = title.trim() && lyrics.trim();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 350, display: 'grid', placeItems: 'center', padding: '16px', background: 'rgba(0,0,0,0.82)' }}>
      <div style={{ width: 'min(920px, 100%)', height: 'min(720px, calc(100vh - 32px))', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(260px, 0.75fr)', background: '#171717', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '8px', color: 'white' }}>
        <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><div style={{ fontSize: '15px', fontWeight: '700' }}>Add New Song</div><div style={{ marginTop: '3px', color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>Create a reusable local song and generate slides from its lyrics.</div></div>
            <button onClick={onClose} title="Close" style={{ width: '32px', height: '32px', display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: 'white', cursor: 'pointer' }}><X size={15} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <label style={{ display: 'grid', gap: '5px', fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>Title
              <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Song or hymn title" style={{ padding: '9px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white' }} />
            </label>
            <label style={{ display: 'grid', gap: '5px', fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>Author / artist
              <input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="Author, composer, or artist" style={{ padding: '9px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white' }} />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', minHeight: 0, flex: 1, fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>Lyrics
            <textarea value={lyrics} onChange={(event) => setLyrics(event.target.value)} placeholder={'Enter lyrics here.\n\nLeave a blank line between verses or sections.'} style={{ flex: 1, minHeight: '180px', resize: 'vertical', padding: '10px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white', lineHeight: 1.5 }} />
          </label>
          <div style={{ position: 'sticky', bottom: 0, zIndex: 2, margin: '0 -18px -18px', padding: '12px 18px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', background: '#171717', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ color: canSave ? '#4ade80' : 'rgba(255,255,255,0.45)', fontSize: '10px' }}>{!title.trim() ? 'Enter a song title to save' : !lyrics.trim() ? 'Enter the lyrics to save' : `${slides.length} slide${slides.length === 1 ? '' : 's'} ready`}</span>
            <div style={{ display: 'flex', gap: '7px', flexShrink: 0 }}>
            <button onClick={onClose} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>Cancel</button>
            <button disabled={!canSave} onClick={() => onSave({ title: title.trim(), artist: artist.trim() || 'Unknown', lyrics, slides })} style={{ padding: '8px 14px', background: canSave ? '#d4a574' : 'rgba(255,255,255,0.08)', border: 0, borderRadius: '4px', color: canSave ? '#171717' : 'rgba(255,255,255,0.35)', fontWeight: '700', cursor: canSave ? 'pointer' : 'not-allowed' }}>Save Song</button>
            </div>
          </div>
        </div>
        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', padding: '18px', overflowY: 'auto', background: '#111' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>SLIDE PREVIEW ({slides.length})</div>
          {slides.length === 0 && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>Slides appear as lyrics are entered.</div>}
          {slides.map((slide) => <div key={slide.id} style={{ minHeight: '82px', marginBottom: '7px', padding: '10px', display: 'grid', placeItems: 'center', textAlign: 'center', whiteSpace: 'pre-line', background: '#241c14', border: '1px solid rgba(212,165,116,0.28)', borderRadius: '4px', color: 'white', fontSize: '11px', lineHeight: 1.4 }}><div><div style={{ color: '#d4a574', fontSize: '8px', marginBottom: '5px' }}>{slide.label.toUpperCase()}</div>{slide.text}</div></div>)}
        </div>
      </div>
    </div>
  );
}
