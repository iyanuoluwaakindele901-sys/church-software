import { useEffect, useRef } from 'react';

export function CameraView({ stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream && stream !== 'denied' && stream !== 'unsupported') {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', textAlign: 'center', padding: '10px' }}>Camera off</div>;
  if (stream === 'denied') return <div style={{ color: '#f87171', fontSize: '11px', textAlign: 'center', padding: '10px' }}>Camera permission denied</div>;
  if (stream === 'unsupported') return <div style={{ color: '#f87171', fontSize: '11px', textAlign: 'center', padding: '10px' }}>Camera not available here</div>;

  return <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
}
