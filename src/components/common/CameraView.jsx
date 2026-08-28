import { useEffect, useRef } from 'react';

export function CameraView({ stream }) {
  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const isRelayedFrame = typeof stream === 'string' && stream.startsWith('data:image/');
  const relaySourceId = stream?.relaySourceId || '';

  useEffect(() => {
    if (videoRef.current && stream?.getTracks) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (!relaySourceId) return undefined;
    const applyLatestFrame = () => {
      const frame = window.__solaCameraFrameStore?.[relaySourceId];
      if (imageRef.current && frame) imageRef.current.src = frame;
    };
    const handleFrame = (event) => {
      if (event.detail?.sourceId === relaySourceId && imageRef.current) imageRef.current.src = event.detail.frame;
    };
    applyLatestFrame();
    window.addEventListener('sola-camera-frame', handleFrame);
    return () => window.removeEventListener('sola-camera-frame', handleFrame);
  }, [relaySourceId]);

  if (!stream) return <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', textAlign: 'center', padding: '10px' }}>Camera off</div>;
  if (stream === 'denied') return <div style={{ color: '#f87171', fontSize: '11px', textAlign: 'center', padding: '10px' }}>Camera permission denied</div>;
  if (stream === 'unsupported') return <div style={{ color: '#f87171', fontSize: '11px', textAlign: 'center', padding: '10px' }}>Camera not available here</div>;
  if (isRelayedFrame) return <img src={stream} alt="Live camera" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />;
  if (relaySourceId) return <img ref={imageRef} alt="Live camera" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />;

  return <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
}
