import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraView } from '../components/common/CameraView';
import { CameraManager } from '../cameras/CameraManager';
import { Modal } from '../components/common/Modal';
import { SlideEditor } from '../components/common/SlideEditor';
import { SongEditor } from '../components/common/SongEditor';
import { RecordingManager } from '../components/common/RecordingManager';
import {
  Database, Search, Monitor, Mic, FileText, Volume2, VolumeX, SlidersHorizontal, ChevronLeft,
  Plus, Edit2, Trash2, Tv, Radio, FolderOpen, Save, FilePlus, Eye, EyeOff,
  ArrowUp, ArrowDown, Video, ImageIcon, Type, Palette, Mic2, ArrowLeft, LayoutGrid, X,
  ChevronRight, ChevronDown as ChevDown, Bookmark, Circle, Power, Camera as CameraIcon, Settings as SettingsIcon, GripVertical,
  Maximize2, Repeat,
} from '../components/common/Icon';
import {
  BIBLE_BOOKS, BIBLE_VERSION_FILES, BUILTIN_THEMES, SUPPORTED_BIBLE_LANGUAGES,
} from '../data/bibleData';
import {
  COMMUNION_PRESENTATION, ensureCommunionPresentation, ensureCommunionTheme,
} from '../data/communionPresentation';
import { SERVICE_MEDIA, mergeBuiltInMedia, mergeBuiltInThemes } from '../data/mediaLibrary';
import {
  fetchBibleVersion, findLiveVerseMatch, parseRef, searchBibleVersion, searchVerseTopicsByKeyword, setLoadedBibleVersion,
  translateVerse, verseCountFor, getVerseText, getVerseTextAsync,
} from '../utils/bible';
import {
  fetchRealLyricsAT, searchLocalSongs, searchOnlineSongsDetailed,
  slidesFromLyrics, songSlidesFromLyrics,
} from '../utils/songUtils';
import { translateText } from '../utils/translator';
import { installAppStorage } from '../utils/storage';
import * as Scenes from '../scenes';
import * as Audio from '../audio';
import {
  SolaRecordingEngine, chooseRecordingFile, createRecordingFilename, getSupportedRecordingFormats,
} from '../recording/engine';

let nextServiceId = 1000;
let nextSceneId = 10;
let nextSourceId = 100;
let nextThemeId = 500;
let nextPresId = 700;
let nextSlideId = 800;
const createSongId = () => `song-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const currentTimestamp = () => Date.now();

const normalizeSavedSongs = (songs = []) => {
  const seen = new Set();
  return songs.map((song) => {
    let id = song.id || createSongId();
    if (seen.has(id)) id = createSongId();
    seen.add(id);
    return { ...song, id };
  });
};
const mergeSongLibraries = (...libraries) => {
  const songsByIdentity = new Map();
  libraries.flat().filter(Boolean).forEach((song) => {
    const identity = `${song.title || ''}|${song.artist || ''}`.trim().toLowerCase();
    if (!identity || identity === '|') return;
    songsByIdentity.set(identity, { ...songsByIdentity.get(identity), ...song });
  });
  return normalizeSavedSongs([...songsByIdentity.values()]);
};

const SOURCE_TYPES = [
  ['camera', 'Camera'], ['phone-camera', 'Phone Camera'], ['image', 'Image'], ['video', 'Video'],
  ['scripture', 'Scripture'], ['song-panel', 'Song'], ['slide-panel', 'Presentation Slide'],
  ['text', 'Text'], ['color', 'Color'], ['planner', 'Planner Content'], ['browser', 'Browser/Web'],
  ['screen', 'Screen Capture'], ['audio', 'Audio'], ['lower-third', 'Lower Third'], ['countdown', 'Countdown'],
  ['logo', 'Logo'], ['overlay', 'Overlay'],
];

const classifyVideoDevice = (label = '') => {
  const name = label.toLowerCase();
  if (/capture|cam link|avermedia|elgato|blackmagic|hdmi|usb video|uvc/.test(name)) return 'Capture card';
  if (/iriun|droidcam|obs virtual|virtual camera|epoccam|camo|ndi/.test(name)) return 'Virtual camera';
  return 'Camera';
};

const parseVideoResolution = (value) => {
  if (!value || value === 'auto') return {};
  const [width, height] = value.split('x').map(Number);
  return width && height ? { width: { ideal: width }, height: { ideal: height } } : {};
};

function sourceDefaults(type, id) {
  const base = { id, type, visible: true, locked: false, x: 0, y: 0, width: 100, height: 100, scale: 100, rotation: 0, opacity: 100, crop: 0 };
  const defaults = {
    color: { name: 'Color Source', color: '#3a3a3a' },
    text: { name: 'Text', text: 'Add your text\nSecond line', x: 15, y: 30, width: 70, height: 40, fontSize: 42, fontColor: '#ffffff', fontFamily: 'Arial, sans-serif', textAlign: 'center', template: 'clean' },
    camera: { name: 'Camera' },
    'phone-camera': { name: 'Phone Camera', note: 'Use a mobile browser/camera source when paired.' },
    scripture: { name: 'Scripture', reference: 'John 3:16', text: 'For God so loved the world...', x: 50, y: 0, width: 50, height: 100, fontSize: 42, fontColor: '#ffffff', panelColor: '#17120f' },
    'song-panel': { name: 'Song', label: 'VERSE', text: 'Add song lyrics from the Planner preview', x: 50, y: 0, width: 50, height: 100, fontSize: 40, fontColor: '#ffffff', panelColor: '#17120f' },
    'slide-panel': { name: 'Presentation Slide', title: 'Presentation', text: 'Add slide text from the Planner preview', x: 50, y: 0, width: 50, height: 100, fontSize: 42, fontColor: '#ffffff', panelColor: '#17120f' },
    image: { name: 'Image', dataUrl: null, objectFit: 'contain' },
    video: { name: 'Video', dataUrl: null },
    planner: { name: 'Planner Content' },
    browser: { name: 'Browser/Web', url: 'https://example.com' },
    screen: { name: 'Screen Capture', captureLabel: 'No capture selected' },
    audio: { name: 'Audio Source', monitorOnly: true },
    'lower-third': { name: 'Lower Third', title: 'Speaker Name', subtitle: 'Message Title', x: 5, y: 68, width: 70, height: 24 },
    countdown: { name: 'Countdown', seconds: 300, initialSeconds: 300, x: 30, y: 30, width: 40, height: 35, fontColor: '#ffffff', fontSize: 72 },
    logo: { name: 'Logo', text: 'SOLA', x: 76, y: 5, width: 18, height: 18 },
    overlay: { name: 'Overlay', color: '#000000', opacity: 35 },
  };
  return { ...base, ...(defaults[type] || { name: type }) };
}
const normalizeObsScenes = (scenes = []) => scenes.map((scene) => ({
  ...scene,
  sources: (scene.sources || []).map((source) => ({ ...sourceDefaults(source.type, source.id), ...source })),
}));

function sourceFrameStyle(source) {
  const crop = Number(source.crop || 0);
  return {
    position: 'absolute',
    left: `${Number(source.x || 0)}%`,
    top: `${Number(source.y || 0)}%`,
    width: `${Number(source.width ?? 100)}%`,
    height: `${Number(source.height ?? 100)}%`,
    opacity: Number(source.opacity ?? 100) / 100,
    transform: `scale(${Number(source.scale || 100) / 100}) rotate(${Number(source.rotation || 0)}deg)`,
    transformOrigin: 'center',
    overflow: 'hidden',
    clipPath: crop ? `inset(${crop}%)` : undefined,
    pointerEvents: source.locked ? 'none' : 'auto',
  };
}

function renderObsSource(source, hideText, cameraStreams = {}, screenStreams = {}) {
  if (!source.visible) return null;
  const base = sourceFrameStyle(source);
  if (source.type === 'color') return <div key={source.id} style={{ ...base, background: source.color }} />;
  if (source.type === 'text' || source.type === 'lower-third') {
    if (hideText) return null;
    if (source.type === 'lower-third') return (
      <div key={source.id} style={{ ...base, display: 'flex', alignItems: 'flex-end', padding: '24px' }}>
        <div style={{ minWidth: '45%', background: 'rgba(0,0,0,0.72)', borderLeft: '4px solid #d4a574', padding: '12px 16px' }}>
          <div style={{ fontSize: '20px', fontWeight: '700', color: 'white' }}>{source.title}</div>
          <div style={{ fontSize: '12px', color: '#d4a574', marginTop: '3px' }}>{source.subtitle}</div>
        </div>
      </div>
    );
    const templateStyle = source.template === 'scripture'
      ? { background: 'rgba(8,8,8,0.72)', borderLeft: '5px solid #d4a574', padding: '18px 22px' }
      : source.template === 'title' ? { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: '700' }
        : source.template === 'caption' ? { background: 'rgba(0,0,0,0.68)', padding: '10px 16px' } : {};
    return (
      <div key={source.id} style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', boxSizing: 'border-box' }}>
        <div style={{ width: '100%', fontSize: `${Number(source.fontSize || 42)}px`, fontFamily: source.fontFamily || 'Arial, sans-serif', fontWeight: source.bold === false ? '400' : '600', color: source.fontColor || '#ffffff', textAlign: source.textAlign || 'center', whiteSpace: 'pre-wrap', lineHeight: 1.2, textShadow: '0 2px 8px rgba(0,0,0,0.7)', boxSizing: 'border-box', ...templateStyle }}>{source.text}</div>
      </div>
    );
  }
  if (source.type === 'image') return <div key={source.id} style={{ ...base, backgroundImage: `url(${source.dataUrl})`, backgroundSize: source.objectFit || 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />;
  if (source.type === 'video') return source.dataUrl ? <video key={source.id} src={source.dataUrl} autoPlay loop muted playsInline style={{ ...base, width: '100%', height: '100%', objectFit: 'cover' }} /> : <div key={source.id} style={{ ...base, display: 'grid', placeItems: 'center', background: '#141414', color: 'rgba(255,255,255,0.45)', fontSize: '12px' }}>Choose video</div>;
  if (source.type === 'scripture' || source.type === 'song-panel' || source.type === 'slide-panel') {
    const heading = source.type === 'scripture' ? source.reference : source.type === 'song-panel' ? source.label : source.title;
    return (
      <div key={source.id} style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', padding: 'clamp(18px, 4vw, 64px)', background: source.panelColor || '#17120f', color: source.fontColor || '#fff', animation: 'splitContentReveal 520ms cubic-bezier(.2,.8,.2,1) both' }}>
        <div style={{ marginBottom: '18px', color: '#d4a574', fontSize: 'clamp(15px, 2vw, 28px)', fontWeight: '800', letterSpacing: source.type === 'song-panel' ? '0.08em' : 0 }}>{heading}</div>
        <div style={{ width: '100%', whiteSpace: 'pre-wrap', textAlign: source.textAlign || 'center', fontFamily: source.fontFamily || 'Georgia, "Times New Roman", serif', fontSize: `clamp(22px, 3.2vw, ${Number(source.fontSize || 42)}px)`, fontWeight: '650', lineHeight: 1.35, textShadow: '0 2px 10px rgba(0,0,0,.65)' }}>{source.text}</div>
      </div>
    );
  }
  if (source.type === 'camera' || source.type === 'phone-camera') return <div key={source.id} style={base}>{cameraStreams[source.id] ? <CameraView stream={cameraStreams[source.id]} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: '#101820', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>{source.type === 'phone-camera' ? 'Phone disconnected' : 'Camera unavailable'}</div>}</div>;
  if (source.type === 'screen') return screenStreams[source.id] ? <video key={source.id} ref={(node) => { if (node && node.srcObject !== screenStreams[source.id]) node.srcObject = screenStreams[source.id]; }} autoPlay muted playsInline style={{ ...base, width: '100%', height: '100%', objectFit: 'cover' }} /> : <div key={source.id} style={{ ...base, display: 'grid', placeItems: 'center', background: '#111', color: 'rgba(255,255,255,0.55)', fontSize: '12px' }}>{source.captureLabel || 'Select screen/window/tab'}</div>;
  if (source.type === 'browser') return <iframe key={source.id} title={source.name} src={source.url} style={{ ...base, width: '100%', height: '100%', border: 0, background: 'white' }} />;
  if (source.type === 'countdown') return <div key={source.id} style={{ ...base, display: 'grid', placeItems: 'center', color: source.fontColor || '#ffffff', fontSize: `${Number(source.fontSize || 72)}px`, fontWeight: '800', textShadow: '0 3px 14px rgba(0,0,0,0.75)' }}>{fmtDuration(Math.max(0, source.timerRunning && source.timerEndsAt ? Math.ceil((source.timerEndsAt - Date.now()) / 1000) : Number(source.seconds || 0))).slice(3)}</div>;
  if (source.type === 'logo') return <div key={source.id} style={{ ...base, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '22px' }}><div style={{ border: '2px solid rgba(255,255,255,0.8)', padding: '8px 10px', color: 'white', fontWeight: '800', letterSpacing: '1px' }}>{source.text}</div></div>;
  if (source.type === 'overlay') return <div key={source.id} style={{ ...base, background: source.color || '#000', opacity: Number(source.opacity ?? 35) / 100 }} />;
  if (source.type === 'audio') return null;
  return null;
}

function LibraryVideoPreview({ item, style }) {
  const videoRef = useRef(null);
  const playPreview = () => videoRef.current?.play().catch(() => null);
  const pausePreview = () => videoRef.current?.pause();
  return (
    <video
      ref={videoRef}
      src={item.dataUrl}
      muted
      loop={item.loop !== false}
      playsInline
      preload="metadata"
      onMouseEnter={playPreview}
      onMouseLeave={pausePreview}
      style={style}
    />
  );
}

function fmtDuration(seconds) {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${secs}`;
}

export default function SolaWorshipApp() {
  const queryParams = new URLSearchParams(window.location.search);
  const isProjectorMode = queryParams.get('projector') === '1';
  const remoteDisplayPairCode = queryParams.get('remote') || '';
  const [modal, setModal] = useState(null);
  const showPrompt = (title, value, onSubmit) => setModal({ type: 'prompt', title, value, onSubmit: (nextValue) => { setModal(null); onSubmit(nextValue); } });
  const showConfirm = (title, onConfirm) => setModal({ type: 'confirm', title, onConfirm: () => { setModal(null); onConfirm(); } });
  const showAlert = (title, message) => setModal({ type: 'alert', title, message });
  const showChoice = (title, message, options) => setModal({ type: 'choice', title, message, options });

  const [serviceOrder, setServiceOrder] = useState([
    { id: 1, name: 'Pre-Service Logo', type: 'slide', duration: '5 min' },
    { id: 2, name: 'Welcome & Announcements', type: 'slide', duration: '3 min' },
    { id: 3, name: 'Amazing Grace', type: 'song', duration: '4 min', artist: 'Chris Tomlin' },
    { id: 4, name: 'How Great Is Our God', type: 'song', duration: '5 min', artist: 'Chris Tomlin' },
    { id: 5, name: 'Isaiah 40', type: 'slide', duration: '2 min' },
    { id: 6, name: 'Sermon Slides', type: 'slide', duration: '30 min' },
    { id: 7, name: 'Scripture Reading', type: 'slide', duration: '3 min' },
    { id: 8, name: 'Good Good Father', type: 'song', duration: '5 min', artist: 'Bethel Music' },
    { id: 9, name: 'Living Hope', type: 'song', duration: '4 min', artist: 'Phil Wickham' },
    { id: 10, name: 'Closing Announcements', type: 'slide', duration: '2 min' },
  ]);
  const [expandedServiceItemId, setExpandedServiceItemId] = useState(null);
  const [pointerDragId, setPointerDragId] = useState(null);
  const serviceItemRefs = useRef({});

  const [viewMode, setViewMode] = useState('planner');
  const [mediaTab, setMediaTab] = useState('bible');
  const [searchQuery, setSearchQuery] = useState('');

  const [bibleSubTab, setBibleSubTab] = useState('testament');
  const [testament, setTestament] = useState('old');
  const [bibleView, setBibleView] = useState('books');
  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState('kjv');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [selectedVerses, setSelectedVerses] = useState([]);
  const [verseAnchor, setVerseAnchor] = useState(null);
  const [focusedVerse, setFocusedVerse] = useState(null);
  const [aiQuery, setAiQuery] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  const [voiceError, setVoiceError] = useState(null);
  const recognitionRef = useRef(null);
  const [loadedBibleVersions, setLoadedBibleVersions] = useState({});
  const [bibleLoading, setBibleLoading] = useState(false);
  const [bibleLoadError, setBibleLoadError] = useState(null);
  const [bibleFontSize, setBibleFontSize] = useState(36);

  const [songQuery, setSongQuery] = useState('');
  const [songLoading, setSongLoading] = useState(false);
  const [songResultLoadingId, setSongResultLoadingId] = useState(null);
  const [songResults, setSongResults] = useState([]);
  const [activeSong, setActiveSong] = useState(null);
  const [activeSongSlides, setActiveSongSlides] = useState([]);
  const [songFontSize, setSongFontSize] = useState(56);
  const [slideFontSize, setSlideFontSize] = useState(64);
  const [songSourceNote, setSongSourceNote] = useState('');
  const [savedSongs, setSavedSongs] = useState([]);
  const [songLibraryStatus, setSongLibraryStatus] = useState('loading');
  const [songEditorOpen, setSongEditorOpen] = useState(false);
  const songSearchRequestRef = useRef(0);
  const songResultRequestRef = useRef(0);

  const [stagedContent, setStagedContent] = useState({ kind: 'service', index: 2 });
  const [programContent, setProgramContent] = useState(null);
  const [isBlack, setIsBlack] = useState(false);
  const [textCleared, setTextCleared] = useState(false);
  const [activeBackground, setActiveBackground] = useState(BUILTIN_THEMES[0]);
  const projectorChannelRef = useRef(null);
  const projectorStateRef = useRef(null);
  const transitionSequenceRef = useRef(0);
  const appliedProjectorTransitionRef = useRef(null);
  const remotePresentationSocketRef = useRef(null);
  const [presentationPairCode, setPresentationPairCode] = useState(() => remoteDisplayPairCode || window.sessionStorage.getItem('sola-camera-pair-code') || '');

  const [radialOpen, setRadialOpen] = useState(false);
  const [openListVisible, setOpenListVisible] = useState(false);
  const [savedProjects, setSavedProjects] = useState([]);
  const [cameraManagerOpen, setCameraManagerOpen] = useState(false);
  const [liveOutputsOpen, setLiveOutputsOpen] = useState(false);
  const [outputs, setOutputs] = useState([
    { id: 'main', name: 'Main Projector', kind: 'display', active: true },
    { id: 'lobby', name: 'Lobby Screen', kind: 'display', active: false },
    { id: 'stream', name: 'Live Stream', kind: 'stream', active: false },
    { id: 'stage', name: 'Stage Confidence Monitor', kind: 'stage', active: false },
  ]);
  const [newOutputName, setNewOutputName] = useState('');

  const [contextMenu, setContextMenu] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  const [storageReady, setStorageReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState('loading');
  const persistenceTimerRef = useRef(null);

  const [audioChannels, setAudioChannels] = useState([
    { id: 'desktop', name: 'Desktop/System Audio', icon: 'monitor', inputType: 'desktop', level: 62, gain: 0, muted: false, solo: false, meter: 62, bus: 'Master', available: 'where supported by capture/browser permissions', processing: ['EQ ready', 'Compressor ready', 'Gate ready'] },
    { id: 'mic', name: 'Mic/Aux', icon: 'mic', inputType: 'microphone', level: 45, gain: 0, muted: false, solo: false, meter: 45, bus: 'Master', available: 'available after microphone permission', processing: ['EQ ready', 'Compressor ready', 'Gate ready'] },
    { id: 'media', name: 'Media Source', icon: 'file', inputType: 'media', level: 78, gain: 0, muted: false, solo: false, meter: 78, bus: 'Master', available: 'from scene media sources', processing: ['Limiter ready', 'Delay ready'] },
    { id: 'camera-audio', name: 'Camera Audio', icon: 'camera', inputType: 'camera', level: 50, gain: 0, muted: false, solo: false, meter: 50, bus: 'Master', available: 'when selected camera exposes audio', processing: ['EQ ready', 'Gate ready'] },
  ]);
  const [masterVolume, setMasterVolume] = useState(86);
  const [audioEngineReady, setAudioEngineReady] = useState(false);
  const [audioMeters, setAudioMeters] = useState({});
  const [audioMonitoring, setAudioMonitoring] = useState(false);
  const audioEngineRef = useRef(null);
  const audioInputStreamsRef = useRef(new Map());
  const mediaAudioElementRef = useRef(null);

  const [obsScenes, setObsScenes] = useState(() => normalizeObsScenes([
    { id: 'scene1', name: 'Main Scene', sources: [{ id: 'src1', type: 'color', name: 'Background', color: '#2a2035', visible: true }, { id: 'src2', type: 'text', name: 'Lower Third', text: 'Welcome', visible: true }] },
    { id: 'scene2', name: 'Camera Scene', sources: [{ id: 'src3', type: 'color', name: 'Background', color: '#111', visible: true }, { id: 'src4', type: 'camera', name: 'Camera 1', visible: true }] },
  ]));
  const [activeObsSceneId, setActiveObsSceneId] = useState('scene1');
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState([]);
  const [showAdvancedSource, setShowAdvancedSource] = useState(false);
  const previewCanvasRef = useRef(null);
  const sourceDragRef = useRef(null);
  const [, setCountdownTick] = useState(0);
  const [cameraStreams, setCameraStreams] = useState({});
  const cameraStreamsRef = useRef({});
  const projectorCameraStreamsRef = useRef(new Map());
  const projectorPeerConnectionsRef = useRef(new Map());
  const pendingProjectorIceRef = useRef(new Map());
  const projectorFrameRelayRequestedRef = useRef(false);
  const projectorNativeCameraStreamsRef = useRef(new Set());
  const [projectorFrameRelayEnabled, setProjectorFrameRelayEnabled] = useState(false);
  const [projectorStreamRevision, setProjectorStreamRevision] = useState(0);
  const [cameraSourcePicker, setCameraSourcePicker] = useState(null);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [cameraAudioDevices, setCameraAudioDevices] = useState([]);
  const [cameraDevicesLoading, setCameraDevicesLoading] = useState(false);
  const [cameraPickerError, setCameraPickerError] = useState('');
  const [cameraManagerTarget, setCameraManagerTarget] = useState(null);
  const [screenStreams, setScreenStreams] = useState({});
  const [captureStatus, setCaptureStatus] = useState('');
  const [addSourceMenuOpen, setAddSourceMenuOpen] = useState(false);
  const imageInputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const themeUploadRef = useRef(null);
  const mediaLibraryUploadRef = useRef(null);
  const pendingImageSourceId = useRef(null);
  const pendingMediaSourceId = useRef(null);
  const plannerScene = { id: 'scene-planner', name: '📺 Planner Content', locked: true, sources: [{ id: 'src-planner', type: 'planner', name: 'Live Planner Preview', visible: true }] };
  const allScenes = [plannerScene, ...obsScenes];
  const activeObsScene = allScenes.find((scene) => scene.id === activeObsSceneId) || allScenes[0];

  const [transitionType, setTransitionType] = useState('Fade');
  const [transitionDuration, setTransitionDuration] = useState(200);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(1);
  const [outgoingSnapshot, setOutgoingSnapshot] = useState(null);
  const transitionTimerRef = useRef(null);
  const recordingFormats = useMemo(() => getSupportedRecordingFormats(), []);
  const initialRecordingFormat = recordingFormats[0] || { id: 'webm', extension: 'webm' };
  const [recordingManagerOpen, setRecordingManagerOpen] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState('idle');
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [recordingError, setRecordingError] = useState('');
  const [recordingCompletion, setRecordingCompletion] = useState(null);
  const [recordingSaveLocation, setRecordingSaveLocation] = useState('');
  const [recordingSettings, setRecordingSettings] = useState(() => ({
    format: initialRecordingFormat.id,
    quality: 'high',
    resolution: '1080p',
    fps: 30,
    filename: createRecordingFilename(initialRecordingFormat.extension),
  }));
  const recordingEngineRef = useRef(null);
  const recordingFileHandleRef = useRef(null);
  const recording = ['selecting', 'recording', 'paused', 'finalizing'].includes(recordingStatus);
  const [studioMode, setStudioMode] = useState(true);
  const [splitScreenMode, setSplitScreenMode] = useState(false);
  const [splitCameraSide, setSplitCameraSide] = useState('left');
  const [splitCameraSourceId, setSplitCameraSourceId] = useState('');

  const activeSplitCameraSourceId = useMemo(() => {
    if (isProjectorMode) return splitCameraSourceId;
    if (splitCameraSourceId && cameraStreams[splitCameraSourceId]) return splitCameraSourceId;
    return Object.keys(cameraStreams).find((sourceId) => cameraStreams[sourceId]?.getVideoTracks?.().some((track) => track.readyState === 'live')) || '';
  }, [cameraStreams, isProjectorMode, splitCameraSourceId]);

  useEffect(() => {
    cameraStreamsRef.current = cameraStreams;
    if (!isProjectorMode) {
      window.__solaCameraStreams = cameraStreams;
      window.__solaGetCameraStream = (sourceId) => cameraStreamsRef.current[sourceId] || null;
      projectorChannelRef.current?.postMessage({ type: 'camera-streams-changed' });
    }
    return () => {
      if (!isProjectorMode && window.__solaCameraStreams === cameraStreams) {
        delete window.__solaCameraStreams;
        delete window.__solaGetCameraStream;
      }
    };
  }, [cameraStreams, isProjectorMode]);

  useEffect(() => {
    if (isProjectorMode || !window.solaDesktop?.isDesktop || !projectorFrameRelayEnabled) return undefined;
    const relays = Object.entries(cameraStreams)
      .filter(([, stream]) => stream?.getVideoTracks?.().some((track) => track.readyState === 'live'))
      .map(([sourceId, stream]) => {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.play().catch(() => null);
        return { sourceId, video, canvas: document.createElement('canvas'), lastSent: 0, sequence: 0, awaitingAck: false };
      });
    if (!relays.length) return undefined;
    const handleFrameAck = (event) => {
      if (event.detail?.resetAll) {
        relays.forEach((item) => { item.awaitingAck = false; });
        return;
      }
      const relay = relays.find((item) => item.sourceId === event.detail?.sourceId);
      if (relay && event.detail?.sequence >= relay.sequence) relay.awaitingAck = false;
    };
    window.addEventListener('sola-camera-frame-ack', handleFrameAck);
    let frameRequest = 0;
    const sendFrames = (time) => {
      if (projectorFrameRelayRequestedRef.current && projectorChannelRef.current) {
        relays.forEach((relay) => {
          if (projectorNativeCameraStreamsRef.current.has(relay.sourceId)) return;
          if (time - relay.lastSent < 160 || relay.video.readyState < 2) return;
          if (relay.awaitingAck) return;
          const sourceWidth = relay.video.videoWidth || 960;
          const sourceHeight = relay.video.videoHeight || 540;
          const scale = Math.min(1, 640 / sourceWidth, 360 / sourceHeight);
          const width = Math.max(2, Math.round(sourceWidth * scale));
          const height = Math.max(2, Math.round(sourceHeight * scale));
          if (relay.canvas.width !== width) relay.canvas.width = width;
          if (relay.canvas.height !== height) relay.canvas.height = height;
          const context = relay.canvas.getContext('2d', { alpha: false });
          if (!context) return;
          try {
            context.drawImage(relay.video, 0, 0, width, height);
            const frame = relay.canvas.toDataURL('image/jpeg', 0.55);
            relay.sequence += 1;
            relay.awaitingAck = true;
            projectorChannelRef.current?.postMessage({ type: 'camera-frame', sourceId: relay.sourceId, sequence: relay.sequence, frame });
            relay.lastSent = time;
          } catch {
            // WebRTC remains the primary path when a frame cannot be sampled.
          }
        });
      }
      frameRequest = window.requestAnimationFrame(sendFrames);
    };
    frameRequest = window.requestAnimationFrame(sendFrames);
    return () => {
      window.cancelAnimationFrame(frameRequest);
      window.removeEventListener('sola-camera-frame-ack', handleFrameAck);
      relays.forEach((relay) => { relay.video.srcObject = null; });
    };
  }, [cameraStreams, isProjectorMode, projectorFrameRelayEnabled]);

  useEffect(() => () => {
    audioInputStreamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    recordingEngineRef.current?.stop();
    audioEngineRef.current?.close();
  }, []);

  useEffect(() => {
    if (recordingStatus !== 'recording' && recordingStatus !== 'paused') return undefined;
    const updateTimer = () => setRecordingElapsedMs(recordingEngineRef.current?.getElapsedMs() || 0);
    updateTimer();
    const timer = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(timer);
  }, [recordingStatus]);

  useEffect(() => {
    if (!audioEngineReady || !audioEngineRef.current) return undefined;
    const engine = audioEngineRef.current;
    const hasSolo = audioChannels.some((channel) => channel.solo);
    audioChannels.forEach((channel) => engine.updateChannel(channel.id, { ...channel, audible: !hasSolo || channel.solo }));
    engine.setMasterVolume(masterVolume);
    engine.setMonitoring(audioMonitoring);
    const timer = window.setInterval(() => {
      const next = {};
      audioChannels.forEach((channel) => { next[channel.id] = engine.readMeter(channel.id); });
      setAudioMeters(next);
    }, 120);
    return () => window.clearInterval(timer);
  }, [audioChannels, audioEngineReady, audioMonitoring, masterVolume]);

  useEffect(() => {
    if (!audioEngineReady || !audioEngineRef.current) return;
    const stream = Object.values(cameraStreams).find((item) => item?.getAudioTracks?.().length);
    if (stream) audioEngineRef.current.attachStream('camera-audio', stream);
  }, [audioEngineReady, cameraStreams]);

  const hasRunningCountdown = useMemo(() => {
    const sceneHasRunningCountdown = (scene) => scene?.sources?.some((source) => source.type === 'countdown' && source.timerRunning);
    return obsScenes.some(sceneHasRunningCountdown)
      || (programContent?.kind === 'obs-scene' && sceneHasRunningCountdown(programContent.scene));
  }, [obsScenes, programContent]);

  useEffect(() => {
    if (!hasRunningCountdown) return undefined;
    const timer = window.setInterval(() => setCountdownTick((value) => value + 1), 500);
    return () => window.clearInterval(timer);
  }, [hasRunningCountdown]);

  const [multiviewOpen, setMultiviewOpen] = useState(false);

  const [themeItems, setThemeItems] = useState(() => mergeBuiltInThemes(ensureCommunionTheme(BUILTIN_THEMES)));
  const [mediaItems, setMediaItems] = useState(SERVICE_MEDIA);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [creatorColor1, setCreatorColor1] = useState('#4a3625');
  const [creatorColor2, setCreatorColor2] = useState('#d4915a');
  const [creatorColor3, setCreatorColor3] = useState('');
  const [creatorAngle, setCreatorAngle] = useState(160);
  const [creatorAnim, setCreatorAnim] = useState('pan');

  const [slidePresentations, setSlidePresentations] = useState(() => ensureCommunionPresentation([
    { id: 'pres1', name: 'Welcome Deck', slides: [{ id: 'sl1', text: 'Welcome to our service' }, { id: 'sl2', text: "We're glad you're here" }] },
  ]));
  const [expandedPresId, setExpandedPresId] = useState(COMMUNION_PRESENTATION.id);
  const [editingSlide, setEditingSlide] = useState(null);

  useEffect(() => {
    installAppStorage();
  }, []);

  useEffect(() => {
    (async () => {
      let legacySongs = [];
      try {
        const saved = await window.storage.get('sola-worship:state-v8');
        if (saved && saved.value) {
          const data = JSON.parse(saved.value);
          if (data.serviceOrder) setServiceOrder(data.serviceOrder);
          if (data.audioChannels) setAudioChannels(data.audioChannels);
          if (data.outputs) setOutputs(data.outputs.map((output) => ({ ...output, kind: output.kind || (output.id === 'stream' ? 'stream' : output.id === 'stage' ? 'stage' : 'display') })));
          if (data.selectedVersion) setSelectedVersion(data.selectedVersion);
          if (data.bibleFontSize) setBibleFontSize(data.bibleFontSize);
          if (data.songFontSize) setSongFontSize(data.songFontSize);
          if (data.slideFontSize) setSlideFontSize(data.slideFontSize);
          if (data.obsScenes) setObsScenes(normalizeObsScenes(data.obsScenes));
          if (data.themeItems) setThemeItems(mergeBuiltInThemes(ensureCommunionTheme(data.themeItems)));
          if (data.mediaItems) setMediaItems(mergeBuiltInMedia(data.mediaItems));
          if (data.slidePresentations) setSlidePresentations(ensureCommunionPresentation(data.slidePresentations));
          if (data.savedSongs) legacySongs = normalizeSavedSongs(data.savedSongs);
        }
        try {
          const response = await fetch('/__sola/song-library', { cache: 'no-store' });
          if (!response.ok) throw new Error('Song library unavailable');
          const diskSongs = await response.json();
          const mergedSongs = mergeSongLibraries(legacySongs, Array.isArray(diskSongs) ? diskSongs : []);
          setSavedSongs(mergedSongs);
          if (legacySongs.length > 0 && mergedSongs.length !== diskSongs.length) {
            await fetch('/__sola/song-library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mergedSongs) });
          }
          setSongLibraryStatus('saved');
        } catch {
          setSavedSongs(legacySongs);
          setSongLibraryStatus('browser-only');
        }
        setStorageStatus('ok');
      } catch {
        setStorageStatus('unavailable');
      }
      setStorageReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!storageReady || storageStatus !== 'ok') return;
    window.clearTimeout(persistenceTimerRef.current);
    persistenceTimerRef.current = window.setTimeout(async () => {
      try {
        await window.storage.set('sola-worship:state-v8', JSON.stringify({ serviceOrder, audioChannels, outputs, selectedVersion, bibleFontSize, songFontSize, slideFontSize, obsScenes, themeItems, mediaItems, slidePresentations, savedSongs }));
      } catch {
        // ignore persistence errors
      }
    }, 500);
    return () => window.clearTimeout(persistenceTimerRef.current);
  }, [serviceOrder, audioChannels, outputs, selectedVersion, bibleFontSize, songFontSize, slideFontSize, obsScenes, themeItems, mediaItems, slidePresentations, savedSongs, storageReady, storageStatus]);

  useEffect(() => {
    const applyProjectorState = (state) => {
      if (!state) return;
      setProgramContent(state.programContent ?? null);
      if (state.stagedContent) setStagedContent(state.stagedContent);
      setIsBlack(Boolean(state.isBlack));
      setTextCleared(Boolean(state.textCleared));
      if (state.activeBackground) setActiveBackground(state.activeBackground);
      if (state.selectedVersion) setSelectedVersion(state.selectedVersion);
      if (state.transitionType) setTransitionType(state.transitionType);
      if (Number.isFinite(state.transitionDuration)) setTransitionDuration(state.transitionDuration);
      setSplitScreenMode(Boolean(state.splitScreenMode));
      if (state.splitCameraSide) setSplitCameraSide(state.splitCameraSide);
      if (state.splitCameraSourceId) setSplitCameraSourceId(state.splitCameraSourceId);
      if (state.transitioning && state.outgoingSnapshot) {
        setOutgoingSnapshot(state.outgoingSnapshot);
        setTransitioning(true);
        const transitionId = state.transitionId ?? `${state.programContent?.kind || 'content'}-${state.transitionDuration || 0}`;
        if (appliedProjectorTransitionRef.current !== transitionId) {
          appliedProjectorTransitionRef.current = transitionId;
          setTransitionProgress(0);
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => setTransitionProgress(1)));
        }
      } else {
        appliedProjectorTransitionRef.current = null;
        setTransitioning(false);
        setOutgoingSnapshot(null);
        setTransitionProgress(1);
      }
    };
    const handleStorage = (event) => {
      if (!isProjectorMode || event.key !== 'sola-worship:projector' || !event.newValue) return;
      try { applyProjectorState(JSON.parse(event.newValue)); } catch { /* ignore malformed projector state */ }
    };
    const desktopTransport = window.solaDesktop?.sendProjectorMessage && window.solaDesktop?.onProjectorMessage;
    if (!desktopTransport) window.addEventListener('storage', handleStorage);
    const channel = !desktopTransport && typeof BroadcastChannel === 'function' ? new BroadcastChannel('sola-worship-projector') : null;
    const transport = desktopTransport
      ? { postMessage: (message) => window.solaDesktop.sendProjectorMessage(message) }
      : channel;
    if (!transport) return () => window.removeEventListener('storage', handleStorage);
    projectorChannelRef.current = transport;
    const handleProjectorMessage = async (event) => {
      const message = event.data || {};
      if (isProjectorMode && message.type === 'program-state') applyProjectorState(message.state);
      if (isProjectorMode && message.type === 'camera-streams-changed') setProjectorStreamRevision((value) => value + 1);
      if (!isProjectorMode && message.type === 'projector-ready') {
        projectorFrameRelayRequestedRef.current = true;
        projectorNativeCameraStreamsRef.current.clear();
        setProjectorFrameRelayEnabled(false);
        window.setTimeout(() => {
          if (projectorNativeCameraStreamsRef.current.size === 0) setProjectorFrameRelayEnabled(true);
        }, 3000);
        window.dispatchEvent(new CustomEvent('sola-camera-frame-ack', { detail: { sourceId: '', sequence: Number.MAX_SAFE_INTEGER, resetAll: true } }));
        transport.postMessage({ type: 'program-state', state: projectorStateRef.current });
        transport.postMessage({ type: 'camera-streams-changed' });
      }
      if (isProjectorMode && message.type === 'camera-frame' && message.sourceId && message.frame) {
        if (!window.__solaCameraFrameStore) window.__solaCameraFrameStore = {};
        window.__solaCameraFrameStore[message.sourceId] = message.frame;
        window.dispatchEvent(new CustomEvent('sola-camera-frame', { detail: { sourceId: message.sourceId, frame: message.frame } }));
        setCameraStreams((current) => current[message.sourceId]?.getVideoTracks || current[message.sourceId]?.relaySourceId
          ? current
          : { ...current, [message.sourceId]: { relaySourceId: message.sourceId } });
        transport.postMessage({ type: 'camera-frame-ack', sourceId: message.sourceId, sequence: message.sequence || 0 });
      }
      if (!isProjectorMode && message.type === 'camera-frame-ack' && message.sourceId) {
        window.dispatchEvent(new CustomEvent('sola-camera-frame-ack', { detail: message }));
      }
      if (!isProjectorMode && message.type === 'camera-stream-live' && message.sourceId) {
        projectorNativeCameraStreamsRef.current.add(message.sourceId);
        setProjectorFrameRelayEnabled(false);
      }
      try {
        if (isProjectorMode && message.type === 'camera-stream-unavailable') {
          const entry = projectorCameraStreamsRef.current.get(message.sourceId);
          if (entry?.requestId === message.requestId) {
            window.setTimeout(() => {
              if (projectorCameraStreamsRef.current.get(message.sourceId) === entry) {
                projectorPeerConnectionsRef.current.get(entry.requestId)?.close();
                projectorPeerConnectionsRef.current.delete(entry.requestId);
                projectorCameraStreamsRef.current.delete(message.sourceId);
                setProjectorStreamRevision((value) => value + 1);
              }
            }, 750);
          }
        }
        if (!isProjectorMode && message.type === 'camera-stream-request') {
          projectorNativeCameraStreamsRef.current.delete(message.sourceId);
          window.setTimeout(() => {
            if (!projectorNativeCameraStreamsRef.current.has(message.sourceId)) setProjectorFrameRelayEnabled(true);
          }, 3000);
          const stream = cameraStreamsRef.current[message.sourceId];
          if (!stream?.getTracks?.().length) {
            transport.postMessage({ type: 'camera-stream-unavailable', requestId: message.requestId, sourceId: message.sourceId });
            return;
          }
          projectorPeerConnectionsRef.current.get(message.requestId)?.close();
          const peer = new RTCPeerConnection();
          projectorPeerConnectionsRef.current.set(message.requestId, peer);
          stream.getTracks().forEach((track) => peer.addTrack(track, stream));
          peer.onicecandidate = (iceEvent) => {
            if (iceEvent.candidate) transport.postMessage({ type: 'camera-ice', to: 'projector', requestId: message.requestId, candidate: iceEvent.candidate.toJSON() });
          };
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          transport.postMessage({
            type: 'camera-offer',
            requestId: message.requestId,
            sourceId: message.sourceId,
            sdp: { type: peer.localDescription.type, sdp: peer.localDescription.sdp },
          });
        }
        if (isProjectorMode && message.type === 'camera-offer') {
          const requestedEntry = projectorCameraStreamsRef.current.get(message.sourceId);
          if (requestedEntry?.requestId !== message.requestId) return;
          projectorPeerConnectionsRef.current.get(message.requestId)?.close();
          const peer = new RTCPeerConnection();
          projectorPeerConnectionsRef.current.set(message.requestId, peer);
          peer.onconnectionstatechange = () => {
            if (peer.connectionState !== 'failed' && peer.connectionState !== 'disconnected') return;
            window.setTimeout(() => {
              const entry = projectorCameraStreamsRef.current.get(message.sourceId);
              if (entry?.requestId !== message.requestId || peer.connectionState === 'connected') return;
              peer.close();
              projectorPeerConnectionsRef.current.delete(message.requestId);
              projectorCameraStreamsRef.current.delete(message.sourceId);
              setCameraStreams((current) => {
                const next = { ...current };
                delete next[message.sourceId];
                return next;
              });
              setProjectorStreamRevision((value) => value + 1);
            }, 1500);
          };
          peer.ontrack = (trackEvent) => {
            const stream = trackEvent.streams[0] || new MediaStream([trackEvent.track]);
            const entry = projectorCameraStreamsRef.current.get(message.sourceId);
            if (entry?.requestId !== message.requestId) return;
            entry.stream = stream;
            setCameraStreams((current) => ({ ...current, [message.sourceId]: stream }));
            transport.postMessage({ type: 'camera-stream-live', sourceId: message.sourceId, requestId: message.requestId });
          };
          peer.onicecandidate = (iceEvent) => {
            if (iceEvent.candidate) transport.postMessage({ type: 'camera-ice', to: 'controller', requestId: message.requestId, candidate: iceEvent.candidate.toJSON() });
          };
          await peer.setRemoteDescription(message.sdp);
          const queued = pendingProjectorIceRef.current.get(message.requestId) || [];
          for (const candidate of queued) await peer.addIceCandidate(candidate);
          pendingProjectorIceRef.current.delete(message.requestId);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          transport.postMessage({
            type: 'camera-answer',
            requestId: message.requestId,
            sdp: { type: peer.localDescription.type, sdp: peer.localDescription.sdp },
          });
        }
        if (!isProjectorMode && message.type === 'camera-answer') {
          const peer = projectorPeerConnectionsRef.current.get(message.requestId);
          if (peer) {
            await peer.setRemoteDescription(message.sdp);
            const queued = pendingProjectorIceRef.current.get(message.requestId) || [];
            for (const candidate of queued) await peer.addIceCandidate(candidate);
            pendingProjectorIceRef.current.delete(message.requestId);
          }
        }
        if (message.type === 'camera-ice' && ((isProjectorMode && message.to === 'projector') || (!isProjectorMode && message.to === 'controller'))) {
          const peer = projectorPeerConnectionsRef.current.get(message.requestId);
          if (!peer?.remoteDescription) pendingProjectorIceRef.current.set(message.requestId, [...(pendingProjectorIceRef.current.get(message.requestId) || []), message.candidate]);
          else await peer.addIceCandidate(message.candidate);
        }
      } catch (error) {
        console.warn('Projector camera bridge failed', error);
      }
    };
    const removeDesktopListener = desktopTransport
      ? window.solaDesktop.onProjectorMessage((message) => handleProjectorMessage({ data: message }))
      : null;
    if (channel) channel.onmessage = handleProjectorMessage;
    if (isProjectorMode) transport.postMessage({ type: 'projector-ready' });
    return () => {
      window.removeEventListener('storage', handleStorage);
      projectorChannelRef.current = null;
      removeDesktopListener?.();
      channel?.close();
    };
  }, [isProjectorMode]);

  useEffect(() => {
    if (isProjectorMode) return;
    const state = { programContent, stagedContent, isBlack, textCleared, activeBackground, selectedVersion, transitionType, transitionDuration, transitioning, outgoingSnapshot, transitionId: transitionSequenceRef.current, splitScreenMode, splitCameraSide, splitCameraSourceId: activeSplitCameraSourceId };
    projectorStateRef.current = state;
    projectorChannelRef.current?.postMessage({ type: 'program-state', state });
    if (!window.solaDesktop?.isDesktop) {
      try { window.localStorage.setItem('sola-worship:projector', JSON.stringify(state)); } catch { /* storage is optional */ }
    }
  }, [isProjectorMode, programContent, stagedContent, isBlack, textCleared, activeBackground, selectedVersion, transitionType, transitionDuration, transitioning, outgoingSnapshot, splitScreenMode, splitCameraSide, activeSplitCameraSourceId]);

  useEffect(() => {
    if (remoteDisplayPairCode) return undefined;
    const refreshPairCode = () => setPresentationPairCode(window.sessionStorage.getItem('sola-camera-pair-code') || '');
    refreshPairCode();
    const timer = window.setInterval(refreshPairCode, 1000);
    return () => window.clearInterval(timer);
  }, [remoteDisplayPairCode]);

  useEffect(() => {
    if (!presentationPairCode) return undefined;
    let closed = false;
    let reconnectTimer;
    const socketUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/__sola/camera-signal`;
    const connect = () => {
      const socket = new WebSocket(socketUrl);
      remotePresentationSocketRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'register', role: remoteDisplayPairCode ? 'presentation-display' : 'presentation-controller', pairCode: presentationPairCode }));
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (remoteDisplayPairCode && message.type === 'presentation-state' && message.state) {
            setProgramContent(message.state.programContent ?? null);
            if (message.state.stagedContent) setStagedContent(message.state.stagedContent);
            setIsBlack(Boolean(message.state.isBlack));
            setTextCleared(Boolean(message.state.textCleared));
            if (message.state.activeBackground) setActiveBackground(message.state.activeBackground);
            if (message.state.selectedVersion) setSelectedVersion(message.state.selectedVersion);
            if (message.state.transitionType) setTransitionType(message.state.transitionType);
            if (Number.isFinite(message.state.transitionDuration)) setTransitionDuration(message.state.transitionDuration);
            setSplitScreenMode(Boolean(message.state.splitScreenMode));
            if (message.state.splitCameraSide) setSplitCameraSide(message.state.splitCameraSide);
            if (message.state.splitCameraSourceId) setSplitCameraSourceId(message.state.splitCameraSourceId);
            if (message.state.transitioning && message.state.outgoingSnapshot) {
              setOutgoingSnapshot(message.state.outgoingSnapshot);
              setTransitioning(true);
              const transitionId = message.state.transitionId ?? `${message.state.programContent?.kind || 'content'}-${message.state.transitionDuration || 0}`;
              if (appliedProjectorTransitionRef.current !== transitionId) {
                appliedProjectorTransitionRef.current = transitionId;
                setTransitionProgress(0);
                window.requestAnimationFrame(() => window.requestAnimationFrame(() => setTransitionProgress(1)));
              }
            } else {
              appliedProjectorTransitionRef.current = null;
              setTransitioning(false);
              setOutgoingSnapshot(null);
              setTransitionProgress(1);
            }
          }
          if (!remoteDisplayPairCode && message.type === 'presentation-display-ready' && projectorStateRef.current) {
            socket.send(JSON.stringify({ type: 'presentation-state', state: projectorStateRef.current }));
          }
        } catch { /* ignore malformed remote display messages */ }
      };
      socket.onclose = () => {
        if (!closed) reconnectTimer = window.setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(reconnectTimer);
      remotePresentationSocketRef.current?.close();
      remotePresentationSocketRef.current = null;
    };
  }, [presentationPairCode, remoteDisplayPairCode]);

  useEffect(() => {
    if (isProjectorMode || !projectorStateRef.current || remotePresentationSocketRef.current?.readyState !== WebSocket.OPEN) return;
    remotePresentationSocketRef.current.send(JSON.stringify({ type: 'presentation-state', state: projectorStateRef.current }));
  }, [isProjectorMode, programContent, stagedContent, isBlack, textCleared, activeBackground, selectedVersion, transitionType, transitionDuration, transitioning, outgoingSnapshot, splitScreenMode, splitCameraSide, activeSplitCameraSourceId]);

  useEffect(() => {
    if (!isProjectorMode) return undefined;
    const cameraSources = programContent?.kind === 'obs-scene'
      ? (programContent.scene?.sources || []).filter((source) => source.visible && (source.type === 'camera' || source.type === 'phone-camera'))
      : [];
    if (splitScreenMode && activeSplitCameraSourceId && !cameraSources.some((source) => source.id === activeSplitCameraSourceId)) cameraSources.push({ id: activeSplitCameraSourceId, type: 'camera', visible: true });
    const wantedIds = new Set(cameraSources.map((source) => source.id));

    projectorCameraStreamsRef.current.forEach((entry, sourceId) => {
      if (wantedIds.has(sourceId)) return;
      projectorPeerConnectionsRef.current.get(entry.requestId)?.close();
      projectorPeerConnectionsRef.current.delete(entry.requestId);
      projectorCameraStreamsRef.current.delete(sourceId);
      setCameraStreams((current) => {
        const next = { ...current };
        delete next[sourceId];
        return next;
      });
    });

    cameraSources.forEach((source) => {
      const existing = projectorCameraStreamsRef.current.get(source.id);
      let directlySharedStream = null;
      try {
        const controllerWindow = window.opener || window.top?.opener;
        directlySharedStream = controllerWindow?.__solaGetCameraStream?.(source.id) || controllerWindow?.__solaCameraStreams?.[source.id] || null;
      } catch {
        // A separately hosted display cannot access its opener; WebRTC below handles it.
      }
      if (directlySharedStream?.getVideoTracks?.().some((track) => track.readyState === 'live')) {
        if (existing?.stream === directlySharedStream) return;
        if (existing?.requestId) {
          projectorPeerConnectionsRef.current.get(existing.requestId)?.close();
          projectorPeerConnectionsRef.current.delete(existing.requestId);
        }
        projectorCameraStreamsRef.current.set(source.id, { requestId: null, stream: directlySharedStream });
        setCameraStreams((current) => ({ ...current, [source.id]: directlySharedStream }));
        return;
      }
      if (existing) return;
      const requestId = `projector-camera-${source.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const entry = { requestId, stream: null };
      projectorCameraStreamsRef.current.set(source.id, entry);
      projectorChannelRef.current?.postMessage({ type: 'camera-stream-request', requestId, sourceId: source.id });
    });
    const retryTimer = window.setTimeout(() => {
      let shouldRetry = false;
      projectorCameraStreamsRef.current.forEach((entry, sourceId) => {
        if (entry.stream) return;
        projectorPeerConnectionsRef.current.get(entry.requestId)?.close();
        projectorPeerConnectionsRef.current.delete(entry.requestId);
        projectorCameraStreamsRef.current.delete(sourceId);
        shouldRetry = true;
      });
      if (shouldRetry) setProjectorStreamRevision((value) => value + 1);
    }, 5000);
    return () => window.clearTimeout(retryTimer);
  }, [isProjectorMode, programContent, projectorStreamRevision, splitScreenMode, activeSplitCameraSourceId]);

  useEffect(() => () => {
    projectorPeerConnectionsRef.current.forEach((peer) => peer.close());
    projectorPeerConnectionsRef.current.clear();
    pendingProjectorIceRef.current.clear();
    projectorCameraStreamsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!storageReady) return undefined;
    const timer = window.setTimeout(async () => {
      setSongLibraryStatus('saving');
      try {
        const response = await fetch('/__sola/song-library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(savedSongs) });
        if (!response.ok) throw new Error('Song library save failed');
        setSongLibraryStatus('saved');
      } catch {
        setSongLibraryStatus('browser-only');
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [savedSongs, storageReady]);

  useEffect(() => {
    const handler = () => {
      setContextMenu(null);
      setRadialOpen(false);
      setOpenListVisible(false);
      setLiveOutputsOpen(false);
      setAddSourceMenuOpen(false);
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  const selectedBibleData = loadedBibleVersions[selectedVersion] || null;
  const bibleSearchResults = useMemo(
    () => selectedBibleData ? searchBibleVersion(searchQuery, selectedVersion, 100) : [],
    [searchQuery, selectedVersion, selectedBibleData],
  );

  useEffect(() => {
    let active = true;
    if (loadedBibleVersions[selectedVersion]) return undefined;
    const loadBible = async () => {
      setBibleLoading(true);
      setBibleLoadError(null);
      try {
        const loaded = await fetchBibleVersion(selectedVersion);
        if (!active) return;
        setLoadedBibleVersion(selectedVersion, loaded);
        setLoadedBibleVersions((current) => ({ ...current, [selectedVersion]: loaded }));
      } catch (error) {
        if (!active) return;
        setBibleLoadError(error.message || 'Failed to load Bible version.');
      } finally {
        if (active) setBibleLoading(false);
      }
    };
    loadBible();
    return () => { active = false; };
  }, [selectedVersion, loadedBibleVersions]);

  useEffect(() => {
    if (!pointerDragId) return undefined;
    const handleMove = (event) => {
      const y = event.clientY;
      for (const item of serviceOrder) {
        if (item.id === pointerDragId) continue;
        const element = serviceItemRefs.current[item.id];
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          setServiceOrder((current) => {
            const next = [...current];
            const fromIndex = next.findIndex((entry) => entry.id === pointerDragId);
            const toIndex = next.findIndex((entry) => entry.id === item.id);
            if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return current;
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return next;
          });
          break;
        }
      }
    };
    const handleUp = () => setPointerDragId(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [pointerDragId, serviceOrder]);

  useEffect(() => {
    const handler = (event) => {
      if (!(mediaTab === 'bible' && bibleSubTab === 'testament' && bibleView === 'verses')) return;
      if (!event.shiftKey || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
      if (focusedVerse == null || verseAnchor == null || !selectedBook || !selectedChapter) return;
      event.preventDefault();
    const maxVerse = verseCountFor(selectedBook.name, selectedChapter, selectedVersion);
      let nextFocus = focusedVerse + (event.key === 'ArrowDown' ? 1 : -1);
      nextFocus = Math.max(1, Math.min(maxVerse, nextFocus));
      setFocusedVerse(nextFocus);
      const lower = Math.min(verseAnchor, nextFocus);
      const upper = Math.max(verseAnchor, nextFocus);
      const range = [];
      for (let verse = lower; verse <= upper; verse += 1) range.push(verse);
      setSelectedVerses(range);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mediaTab, bibleSubTab, bibleView, focusedVerse, verseAnchor, selectedBook, selectedChapter, selectedVersion]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return undefined;
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        let text = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) text += event.results[index][0].transcript;
        setAiQuery(text);
      };
      recognition.onend = () => setListening(false);
      recognition.onerror = (event) => {
        setListening(false);
        setVoiceError(event.error === 'not-allowed' ? 'Microphone permission denied.' : event.error === 'network' ? 'Speech service unreachable (needs internet access).' : `Recognition error: ${event.error}`);
      };
      recognitionRef.current = recognition;
    } catch {
      window.queueMicrotask(() => setVoiceSupported(false));
    }
    return undefined;
  }, []);

  const startListening = async () => {
    if (!recognitionRef.current) return;
    if (listening) {
      try { recognitionRef.current.stop(); } catch { /* recognition may already be stopped */ }
      setListening(false);
      return;
    }
    setVoiceError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      recognitionRef.current.start();
      setListening(true);
    } catch {
      setVoiceError('Microphone unavailable — this preview\'s sandbox may not grant mic access. An external/USB mic works automatically if set as your OS default input; type your search instead if it stays blocked.');
      setListening(false);
    }
  };

  const bibleTextFor = useCallback((book, chapter, verse) => (
    selectedVersion === 'yor' || selectedLanguage === 'en'
      ? getVerseText(book, chapter, verse, selectedVersion)
      : translateVerse(book, chapter, verse, selectedVersion, selectedLanguage)
  ), [selectedLanguage, selectedVersion]);

  const liveGuess = useMemo(() => aiQuery ? findLiveVerseMatch(aiQuery) : null, [aiQuery]);

  useEffect(() => {
    if (!aiQuery) return;
    const match = liveGuess;
    if (match) {
      const { book, chapter, verse } = parseRef(match.ref);
      const base = getVerseText(book, chapter, verse, selectedVersion);
      if (selectedLanguage && selectedLanguage !== 'en') {
        (async () => {
          try {
            const translated = await translateText(base, selectedLanguage);
            setStagedContent({ kind: 'verse', book, chapter, verse, text: translated });
          } catch {
            setStagedContent({ kind: 'verse', book, chapter, verse, text: bibleTextFor(book, chapter, verse) });
          }
        })();
      } else {
        window.queueMicrotask(() => setStagedContent({ kind: 'verse', book, chapter, verse, text: bibleTextFor(book, chapter, verse) }));
      }
    }
  }, [aiQuery, bibleTextFor, liveGuess, selectedLanguage, selectedVersion]);

  const bibleVersions = Object.values(BIBLE_VERSION_FILES);
  const books = BIBLE_BOOKS[testament];
  const filteredVerseNumbers = () => {
    if (!selectedBook || !selectedChapter) return [];
    const total = verseCountFor(selectedBook.name, selectedChapter, selectedVersion);
    const all = Array.from({ length: total }, (_, index) => index + 1);
    if (!searchQuery.trim()) return all;
    const q = searchQuery.toLowerCase();
    return all.filter((verse) => bibleTextFor(selectedBook.name, selectedChapter, verse).toLowerCase().includes(q) || String(verse) === searchQuery.trim());
  };
  const filteredBooks = books.filter((book) => book.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const isAudioQuery = aiQuery.toLowerCase().includes('audio') || aiQuery.toLowerCase().includes('source');
  const audioResults = isAudioQuery ? audioChannels : [];
  const keywordMatches = !isAudioQuery ? searchVerseTopicsByKeyword(aiQuery) : [];

  const toggleMute = (id) => setAudioChannels((current) => current.map((channel) => (channel.id === id ? { ...channel, muted: !channel.muted } : channel)));
  const setLevel = (id, level) => setAudioChannels((current) => current.map((channel) => (channel.id === id ? { ...channel, level } : channel)));
  const iconFor = (icon) => icon === 'monitor' ? <Monitor size={14} color="#8b93a7" /> : icon === 'mic' ? <Mic size={14} color="#8b93a7" /> : icon === 'camera' ? <CameraIcon size={14} color="#8b93a7" /> : <FileText size={14} color="#8b93a7" />;

  const enableAudioEngine = async () => {
    if (!audioEngineRef.current) audioEngineRef.current = new Audio.SolaAudioEngine();
    await audioEngineRef.current.start();
    setAudioEngineReady(true);
  };

  const connectAudioInput = async (channel) => {
    try {
      await enableAudioEngine();
      let stream;
      if (channel.inputType === 'microphone') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } else if (channel.inputType === 'desktop') {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        if (stream.getAudioTracks().length === 0) {
          stream.getTracks().forEach((track) => track.stop());
          showAlert('No system audio', 'The selected screen or browser did not provide an audio track. Enable Share audio in the browser picker where available.');
          return;
        }
      } else if (channel.inputType === 'camera') {
        stream = Object.values(cameraStreams).find((item) => item?.getAudioTracks?.().length);
        if (!stream) { showAlert('No camera audio', 'Connect a camera that provides an audio track first.'); return; }
      } else if (channel.inputType === 'media') {
        const mediaSource = activeObsScene?.sources.find((source) => (source.type === 'video' || source.type === 'audio') && source.dataUrl);
        if (!mediaSource) { showAlert('No media audio', 'Add a video or audio source to the selected scene first.'); return; }
        if (mediaAudioElementRef.current) mediaAudioElementRef.current.pause();
        const element = new window.Audio(mediaSource.dataUrl);
        element.loop = true;
        mediaAudioElementRef.current = element;
        audioEngineRef.current.attachElement(channel.id, element);
        await element.play();
        setAudioChannels((current) => current.map((item) => item.id === channel.id ? { ...item, available: 'connected to scene media' } : item));
        return;
      }
      audioInputStreamsRef.current.get(channel.id)?.getTracks().forEach((track) => track.stop());
      audioInputStreamsRef.current.set(channel.id, stream);
      audioEngineRef.current.attachStream(channel.id, stream);
      setAudioChannels((current) => current.map((item) => item.id === channel.id ? { ...item, available: 'connected' } : item));
    } catch (error) {
      showAlert('Audio input unavailable', error?.name === 'NotAllowedError' ? 'Permission was denied.' : 'This audio input could not be opened in the browser.');
    }
  };

  const getRecordingEngine = () => {
    if (!recordingEngineRef.current) {
      recordingEngineRef.current = new SolaRecordingEngine({
        onStatus: (status, detail) => {
          setRecordingStatus(status);
          if (status === 'error' && detail?.error) setRecordingError(detail.error.message || 'Recording failed.');
        },
        onComplete: (completion) => {
          setRecordingElapsedMs(completion.durationMs);
          setRecordingCompletion(completion);
        },
        onError: (error) => setRecordingError(error?.message || 'Recording failed.'),
      });
    }
    return recordingEngineRef.current;
  };

  const updateRecordingSettings = (nextSettings) => {
    if (nextSettings.format !== recordingSettings.format) {
      const format = recordingFormats.find((item) => item.id === nextSettings.format) || recordingFormats[0];
      const baseName = recordingSettings.filename.replace(/\.[^.]+$/, '');
      nextSettings = { ...nextSettings, filename: `${baseName}.${format?.extension || 'webm'}` };
      recordingFileHandleRef.current = null;
      setRecordingSaveLocation('');
    }
    setRecordingSettings(nextSettings);
  };

  const chooseRecordingLocation = async () => {
    const format = recordingFormats.find((item) => item.id === recordingSettings.format) || recordingFormats[0];
    if (!format || !window.showSaveFilePicker) return;
    try {
      const handle = await chooseRecordingFile(format, recordingSettings.filename);
      if (!handle) return;
      recordingFileHandleRef.current = handle;
      setRecordingSaveLocation(handle.name);
      setRecordingSettings((current) => ({ ...current, filename: handle.name }));
      setRecordingError('');
    } catch (error) {
      if (error?.name !== 'AbortError') setRecordingError(error?.message || 'The save location could not be selected.');
    }
  };

  const startProgramRecording = async () => {
    if (!programContent || isBlack) {
      setRecordingError('Send a scene or planner item to Program before recording.');
      return;
    }
    setRecordingError('');
    setRecordingCompletion(null);
    setRecordingElapsedMs(0);
    try {
      await enableAudioEngine();
      await getRecordingEngine().start({
        settings: recordingSettings,
        audioStream: audioEngineRef.current?.getProgramStream(),
        fileHandle: recordingFileHandleRef.current,
      });
    } catch (error) {
      const message = error?.name === 'NotAllowedError'
        ? 'Program capture permission was denied. Start again and select the Sola Worship projector tab.'
        : error?.message || 'Recording could not start.';
      setRecordingError(message);
      setRecordingStatus('error');
    }
  };

  const verseContent = (book, chapter, verse) => ({ kind: 'verse', book, chapter, verse, text: bibleTextFor(book, chapter, verse), fontSize: bibleFontSize });
  const resolveVerseContent = async (book, chapter, verse) => {
    const text = selectedVersion === 'yor' || selectedLanguage === 'en'
      ? await getVerseTextAsync(book, chapter, verse, selectedVersion)
      : bibleTextFor(book, chapter, verse);
    return { kind: 'verse', book, chapter, verse, text, version: selectedVersion, fontSize: bibleFontSize };
  };
  const pushLive = (content) => { setStagedContent(content); transitionToProgram(content); };

  const stageVerse = async (verse) => setStagedContent(await resolveVerseContent(selectedBook.name, selectedChapter, verse));
  const liveVerse = async (verse) => pushLive(await resolveVerseContent(selectedBook.name, selectedChapter, verse));
  const stageAiVerse = async (match) => {
    const { book, chapter, verse } = parseRef(match.ref);
    setStagedContent(await resolveVerseContent(book, chapter, verse));
  };
  const liveSearchVerse = async (match) => {
    const { book, chapter, verse } = parseRef(match.ref);
    pushLive(await resolveVerseContent(book, chapter, verse));
  };
  const stageSongSlide = (slide) => setStagedContent({ kind: 'song-slide', song: activeSong, slide, fontSize: songFontSize });
  const liveSongSlide = (slide) => pushLive({ kind: 'song-slide', song: activeSong, slide, fontSize: songFontSize });
  const applyPresentationTheme = (presentation) => {
    if (!presentation.themeId) return;
    const theme = themeItems.find((item) => item.id === presentation.themeId);
    if (theme) setActiveBackground(theme);
  };
  const stageSlide = (presentation, slide) => {
    applyPresentationTheme(presentation);
    setStagedContent({ kind: 'slide-deck', presentation, slide, fontSize: slideFontSize });
  };
  const liveSlide = (presentation, slide) => {
    applyPresentationTheme(presentation);
    pushLive({ kind: 'slide-deck', presentation, slide, fontSize: slideFontSize });
  };
  const stageMediaBg = (item) => setStagedContent({ kind: 'media-bg', item });
  const liveMediaBg = (item) => pushLive({ kind: 'media-bg', item });

  const handleVerseClick = (verse, shiftKey) => {
    if (shiftKey && verseAnchor != null) {
      const lower = Math.min(verseAnchor, verse);
      const upper = Math.max(verseAnchor, verse);
      const range = [];
      for (let index = lower; index <= upper; index += 1) range.push(index);
      setSelectedVerses(range);
      setFocusedVerse(verse);
    } else {
      setVerseAnchor(verse);
      setFocusedVerse(verse);
      setSelectedVerses([verse]);
      stageVerse(verse);
    }
  };
  const addSelectedVersesToService = () => {
    if (selectedVerses.length === 0) return;
    const sorted = [...selectedVerses].sort((left, right) => left - right);
    const slides = sorted.map((verse) => ({ id: 'vs' + verse, label: `${selectedBook.name} ${selectedChapter}:${verse}`, text: bibleTextFor(selectedBook.name, selectedChapter, verse) }));
    setServiceOrder((current) => [...current, { id: nextServiceId++, name: `${selectedBook.name} ${selectedChapter} (${sorted.length} verses)`, type: 'verse-set', duration: '—', slides }]);
    setSelectedVerses([]);
  };

  const contentForServiceItem = (item) => {
    if (item.content) return item.content;
    if (item.slides && item.slides.length) return { kind: 'song-slide', song: { title: item.name, artist: item.artist }, slide: item.slides[0], fontSize: item.fontSize || songFontSize };
    return { kind: 'service', index: serviceOrder.indexOf(item) };
  };
  const stageServiceItem = (index) => setStagedContent(contentForServiceItem(serviceOrder[index]));
  const liveServiceItem = (index) => pushLive(contentForServiceItem(serviceOrder[index]));

  const goLive = () => {
    transitionToProgram(stagedContent);
  };
  const toggleBlack = () => setIsBlack((current) => !current);
  const toggleClearText = () => setTextCleared((current) => !current);

  const addServiceItem = () => {
    const name = newItemName.trim() || 'New Item';
    setServiceOrder((current) => [...current, { id: nextServiceId++, name, type: 'slide', duration: '—' }]);
    setNewItemName('');
    setAddingItem(false);
  };
  const removeServiceItem = (id) => { setServiceOrder((current) => current.filter((item) => item.id !== id)); setContextMenu(null); };
  const startEdit = (item) => { setEditingId(item.id); setEditName(item.name); setEditDuration(item.duration || ''); setContextMenu(null); };
  const saveEdit = (id) => { setServiceOrder((current) => current.map((item) => item.id === id ? { ...item, name: editName || item.name, duration: editDuration } : item)); setEditingId(null); };

  const handleServiceDrop = (event) => {
    event.preventDefault();
    try {
      const data = JSON.parse(event.dataTransfer.getData('application/json'));
      if (data.dragKind === 'verse') setServiceOrder((current) => [...current, { id: nextServiceId++, name: `${data.book} ${data.chapter}:${data.verse}`, type: 'verse', duration: '—', content: verseContent(data.book, data.chapter, data.verse) }]);
      else if (data.dragKind === 'song') setServiceOrder((current) => [...current, { id: nextServiceId++, name: data.song.title, type: 'song', duration: '—', artist: data.song.artist, slides: data.slides }]);
    } catch { /* ignore unsupported drag payloads */ }
  };
  const addVerseToService = (book, chapter, verse) => setServiceOrder((current) => [...current, { id: nextServiceId++, name: `${book} ${chapter}:${verse}`, type: 'verse', duration: '—', content: verseContent(book, chapter, verse) }]);
  const addSongToService = (song, slides) => setServiceOrder((current) => [...current, { id: nextServiceId++, name: song.title, type: 'song', duration: '—', artist: song.artist, slides, fontSize: songFontSize }]);
  const newProject = () => showConfirm('Start a new project? Unsaved changes will be lost.', () => { setServiceOrder([]); setProgramContent(null); setStagedContent({ kind: 'service', index: 0 }); setRadialOpen(false); });
  const saveProject = () => { setRadialOpen(false); showPrompt('Save project as:', 'My Service', async (name) => { if (!name) return; try { await window.storage.set(`sola-worship:project:${name}`, JSON.stringify({ serviceOrder, obsScenes, audioChannels, outputs, bibleFontSize, songFontSize, slideFontSize, themeItems, mediaItems, slidePresentations })); showAlert('Saved', `Project "${name}" saved.`); } catch { showAlert('Save failed', 'Storage unavailable.'); } }); };
  const openMenuClicked = async (event) => { event.stopPropagation(); try { const list = await window.storage.list('sola-worship:project:'); setSavedProjects((list && list.keys) || []); } catch { setSavedProjects([]); } setOpenListVisible((current) => !current); };
  const loadProject = async (key) => {
    try {
      const response = await window.storage.get(key);
      if (response && response.value) {
        const data = JSON.parse(response.value);
        if (data.serviceOrder) setServiceOrder(data.serviceOrder);
        if (data.obsScenes) setObsScenes(normalizeObsScenes(data.obsScenes));
        if (data.audioChannels) setAudioChannels(data.audioChannels);
        if (data.outputs) setOutputs(data.outputs);
        if (data.bibleFontSize) setBibleFontSize(data.bibleFontSize);
        if (data.songFontSize) setSongFontSize(data.songFontSize);
        if (data.slideFontSize) setSlideFontSize(data.slideFontSize);
        if (data.themeItems) setThemeItems(mergeBuiltInThemes(ensureCommunionTheme(data.themeItems)));
        if (data.mediaItems) setMediaItems(mergeBuiltInMedia(data.mediaItems));
        if (data.slidePresentations) setSlidePresentations(ensureCommunionPresentation(data.slidePresentations));
      }
      setOpenListVisible(false); setRadialOpen(false);
    } catch { showAlert('Load failed', 'Could not load that project.'); }
  };

  const runSongSearch = async () => {
    const query = songQuery.trim();
    if (!query) return;
    const requestId = ++songSearchRequestRef.current;
    songResultRequestRef.current += 1;
    setSongResultLoadingId(null);
    setSongLoading(true); setSongResults([]); setSongSourceNote('');

    const normalizedQuery = query.toLowerCase();
    const savedMatches = savedSongs.map((song) => {
      const slides = Array.isArray(song.slides) ? song.slides : [];
      const lyrics = song.lyrics || slides.map((slide) => slide.text || '').join('\n\n');
      return { ...song, source: 'My Songs', lyrics, slides };
    }).filter((song) => `${song.title} ${song.artist} ${song.lyrics}`.toLowerCase().includes(normalizedQuery));
    const localMatches = [...savedMatches, ...searchLocalSongs(query).map((song) => ({ ...song, source: song.source || 'Built-in' }))];
    if (localMatches.length > 0) {
      const seen = new Set();
      const results = localMatches.filter((song) => {
        const key = `${song.title}|${song.artist}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const firstSong = results[0];
      setSongResults(results);
      setActiveSong(firstSong);
      setActiveSongSlides(firstSong.slides?.length ? firstSong.slides : songSlidesFromLyrics(firstSong));
      setSongSourceNote('Local song found and loaded.');
      setSongLoading(false);
      return;
    }

    try {
      const separatorIndex = query.indexOf(' - ');
      if (separatorIndex > 0) {
        const artist = query.slice(0, separatorIndex).trim();
        const title = query.slice(separatorIndex + 3).trim();
        if (artist && title) {
          const real = await fetchRealLyricsAT(artist, title);
          if (requestId !== songSearchRequestRef.current) return;
          if (real?.lyrics) {
            const song = {
              id: real.id || `online-${Date.now()}`,
              title: real.title || title,
              artist: real.artist || artist,
              source: real.source || 'Online',
              lyrics: real.lyrics,
            };
            setSongResults([song]); setActiveSong(song); setActiveSongSlides(slidesFromLyrics(real.lyrics));
            setSongSourceNote('Lyrics found online and converted into slides.');
            return;
          }
        }
      }

      const { songs: candidates, issue } = await searchOnlineSongsDetailed(query);
      if (requestId !== songSearchRequestRef.current) return;
      setSongResults(candidates);
      const songWithLyrics = candidates.find((candidate) => candidate.lyrics);
      if (songWithLyrics) {
        setActiveSong(songWithLyrics);
        setActiveSongSlides(slidesFromLyrics(songWithLyrics.lyrics));
        setSongSourceNote('Lyrics found online and converted into slides. Select another result to load its exact lyrics.');
        return;
      }

      setActiveSong(null);
      setActiveSongSlides([]);
      setSongSourceNote(issue || (candidates.length
        ? 'Select a search result to retrieve its lyrics.'
        : 'No verified title or artist match was returned. Check the spelling or use Import to add the lyrics manually.'));
    } catch {
      if (requestId === songSearchRequestRef.current) {
        setSongSourceNote('Song search could not finish. Check the internet connection and try again.');
      }
    } finally {
      if (requestId === songSearchRequestRef.current) setSongLoading(false);
    }
  };

  const importLyricsOrUrl = async (input) => {
    if (!input) return;
    // If input looks like a URL, try fetching lyrics text; otherwise treat as raw lyrics.
    try {
      const isUrl = /^https?:\/\//i.test(input.trim());
      if (isUrl) {
        const res = await fetch(input, { mode: 'cors' });
        if (res.ok) {
          const text = await res.text();
          // crude extraction: try to find main text blocks
          const stripped = text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
          const bodyMatch = stripped.match(/<body[\s\S]*<\/body>/i);
          const body = bodyMatch ? bodyMatch[0].replace(/<[^>]+>/g, ' ') : stripped.replace(/<[^>]+>/g, ' ');
          const candidate = body.trim().slice(0, 20000);
          const slides = slidesFromLyrics(candidate);
          setActiveSong({ id: 'import', title: input, artist: 'Imported', source: input, lyrics: candidate });
          setActiveSongSlides(slides);
          setSongSourceNote('Imported lyrics from URL.');
          return;
        }
      }
    } catch {
      // fallthrough to treat as lyrics
    }
    // treat input as raw lyrics
    const slides = slidesFromLyrics(input);
    setActiveSong({ id: 'import', title: 'Imported Lyrics', artist: 'User', source: 'import', lyrics: input });
    setActiveSongSlides(slides);
    setSongSourceNote('Imported raw lyrics.');
  };
  const pickSongResult = async (result) => {
    const requestId = ++songResultRequestRef.current;
    setSongResultLoadingId(result.id);
    try {
      if (result.slides?.length) {
        setActiveSong(result);
        setActiveSongSlides(result.slides);
        setSongSourceNote('Local song loaded.');
        return;
      }
      setSongSourceNote(`Loading lyrics for "${result.title}"...`);
      const real = result.lyrics ? result : await fetchRealLyricsAT(result.artist, result.title);
      if (requestId !== songResultRequestRef.current) return;
      if (!real?.lyrics) {
        setSongSourceNote(`Lyrics for "${result.title}" could not be retrieved. The other search results are still available.`);
        return;
      }
      const song = { ...result, source: real.source || result.source, lyrics: real.lyrics };
      setSongResults((current) => current.map((candidate) => candidate.id === result.id ? song : candidate));
      setActiveSong(song);
      setActiveSongSlides(slidesFromLyrics(real.lyrics));
      setSongSourceNote('Lyrics found online and converted into slides.');
    } finally {
      if (requestId === songResultRequestRef.current) setSongResultLoadingId(null);
    }
  };
  const persistSongLibraryNow = async (songs) => {
    setSongLibraryStatus('saving');
    const response = await fetch('/__sola/song-library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(songs) });
    if (!response.ok) throw new Error('Song library save failed');
    setSongLibraryStatus('saved');
  };
  const saveSongLocally = async () => {
    if (!activeSong || activeSongSlides.length === 0) return;
    const existing = savedSongs.find((song) => song.title.toLowerCase() === activeSong.title.toLowerCase() && song.artist.toLowerCase() === activeSong.artist.toLowerCase());
    const saved = { id: existing?.id || createSongId(), title: activeSong.title, artist: activeSong.artist, lyrics: activeSong.lyrics || activeSongSlides.map((slide) => slide.text).join('\n\n'), slides: activeSongSlides };
    const nextSongs = [...savedSongs.filter((song) => song.id !== saved.id), saved];
    setSavedSongs(nextSongs);
    try {
      await persistSongLibraryNow(nextSongs);
      showAlert('Saved permanently', `"${activeSong.title}" was saved to My Songs on this computer.`);
    } catch {
      setSongLibraryStatus('browser-only');
      showAlert('Saved to browser backup', `"${activeSong.title}" is saved in this browser, but the shared computer library was unavailable.`);
    }
  };
  const createLocalSong = async ({ title, artist, lyrics, slides }) => {
    const song = { id: createSongId(), title, artist, lyrics, slides };
    const nextSongs = mergeSongLibraries(savedSongs, [song]);
    setSavedSongs(nextSongs);
    setActiveSong({ ...song, source: 'local library' });
    setActiveSongSlides(slides);
    setSongResults([]);
    setSongSourceNote('New song saved to the local library.');
    setSongEditorOpen(false);
    try { await persistSongLibraryNow(nextSongs); } catch { setSongLibraryStatus('browser-only'); }
  };
  const openHymnarySearch = () => {
    const query = songQuery.trim();
    const url = `https://hymnary.org/search?qu=${encodeURIComponent(query || 'in:text')}`;
    const win = window.open(url, 'sola-hymnary-search');
    if (win) win.opener = null;
    else showAlert('Hymnary blocked', 'Allow popups to open the Hymnary catalog search.');
  };
  const removeSavedSong = (id) => setSavedSongs((current) => current.filter((song) => song.id !== id));

  const addObsScene = () => { const id = 'scene' + nextSceneId++; setObsScenes((current) => Scenes.insertScene(current, { id, name: `Scene ${current.length + 1}`, sources: [{ id: 'src' + nextSourceId++, type: 'color', name: 'Background', color: '#222', visible: true }] })); setActiveObsSceneId(id); };
  const deleteActiveObsScene = () => { if (obsScenes.length <= 1) { showAlert('Cannot delete', 'Keep at least one scene.'); return; } const id = activeObsSceneId; setObsScenes((current) => Scenes.removeSceneById(current, id)); setActiveObsSceneId(obsScenes.find((scene) => scene.id !== id).id); };
  const refreshCameraDevices = useCallback(async (requestLabels = false) => {
    setCameraPickerError('');
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameraPickerError('Camera selection is not supported in this browser.');
      return [];
    }
    setCameraDevicesLoading(true);
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      if (requestLabels && videoDevices.some((device) => !device.label) && navigator.mediaDevices.getUserMedia) {
        const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        permissionStream.getTracks().forEach((track) => track.stop());
        devices = await navigator.mediaDevices.enumerateDevices();
      }
      const cameras = devices.filter((device) => device.kind === 'videoinput').map((device, index) => ({
        deviceId: device.deviceId,
        groupId: device.groupId,
        label: device.label || `Video device ${index + 1}`,
        category: classifyVideoDevice(device.label),
      }));
      const audioInputs = devices.filter((device) => device.kind === 'audioinput').map((device, index) => ({
        deviceId: device.deviceId,
        groupId: device.groupId,
        label: device.label || `Audio input ${index + 1}`,
      }));
      setCameraDevices(cameras);
      setCameraAudioDevices(audioInputs);
      return cameras;
    } catch {
      setCameraPickerError('Camera devices could not be read. Check browser permissions.');
      return [];
    } finally {
      setCameraDevicesLoading(false);
    }
  }, []);
  const openCameraSourcePicker = async () => {
    const id = 'src' + nextSourceId++;
    setAddSourceMenuOpen(false);
    setCameraSourcePicker({ id, deviceId: '', audioDeviceId: '', resolution: 'auto', fps: 30 });
    const devices = await refreshCameraDevices(true);
    if (devices.length > 0) setCameraSourcePicker((current) => current ? { ...current, deviceId: devices[0].deviceId } : current);
  };

  useEffect(() => {
    if (!cameraSourcePicker || !navigator.mediaDevices?.addEventListener) return undefined;
    const handleDeviceChange = () => refreshCameraDevices(false);
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  }, [cameraSourcePicker, refreshCameraDevices]);
  const activateObsScene = (scene) => {
    setActiveObsSceneId(scene.id);
    setSelectedSourceId(null);
    setSelectedSourceIds([]);
    const pendingCamera = scene.sources?.find((source) => source.type === 'camera' && !cameraStreams[source.id]);
    if (pendingCamera) {
      setCameraSourcePicker({ id: pendingCamera.id, deviceId: pendingCamera.deviceId || '', audioDeviceId: pendingCamera.audioDeviceId || '', resolution: pendingCamera.resolution || 'auto', fps: pendingCamera.fps || 30 });
      refreshCameraDevices();
    }
    if (!studioMode) transitionToScene(scene);
  };
  const insertCameraSource = (id, stream, label, deviceId = '', sourceType = 'camera', details = {}) => {
    const sidePanel = activeObsScene?.sources?.find((entry) => ['scripture', 'song-panel', 'slide-panel'].includes(entry.type));
    const source = { ...sourceDefaults(sourceType, id), name: label || 'Camera', deviceId, ...(sidePanel ? { x: Number(sidePanel.x || 0) < 50 ? 50 : 0, y: 0, width: 50, height: 100 } : {}), ...details };
    setCameraStreams((current) => ({ ...current, [id]: stream }));
    setObsScenes((current) => activeObsScene?.sources.some((item) => item.id === id)
      ? current.map((scene) => scene.id === activeObsSceneId ? { ...scene, sources: scene.sources.map((item) => item.id === id ? { ...item, type: sourceType, name: source.name, deviceId } : item) } : scene)
      : Scenes.addSourceToScene(current, activeObsSceneId, source));
    setSelectedSourceId(id);
    setSelectedSourceIds([id]);
    setCameraSourcePicker(null);
    setCameraManagerTarget(null);
  };
  const syncPhoneCameraStream = (deviceId, stream) => {
    setCameraStreams((current) => {
      const next = { ...current };
      obsScenes.forEach((scene) => scene.sources?.forEach((source) => {
        if (source.type !== 'phone-camera' || source.deviceId !== deviceId) return;
        if (stream) next[source.id] = stream;
        else delete next[source.id];
      }));
      return next;
    });
  };
  const scenePanelTypes = ['scripture', 'song-panel', 'slide-panel'];
  const plannerContentForPanel = (type) => {
    if (type === 'scripture' && stagedContent?.kind === 'verse') return { reference: `${stagedContent.book} ${stagedContent.chapter}:${stagedContent.verse}`, text: stagedContent.text, fontSize: stagedContent.fontSize || bibleFontSize };
    if (type === 'song-panel' && stagedContent?.kind === 'song-slide') return { label: stagedContent.slide.label || 'SONG', text: stagedContent.slide.text, fontSize: stagedContent.fontSize || songFontSize };
    if (type === 'slide-panel' && stagedContent?.kind === 'slide-deck') return { title: stagedContent.presentation.name, text: stagedContent.slide.text, fontSize: stagedContent.fontSize || stagedContent.slide.fontSize || slideFontSize };
    return {};
  };
  const addObsSource = (type) => {
    if (type === 'camera') { openCameraSourcePicker(); return; }
    if (type === 'phone-camera') {
      const id = 'src' + nextSourceId++;
      setAddSourceMenuOpen(false);
      setCameraManagerTarget({ id });
      setCameraManagerOpen(true);
      return;
    }
    const id = 'src' + nextSourceId++;
    const source = { ...sourceDefaults(type, id), ...(scenePanelTypes.includes(type) ? plannerContentForPanel(type) : {}) };
    if (type === 'image') pendingImageSourceId.current = id;
    if (type === 'video' || type === 'audio') pendingMediaSourceId.current = id;
    setObsScenes((current) => {
      const withSource = Scenes.addSourceToScene(current, activeObsSceneId, source);
      if (!scenePanelTypes.includes(type)) return withSource;
      return withSource.map((scene) => scene.id === activeObsSceneId ? {
        ...scene,
        sources: scene.sources.map((entry) => (entry.type === 'camera' || entry.type === 'phone-camera') ? { ...entry, x: 0, y: 0, width: 50, height: 100 } : entry),
      } : scene);
    });
    setSelectedSourceId(id);
    setSelectedSourceIds([id]);
    setAddSourceMenuOpen(false);
    if (type === 'image') window.setTimeout(() => imageInputRef.current?.click(), 50);
    if (type === 'video' || type === 'audio') window.setTimeout(() => mediaInputRef.current?.click(), 50);
    if (type === 'screen') window.setTimeout(() => startScreenCapture(id), 50);
  };
  const removeSelectedSource = () => { if (!selectedSourceId) { showAlert('No source selected', 'Click a source in the list first.'); return; } setObsScenes((current) => Scenes.removeSourceFromScene(current, activeObsSceneId, selectedSourceId)); setSelectedSourceId(null); setSelectedSourceIds([]); };
  const handleImageFile = (event) => {
    const file = event.target.files[0]; if (!file) return;
    const sourceId = pendingImageSourceId.current;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const applyImageLayout = (updates) => setObsScenes((current) => current.map((scene) => scene.id === activeObsSceneId ? { ...scene, sources: scene.sources.map((source) => source.id === sourceId ? { ...source, dataUrl, ...updates } : source) } : scene));
      showChoice('How should this image appear?', 'Choose Full page for a background, or Resizable for a logo, badge, or picture you want to position.', [
        { label: 'Resizable image', primary: true, onSelect: () => applyImageLayout({ x: 65, y: 5, width: 28, height: 28, objectFit: 'contain' }) },
        { label: 'Full-page image', onSelect: () => applyImageLayout({ x: 0, y: 0, width: 100, height: 100, objectFit: 'cover' }) },
      ]);
    };
    reader.readAsDataURL(file); event.target.value = '';
  };
  const handleMediaFile = (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setObsScenes((current) => Scenes.updateSourceFieldInScene(current, activeObsSceneId, pendingMediaSourceId.current, 'dataUrl', reader.result));
    };
    reader.readAsDataURL(file); event.target.value = '';
  };
  const removeObsSource = (sourceId) => {
    const source = activeObsScene?.sources?.find((item) => item.id === sourceId);
    if (source?.type !== 'phone-camera') cameraStreams[sourceId]?.getTracks?.().forEach((track) => track.stop());
    setCameraStreams((current) => { const next = { ...current }; delete next[sourceId]; return next; });
    setObsScenes((current) => {
      const next = Scenes.removeSourceFromScene(current, activeObsSceneId, sourceId);
      if (!['scripture', 'song-panel', 'slide-panel'].includes(source?.type)) return next;
      return next.map((scene) => scene.id === activeObsSceneId && !scene.sources.some((entry) => ['scripture', 'song-panel', 'slide-panel'].includes(entry.type)) ? {
        ...scene,
        sources: scene.sources.map((entry) => (entry.type === 'camera' || entry.type === 'phone-camera') ? { ...entry, x: 0, y: 0, width: 100, height: 100 } : entry),
      } : scene);
    });
    setSelectedSourceIds((current) => current.filter((id) => id !== sourceId));
    if (selectedSourceId === sourceId) setSelectedSourceId(null);
  };
  const toggleSourceVisible = (sourceId) => setObsScenes((current) => Scenes.toggleSourceVisibilityInScene(current, activeObsSceneId, sourceId));
  const moveSource = (sourceId, direction) => setObsScenes((current) => Scenes.moveSourceInScene(current, activeObsSceneId, sourceId, direction));
  const updateSourceField = (sourceId, field, value) => setObsScenes((current) => Scenes.updateSourceFieldInScene(current, activeObsSceneId, sourceId, field, value));
  const updateSourceFields = (sourceId, updates) => setObsScenes((current) => current.map((scene) => scene.id === activeObsSceneId ? { ...scene, sources: scene.sources.map((source) => source.id === sourceId ? { ...source, ...updates } : source) } : scene));
  const applyPanelSide = (sourceId, side) => setObsScenes((current) => current.map((scene) => scene.id === activeObsSceneId ? {
    ...scene,
    sources: scene.sources.map((source) => {
      if (source.id === sourceId) return { ...source, x: side === 'left' ? 0 : 50, y: 0, width: 50, height: 100 };
      if (source.type === 'camera' || source.type === 'phone-camera') return { ...source, x: side === 'left' ? 50 : 0, y: 0, width: 50, height: 100 };
      return source;
    }),
  } : scene));
  const applyPlannerPreviewToPanel = (source) => {
    const updates = plannerContentForPanel(source.type);
    if (Object.keys(updates).length === 0) {
      showAlert('Matching preview required', `Stage a ${source.type === 'scripture' ? 'Bible verse' : source.type === 'song-panel' ? 'song slide' : 'presentation slide'} in the Planner first, then click this button again.`);
      return;
    }
    updateSourceFields(source.id, updates);
  };
  const updateProgramSourceFields = (sourceId, updates) => setProgramContent((content) => content?.kind === 'obs-scene' && content.scene.id === activeObsSceneId ? { ...content, scene: { ...content.scene, sources: content.scene.sources.map((item) => item.id === sourceId ? { ...item, ...updates } : item) } } : content);
  const selectObsSource = (sourceId, event) => {
    setSelectedSourceId(sourceId);
    if (event?.shiftKey || event?.ctrlKey || event?.metaKey) {
      setSelectedSourceIds((current) => current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId]);
    } else setSelectedSourceIds([sourceId]);
  };
  const groupSelectedSources = () => {
    if (selectedSourceIds.length < 2) { showAlert('Select at least two sources', 'Hold Shift and click image or text sources in the Sources list, then choose Group.'); return; }
    const groupId = `group-${Date.now()}`;
    setObsScenes((current) => current.map((scene) => scene.id === activeObsSceneId ? { ...scene, sources: scene.sources.map((source) => selectedSourceIds.includes(source.id) ? { ...source, groupId } : source) } : scene));
  };
  const ungroupSelectedSources = () => setObsScenes((current) => current.map((scene) => scene.id === activeObsSceneId ? { ...scene, sources: scene.sources.map((source) => selectedSourceIds.includes(source.id) ? { ...source, groupId: null } : source) } : scene));
  const beginSourceTransform = (event, source, mode = 'move') => {
    if (source.locked || !previewCanvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    selectObsSource(source.id, event);
    const rect = previewCanvasRef.current.getBoundingClientRect();
    const targets = source.groupId ? activeObsScene.sources.filter((item) => item.groupId === source.groupId) : [source];
    const originals = targets.map((item) => ({ id: item.id, x: Number(item.x || 0), y: Number(item.y || 0), width: Number(item.width ?? 100), height: Number(item.height ?? 100) }));
    sourceDragRef.current = { mode, startX: event.clientX, startY: event.clientY, rect, originals };
    const handleMove = (moveEvent) => {
      const drag = sourceDragRef.current;
      if (!drag) return;
      const dx = (moveEvent.clientX - drag.startX) / drag.rect.width * 100;
      const dy = (moveEvent.clientY - drag.startY) / drag.rect.height * 100;
      setObsScenes((current) => current.map((scene) => scene.id === activeObsSceneId ? {
        ...scene,
        sources: scene.sources.map((item) => {
          const original = drag.originals.find((entry) => entry.id === item.id);
          if (!original) return item;
          if (drag.mode === 'resize') return { ...item, width: Math.max(5, Math.min(100 - original.x, original.width + dx)), height: Math.max(5, Math.min(100 - original.y, original.height + dy)) };
          return { ...item, x: Math.max(-50, Math.min(95, original.x + dx)), y: Math.max(-50, Math.min(95, original.y + dy)) };
        }),
      } : scene));
    };
    const handleUp = () => {
      sourceDragRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };
  const startCountdown = (source) => {
    const seconds = Math.max(0, Number(source.seconds || source.initialSeconds || 0));
    const updates = { initialSeconds: Number(source.initialSeconds || seconds), timerRunning: true, timerEndsAt: currentTimestamp() + seconds * 1000 };
    updateSourceFields(source.id, updates);
    updateProgramSourceFields(source.id, updates);
  };
  const pauseCountdown = (source) => {
    const now = currentTimestamp();
    const seconds = Math.max(0, Math.ceil((Number(source.timerEndsAt || now) - now) / 1000));
    const updates = { seconds, timerRunning: false, timerEndsAt: null };
    updateSourceFields(source.id, updates);
    updateProgramSourceFields(source.id, updates);
  };
  const resetCountdown = (source) => {
    const updates = { seconds: Number(source.initialSeconds || 300), timerRunning: false, timerEndsAt: null };
    updateSourceFields(source.id, updates);
    updateProgramSourceFields(source.id, updates);
  };
  const toggleSourceLock = (sourceId) => updateSourceField(sourceId, 'locked', !(activeObsScene?.sources.find((source) => source.id === sourceId)?.locked));
  const duplicateSource = (source) => {
    const duplicate = { ...source, id: 'src' + nextSourceId++, name: `${source.name} Copy`, x: Number(source.x || 0) + 3, y: Number(source.y || 0) + 3 };
    if (source.type === 'camera' && cameraStreams[source.id]) setCameraStreams((current) => ({ ...current, [duplicate.id]: cameraStreams[source.id] }));
    setObsScenes((current) => Scenes.addSourceToScene(current, activeObsSceneId, duplicate));
    setSelectedSourceId(duplicate.id);
  };
  const startScreenCapture = async (sourceId) => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        setCaptureStatus('Screen capture is not available in this browser.');
        updateSourceField(sourceId, 'captureLabel', 'Screen capture unsupported');
        return;
      }
      setCaptureStatus('Choose a screen, window, or browser tab from the browser picker.');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const [track] = stream.getVideoTracks();
      setScreenStreams((current) => ({ ...current, [sourceId]: stream }));
      updateSourceField(sourceId, 'captureLabel', track?.label || 'Captured display');
      setCaptureStatus(track?.label ? `Capturing: ${track.label}` : 'Screen capture active.');
      track?.addEventListener('ended', () => {
        setScreenStreams((current) => {
          const next = { ...current };
          delete next[sourceId];
          return next;
        });
        setCaptureStatus('Screen capture stopped.');
      });
    } catch (error) {
      setCaptureStatus(error?.name === 'NotAllowedError' ? 'Screen capture permission was denied.' : 'Screen capture could not start.');
      updateSourceField(sourceId, 'captureLabel', 'Capture not active');
    }
  };
  const enableCamera = async (sourceId, deviceId = '', resolution = 'auto', fps = 30, audioDeviceId = '') => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) { setCameraPickerError('Camera access is not supported in this browser.'); return; }
      setCameraPickerError('');
      const selectedCamera = cameraDevices.find((device) => device.deviceId === deviceId);
      const isVirtualPhoneCamera = /(droidcam|iriun)/i.test(selectedCamera?.label || '');
      const requestedResolution = resolution;
      const requestedFps = Number(fps);
      const videoConstraints = {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        ...(!isVirtualPhoneCamera ? parseVideoResolution(requestedResolution) : {}),
        ...(!isVirtualPhoneCamera && requestedFps ? { frameRate: { ideal: requestedFps, max: requestedFps } } : {}),
        ...(!isVirtualPhoneCamera ? { aspectRatio: { ideal: 16 / 9 }, resizeMode: { ideal: 'none' } } : {}),
      };
      const stream = await navigator.mediaDevices.getUserMedia({
        video: Object.keys(videoConstraints).length ? videoConstraints : true,
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : false,
      });
      const [track] = stream.getVideoTracks();
      if (track && 'contentHint' in track) track.contentHint = isVirtualPhoneCamera ? 'motion' : 'detail';
      const settings = track?.getSettings?.() || {};
      const actualResolution = settings.width && settings.height ? `${settings.width}x${settings.height}` : requestedResolution;
      const actualFps = settings.frameRate || Number(fps) || 30;
      const details = { resolution: actualResolution, fps: actualFps, audioDeviceId };
      track?.addEventListener('ended', () => {
        setCameraStreams((current) => {
          const next = { ...current };
          delete next[sourceId];
          return next;
        });
      }, { once: true });
      const existingSource = activeObsScene?.sources.find((source) => source.id === sourceId);
      if (existingSource) {
        cameraStreams[sourceId]?.getTracks?.().forEach((item) => item.stop());
        setCameraStreams((current) => ({ ...current, [sourceId]: stream }));
        updateSourceFields(sourceId, { name: track?.label || existingSource.name || 'Camera', deviceId: settings.deviceId || deviceId, ...details });
        setCameraSourcePicker(null);
      } else {
        insertCameraSource(sourceId, stream, track?.label || 'Camera', settings.deviceId || deviceId, 'camera', details);
      }
      await refreshCameraDevices();
    } catch (error) {
      setCameraPickerError(error?.name === 'NotAllowedError' ? 'Video-device permission was denied. Allow camera access and try again.' : error?.name === 'OverconstrainedError' ? 'That device does not support the selected video mode. Choose Auto resolution or a lower FPS.' : 'This video device could not be opened. Close other apps using it, reconnect it, then refresh.');
    }
  };

  const transitionToProgram = (newContent) => {
    if (!newContent) return;
    transitionSequenceRef.current += 1;
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    if (transitionType === 'Cut' || transitionDuration === 0) {
      setTransitioning(false);
      setOutgoingSnapshot(null);
      setTransitionProgress(1);
      setProgramContent(newContent);
      setIsBlack(false);
      setTextCleared(false);
      return;
    }
    setOutgoingSnapshot(programContent);
    setProgramContent(newContent);
    setTransitioning(true);
    setTransitionProgress(0);
    setIsBlack(false);
    setTextCleared(false);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => setTransitionProgress(1)));
    transitionTimerRef.current = window.setTimeout(() => {
      setTransitioning(false);
      setOutgoingSnapshot(null);
      setTransitionProgress(1);
      transitionTimerRef.current = null;
    }, transitionDuration);
  };
  const transitionToScene = (scene) => transitionToProgram({ kind: 'obs-scene', scene: JSON.parse(JSON.stringify(scene)) });

  const applyBackground = (item) => setActiveBackground(item);
  const createTheme = () => {
    if (!creatorName.trim()) { showAlert('Name required', 'Give your theme a name.'); return; }
    const stops = [creatorColor1, creatorColor2, creatorColor3].filter(Boolean);
    const css = stops.length >= 3 ? `linear-gradient(${creatorAngle}deg, ${stops[0]} 0%, ${stops[1]} 50%, ${stops[2]} 100%)` : `linear-gradient(${creatorAngle}deg, ${stops[0]} 0%, ${stops[1]} 100%)`;
    setThemeItems((current) => [...current, { id: 'theme' + nextThemeId++, name: creatorName.trim(), css, animated: creatorAnim !== 'none', anim: creatorAnim }]);
    setCreatorOpen(false); setCreatorName(''); setCreatorColor3('');
  };
  const readLibraryFile = (event, destination) => {
    const file = event.target.files[0]; if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      showAlert('Unsupported file', 'Choose an image or video file.');
      event.target.value = '';
      return;
    }
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:')) {
        showAlert('Import failed', `${file.name} could not be read.`);
        return;
      }
      const item = { id: `${destination}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: file.name, kind, dataUrl: reader.result, imported: true, ...(kind === 'video' ? { loop: true } : {}) };
      if (destination === 'theme') {
        setThemeItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
        setActiveBackground(item);
      } else {
        setMediaItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
        setStagedContent({ kind: 'media-bg', item });
      }
    };
    reader.onerror = () => showAlert('Import failed', `${file.name} could not be loaded from this computer.`);
    reader.readAsDataURL(file); event.target.value = '';
  };
  const removeTheme = (id) => {
    setThemeItems((current) => current.filter((item) => item.id !== id));
    if (activeBackground.id === id) setActiveBackground(BUILTIN_THEMES[0]);
  };
  const removeMedia = (id) => {
    setMediaItems((current) => current.filter((item) => item.id !== id));
    if (stagedContent?.kind === 'media-bg' && stagedContent.item.id === id) setStagedContent(null);
    if (programContent?.kind === 'media-bg' && programContent.item.id === id) setProgramContent(null);
  };
  const setLibraryVideoLoop = (destination, id, loop) => {
    const updateItem = (item) => item?.id === id ? { ...item, loop } : item;
    if (destination === 'theme') {
      setThemeItems((current) => current.map(updateItem));
      setActiveBackground((current) => updateItem(current));
    } else {
      setMediaItems((current) => current.map(updateItem));
      setStagedContent((current) => current?.kind === 'media-bg' ? { ...current, item: updateItem(current.item) } : current);
      setProgramContent((current) => current?.kind === 'media-bg' ? { ...current, item: updateItem(current.item) } : current);
    }
  };

  const addPresentation = () => showPrompt('Presentation name:', 'New Presentation', (name) => { if (!name) return; const id = 'pres' + nextPresId++; setSlidePresentations((current) => [...current, { id, name, slides: [{ id: 'sl' + nextSlideId++, text: 'New slide' }] }]); setExpandedPresId(id); });
  const addSlideToPresentation = (presentationId) => setSlidePresentations((current) => current.map((presentation) => presentation.id === presentationId ? { ...presentation, slides: [...presentation.slides, { id: 'sl' + nextSlideId++, text: 'New slide' }] } : presentation));
  const updateSlideStyle = (presentationId, slideId, updates) => setSlidePresentations((current) => current.map((presentation) => presentation.id === presentationId ? { ...presentation, slides: presentation.slides.map((slide) => slide.id === slideId ? { ...slide, ...updates } : slide) } : presentation));
  const editSlide = (presentationId, slide) => setEditingSlide({ presentationId, slide });
  const deleteSlide = (presentationId, slideId) => setSlidePresentations((current) => current.map((presentation) => presentation.id === presentationId ? { ...presentation, slides: presentation.slides.filter((slide) => slide.id !== slideId) } : presentation));
  const deletePresentation = (presentationId) => setSlidePresentations((current) => current.filter((presentation) => presentation.id !== presentationId));

  const getBoxBackground = (content) => {
    if (content && content.kind === 'obs-scene') return '#000';
    if (content && content.kind === 'media-bg') return (content.item && (content.item.kind === 'video' ? '#000' : content.item.dataUrl ? `url(${content.item.dataUrl}) center/cover` : content.item.css || content.item.color)) || '#2a2a2a';
    if (activeBackground?.kind === 'video') return '#000';
    if (activeBackground && activeBackground.dataUrl) return `url(${activeBackground.dataUrl}) center/cover`;
    if (activeBackground && activeBackground.color) return activeBackground.color;
    if (activeBackground && activeBackground.css) return activeBackground.css;
    return BUILTIN_THEMES[0].css;
  };
  const animStyleFor = (animation) => animation === 'pan' || animation === 'drift' ? { backgroundSize: '180% 180%', animation: `bgPan ${animation === 'drift' ? 8 : 14}s ease-in-out infinite` } : animation === 'pulse' || animation === 'glow' ? { animation: `bgPulse ${animation === 'glow' ? 6 : 5}s ease-in-out infinite` } : {};
  const bgAnimationStyle = animStyleFor(activeBackground.anim);
  const contentAnimationStyle = (content) => content?.kind === 'media-bg' ? animStyleFor(content.item?.anim) : bgAnimationStyle;
  const transitionStyle = (entering) => {
    if (!transitioning) return {};
    const progress = entering ? transitionProgress : 1 - transitionProgress;
    if (transitionType === 'Fade') return { opacity: progress };
    if (transitionType === 'Slide') return { opacity: 1, transform: entering ? `translateX(${(1 - transitionProgress) * 100}%)` : `translateX(${-transitionProgress * 100}%)` };
    if (transitionType === 'Wipe') return { opacity: 1, clipPath: entering ? `inset(0 ${100 - transitionProgress * 100}% 0 0)` : `inset(0 0 0 ${transitionProgress * 100}%)` };
    if (transitionType === 'Dissolve') return { opacity: progress, filter: `blur(${entering ? (1 - transitionProgress) * 4 : transitionProgress * 4}px)` };
    return {};
  };
  const getVideoBackground = (content) => {
    const item = content?.kind === 'media-bg' ? content.item : activeBackground;
    if (item?.kind !== 'video' || !item.dataUrl) return null;
    return <video key={`${item.id}-${item.loop !== false}`} src={item.dataUrl} autoPlay loop={item.loop !== false} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />;
  };
  const openOutputWindow = async (output, outputIndex = 0) => {
    try {
      if (window.solaDesktop?.project) {
        const result = await window.solaDesktop.project({ id: output.id, name: output.name, index: outputIndex });
        if (!result?.ok) showAlert('Display 2 not detected', 'Windows is not reporting an extended display. In Windows Display settings, select Extend these displays, then click PROJECT again.');
        return;
      }
      const url = `${window.location.origin}${window.location.pathname}?projector=1&output=${encodeURIComponent(output.id)}`;
      if (!window.getScreenDetails) {
        showAlert('Display 2 unavailable', 'Automatic projection needs Chrome or Edge with Window Management support. Open this app there, then click PROJECT again.');
        return;
      }

      let targetScreen;
      try {
        const details = await window.getScreenDetails();
        const sameScreen = (first, second) => first && second
          && first.left === second.left
          && first.top === second.top
          && first.width === second.width
          && first.height === second.height;
        const secondaryScreens = details.screens.filter((screen) => !screen.isPrimary);
        const otherScreens = details.screens.filter((screen) => !sameScreen(screen, details.currentScreen));
        const projectorScreens = secondaryScreens.length > 0 ? secondaryScreens : otherScreens;
        targetScreen = projectorScreens[outputIndex % Math.max(projectorScreens.length, 1)];
      } catch {
        showAlert('Allow display access', 'Chrome blocked access to display 2. Open the site permissions beside the address bar, allow Window management, then click PROJECT again.');
        return;
      }

      if (!targetScreen) {
        showAlert('Display 2 not detected', 'Windows is not reporting an extended display. In Windows Display settings, select Extend these displays, then click PROJECT again.');
        return;
      }

      // Create the output at display 2's coordinates. This is more reliable than
      // opening it on display 1 and asking the browser to move it afterwards.
      const popupFeatures = [
        'popup=yes',
        'fullscreen=yes',
        'toolbar=no',
        'location=no',
        'menubar=no',
        'status=no',
        'scrollbars=no',
        'resizable=yes',
        `left=${targetScreen.availLeft}`,
        `top=${targetScreen.availTop}`,
        `width=${targetScreen.availWidth}`,
        `height=${targetScreen.availHeight}`,
      ].join(',');
      const win = window.open('', `sola-output-${output.id}-${currentTimestamp()}`, popupFeatures);
      if (!win) { showAlert('Output blocked', 'Allow popups, then send Program to the output again.'); return; }
      win.moveTo(targetScreen.availLeft, targetScreen.availTop);
      win.resizeTo(targetScreen.availWidth, targetScreen.availHeight);
      win.focus();
      // Keep the initial document alive as a fullscreen shell. Requesting
      // fullscreen here retains the PROJECT button's user activation; requesting
      // it after a normal page navigation is too late and Chrome rejects it.
      const shellDocument = win.document;
      shellDocument.title = `${output.name} - Sola Worship`;
      shellDocument.documentElement.style.cssText = 'width:100%;height:100%;margin:0;background:#000;overflow:hidden';
      shellDocument.body.style.cssText = 'width:100%;height:100%;margin:0;background:#000;overflow:hidden';
      const loadProjector = () => {
        if (win.closed) return;
        const frame = shellDocument.createElement('iframe');
        frame.src = url;
        frame.title = output.name;
        frame.allow = 'fullscreen; camera; microphone; autoplay';
        frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#000';
        shellDocument.body.replaceChildren(frame);
      };
      try {
        const fullscreenRequest = shellDocument.documentElement.requestFullscreen?.({ navigationUI: 'hide', screen: targetScreen });
        if (fullscreenRequest) fullscreenRequest.then(loadProjector).catch(() => {
          win.moveTo(targetScreen.availLeft, targetScreen.availTop);
          win.resizeTo(targetScreen.availWidth, targetScreen.availHeight);
          loadProjector();
        });
        else loadProjector();
      } catch {
        loadProjector();
      }
    } catch {
      showAlert('Output unavailable', `This browser could not open ${output.name}.`);
    }
  };
  const openActiveOutputs = () => {
    const displayOutputs = outputs.filter((output) => output.active && output.kind !== 'stream');
    displayOutputs.forEach((output, index) => openOutputWindow(output, index));
    if (displayOutputs.length === 0) showAlert('No display selected', 'Enable a projector or confidence monitor in Output Destinations.');
  };
  const takePreviewLive = () => { goLive(); openActiveOutputs(); };
  const takeSceneLive = () => { transitionToScene(activeObsScene); openActiveOutputs(); };

  const renderContent = (content, options = {}) => {
    if (!content) return <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>No content</div>;
    if (content.kind === 'obs-scene') {
      if (!content.scene || !Array.isArray(content.scene.sources)) return <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>Scene unavailable</div>;
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {content.scene.sources.map((sceneSource) => {
            if (sceneSource.type === 'planner') {
              if (!sceneSource.visible || stagedContent?.kind === 'obs-scene') return null;
              return (
                <div key={sceneSource.id} style={{ position: 'absolute', inset: 0, background: getBoxBackground(stagedContent), ...contentAnimationStyle(stagedContent) }}>
                  {getVideoBackground(stagedContent)}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{renderContent(stagedContent, options)}</div>
                </div>
              );
            }
            return renderObsSource(sceneSource, options.hideText, cameraStreams, screenStreams);
          })}
        </div>
      );
    }
    if (content.kind === 'media-bg') return null;
    if (options.hideText) return null;
    if (content.kind === 'verse') return (
      <div style={{ textAlign: 'center', maxWidth: '90%', padding: '0 14px' }}>
        <div style={{ fontSize: options.projector ? 'clamp(24px, 3vw, 56px)' : '17px', fontWeight: '600', marginBottom: options.projector ? '2vh' : '10px', color: '#d4a574' }}>{content.book} {content.chapter}:{content.verse} <span style={{ fontSize: options.projector ? '0.55em' : '11px', color: 'rgba(255,255,255,0.5)' }}>({(content.version || selectedVersion).toUpperCase()})</span></div>
        <div style={{ fontSize: options.projector ? `clamp(${content.fontSize || bibleFontSize}px, 4vw, ${(content.fontSize || bibleFontSize) + 28}px)` : `${Math.max(16, Math.round((content.fontSize || bibleFontSize) * 0.55))}px`, color: 'white', lineHeight: '1.35' }}>{content.text}</div>
      </div>
    );
    if (content.kind === 'song-slide') return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: options.projector ? 'clamp(16px, 1.5vw, 30px)' : '11px', color: '#d4a574', fontWeight: '700', marginBottom: options.projector ? '2vh' : '8px', letterSpacing: '0' }}>{content.slide.label.toUpperCase()}</div>
        <div style={{ fontSize: options.projector ? `clamp(${content.fontSize || songFontSize}px, 4vw, ${(content.fontSize || songFontSize) + 24}px)` : `${Math.max(16, Math.round((content.fontSize || songFontSize) * 0.48))}px`, color: 'white', whiteSpace: 'pre-line', lineHeight: '1.35' }}>{content.slide.text}</div>
      </div>
    );
    if (content.kind === 'slide-deck') return (
      <div style={{ textAlign: content.slide.align || 'center', width: '100%' }}>
        <div style={{ fontSize: options.projector ? 'clamp(14px, 1.25vw, 24px)' : '10px', color: '#e7c594', fontWeight: '700', marginBottom: options.projector ? '2.5vh' : '8px', textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>{content.presentation.name.toUpperCase()}</div>
        <div style={{ fontSize: options.projector ? `clamp(${content.fontSize || content.slide.fontSize || slideFontSize}px, 4.6vw, ${(content.fontSize || content.slide.fontSize || slideFontSize) + 24}px)` : `${Math.max(18, Math.round((content.fontSize || content.slide.fontSize || slideFontSize) * 0.48))}px`, fontFamily: content.slide.fontFamily || 'Georgia, "Times New Roman", serif', fontWeight: content.slide.bold === false ? '400' : '700', color: 'white', lineHeight: '1.3', whiteSpace: 'pre-wrap', padding: options.projector ? '0 7vw' : '0 16px', textShadow: '0 3px 14px rgba(0,0,0,0.98), 0 1px 3px rgba(0,0,0,1)' }}>{content.slide.text}</div>
      </div>
    );
    if (content.kind === 'service') {
      const serviceItem = serviceOrder[content.index];
      if (!serviceItem) return <div style={{ color: 'rgba(255,255,255,0.3)' }}>—</div>;
      if (serviceItem.type === 'song') return <div style={{ textAlign: 'center' }}><div style={{ fontSize: '20px', fontWeight: '500', marginBottom: '8px', color: 'white' }}>{serviceItem.name}</div><div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>{serviceItem.artist}</div></div>;
      return <div style={{ fontSize: '20px', fontWeight: '500', color: 'white', textAlign: 'center' }}>{serviceItem.name}</div>;
    }
    return null;
  };

  const renderOutputContent = (content, options = {}) => {
    const splitEligible = ['verse', 'song-slide', 'slide-deck'].includes(content?.kind);
    const cameraStream = cameraStreams[activeSplitCameraSourceId];
    if (!splitScreenMode || !splitEligible || !cameraStream) return renderContent(content, options);
    const cameraFirst = splitCameraSide !== 'right';
    const cameraPanel = (
      <div key="split-camera" style={{ minWidth: 0, height: '100%', overflow: 'hidden', background: '#050505', animation: `splitCameraReveal ${Math.max(250, transitionDuration)}ms cubic-bezier(.2,.8,.2,1) both` }}>
        <CameraView stream={cameraStream} />
      </div>
    );
    const contentPanel = (
      <div key={`split-content-${content?.kind}-${content?.verse || content?.slide?.id || ''}`} style={{ minWidth: 0, height: '100%', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: options.projector ? '4vw' : '14px', boxSizing: 'border-box', background: getBoxBackground(content), animation: `splitContentReveal ${Math.max(250, transitionDuration)}ms cubic-bezier(.2,.8,.2,1) both` }}>
        {getVideoBackground(content)}
        <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{renderContent(content, options)}</div>
      </div>
    );
    return <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#000' }}>{cameraFirst ? [cameraPanel, contentPanel] : [contentPanel, cameraPanel]}</div>;
  };

  const renderSceneSource = (sceneSource, hideText) => {
    if (sceneSource.type === 'planner') {
      if (!sceneSource.visible) return null;
      return (
        <div key={sceneSource.id} style={{ position: 'absolute', inset: 0, background: getBoxBackground(stagedContent), ...(stagedContent?.kind !== 'obs-scene' ? contentAnimationStyle(stagedContent) : {}) }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{renderContent(stagedContent, { hideText })}</div>
        </div>
      );
    }
    return renderObsSource(sceneSource, hideText, cameraStreams, screenStreams);
  };

  const deck = stagedContent?.kind === 'song-slide' && activeSongSlides.length > 1
    ? { type: 'song', slides: activeSongSlides, activeId: stagedContent.slide.id }
    : stagedContent?.kind === 'slide-deck' && stagedContent.presentation.slides.length > 1
      ? { type: 'presentation', slides: stagedContent.presentation.slides, activeId: stagedContent.slide.id }
      : null;
  const pickDeckSlide = (slide, live = false) => {
    const content = deck?.type === 'song'
      ? { kind: 'song-slide', song: stagedContent.song, slide, fontSize: songFontSize }
      : deck?.type === 'presentation'
        ? { kind: 'slide-deck', presentation: stagedContent.presentation, slide, fontSize: slideFontSize }
        : null;
    if (!content) return;
    if (live) pushLive(content);
    else setStagedContent(content);
  };

  const activeOutputs = outputs.filter((output) => output.active);
  const copyTabletDisplayLink = async () => {
    const pairCode = window.sessionStorage.getItem('sola-camera-pair-code') || presentationPairCode;
    if (!pairCode) {
      setCameraManagerOpen(true);
      showAlert('Create a display code', 'The Camera Manager is opening so Sola can create a local pairing code. Then return to Output Settings and choose Tablet Screen Link again.');
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}?projector=1&remote=${encodeURIComponent(pairCode)}`;
    try { await navigator.clipboard.writeText(url); } catch { /* the URL is also shown below */ }
    showAlert('Tablet Screen Link copied', `Open this address on a tablet connected to the same Wi-Fi:\n\n${url}\n\nOn first use, install the same local trust certificate used by the phone camera.`);
  };
  const tabBarStyle = { display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px', flexWrap: 'wrap' };
  const tabStyle = (active) => ({ padding: '7px 8px', borderTop: 'none', borderRight: 'none', borderBottom: active ? '2px solid #d4a574' : 'none', borderLeft: 'none', background: 'none', color: active ? '#d4a574' : 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '10px', fontWeight: '600', marginBottom: active ? '-1px' : '0' });
  const headerIconBtn = (active) => ({ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 9px', background: active ? 'rgba(212,165,116,0.12)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (active ? '#d4a574' : 'rgba(255,255,255,0.12)'), color: active ? '#d4a574' : 'rgba(255,255,255,0.85)', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' });
  const roundBtn = { width: '34px', height: '34px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: '#1e1e1e', color: '#d4a574', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' };
  const outputDestinationRows = outputs.map((output) => (
    <div key={output.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '7px', padding: '5px 2px' }}>
      <input type="checkbox" checked={output.active} onChange={() => setOutputs((current) => current.map((entry) => entry.id === output.id ? { ...entry, active: !entry.active } : entry))} />
      <div><div style={{ fontSize: '11px', color: 'white' }}>{output.name}</div><div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{output.kind || 'display'}</div></div>
      {output.kind !== 'stream' && <button onClick={() => openOutputWindow(output)} title={`Open ${output.name}`} style={{ width: '26px', height: '26px', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', color: 'white', cursor: 'pointer' }}><Monitor size={11} /></button>}
    </div>
  ));

  const cameraDialogs = (
    <>
      {(cameraManagerOpen || cameraManagerTarget || obsScenes.some((scene) => scene.sources?.some((source) => source.type === 'phone-camera'))) && <CameraManager
          open={cameraManagerOpen}
          onClose={() => { setCameraManagerOpen(false); setCameraManagerTarget(null); }}
          onUseCamera={cameraManagerTarget ? (device) => {
            insertCameraSource(cameraManagerTarget.id, device.previewStream, device.customLabel || device.label || 'Phone Camera', device.deviceId, 'phone-camera');
            setCameraManagerOpen(false);
          } : undefined}
          onDeviceStream={syncPhoneCameraStream}
        />}
      {cameraSourcePicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(0,0,0,0.82)', display: 'grid', placeItems: 'center', padding: '16px' }}>
          <div style={{ width: 'min(480px, 100%)', background: '#171717', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '8px', color: 'white', padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div><div style={{ fontSize: '15px', fontWeight: '700' }}>Choose Camera Source</div><div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '4px' }}>Select a camera before the source is added to this scene.</div></div>
              <button onClick={() => setCameraSourcePicker(null)} title="Cancel" style={{ width: '32px', height: '32px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: 'white', cursor: 'pointer' }}><X size={15} /></button>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              <label style={{ display: 'grid', gap: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.65)' }}>Video device
                <select value={cameraSourcePicker.deviceId} onChange={(event) => setCameraSourcePicker((current) => ({ ...current, deviceId: event.target.value }))} style={{ width: '100%', padding: '10px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white' }}>
                  {cameraDevices.length === 0 && <option value="">Default video device</option>}
                  {cameraDevices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.category}: {device.label}</option>)}
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <label style={{ display: 'grid', gap: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.65)' }}>Resolution
                  <select value={cameraSourcePicker.resolution} onChange={(event) => setCameraSourcePicker((current) => ({ ...current, resolution: event.target.value }))} style={{ padding: '9px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white' }}>
                    <option value="auto">Device native / Auto</option>
                    <option value="1280x720">720p HD</option>
                    <option value="1920x1080">1080p Full HD</option>
                    <option value="2560x1440">1440p</option>
                    <option value="3840x2160">2160p 4K</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.65)' }}>Frame rate
                  <select value={cameraSourcePicker.fps} onChange={(event) => setCameraSourcePicker((current) => ({ ...current, fps: Number(event.target.value) }))} style={{ padding: '9px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white' }}>
                    <option value={24}>24 FPS</option><option value={30}>30 FPS</option><option value={50}>50 FPS</option><option value={60}>60 FPS</option>
                  </select>
                </label>
              </div>
              <label style={{ display: 'grid', gap: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.65)' }}>Device audio
                <select value={cameraSourcePicker.audioDeviceId} onChange={(event) => setCameraSourcePicker((current) => ({ ...current, audioDeviceId: event.target.value }))} style={{ width: '100%', padding: '9px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: 'white' }}>
                  <option value="">Video only (no microphone permission)</option>
                  {cameraAudioDevices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label}</option>)}
                </select>
              </label>
              <button onClick={() => refreshCameraDevices(true)} disabled={cameraDevicesLoading} style={{ justifySelf: 'start', padding: '7px 10px', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', background: '#242424', color: 'white', cursor: cameraDevicesLoading ? 'wait' : 'pointer', fontSize: '10px' }}>{cameraDevicesLoading ? 'Scanning devices...' : 'Refresh devices'}</button>
            </div>
            {cameraPickerError && <div style={{ marginTop: '10px', color: '#f87171', fontSize: '11px' }}>{cameraPickerError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => enableCamera(cameraSourcePicker.id, cameraSourcePicker.deviceId, cameraSourcePicker.resolution, cameraSourcePicker.fps, cameraSourcePicker.audioDeviceId)} style={{ padding: '10px', border: 0, borderRadius: '4px', background: '#d4a574', color: '#171717', fontWeight: '700', cursor: 'pointer' }}>Use Video Device</button>
              <button onClick={() => { setCameraManagerTarget(cameraSourcePicker); setCameraSourcePicker(null); setCameraManagerOpen(true); }} style={{ padding: '10px', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', background: '#242424', color: 'white', cursor: 'pointer' }}>Use Phone Camera</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const globalStyles = <style>{`
    @keyframes bgPan { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
    @keyframes bgPulse { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.25)} }
    @keyframes splitCameraReveal { from{opacity:.45;transform:scale(1.08)} to{opacity:1;transform:scale(1)} }
    @keyframes splitContentReveal { from{opacity:0;transform:translateX(${splitCameraSide === 'right' ? '-12%' : '12%'})} to{opacity:1;transform:translateX(0)} }
  `}</style>;

  if (isProjectorMode) {
    const toggleFullscreen = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch { /* the browser may deny fullscreen outside a direct click */ }
    };
    return (
      <div onDoubleClick={toggleFullscreen} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden', background: isBlack ? '#000' : (programContent ? getBoxBackground(programContent) : '#000'), ...((!isBlack && programContent && programContent.kind !== 'obs-scene') ? contentAnimationStyle(programContent) : {}), color: 'white', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {globalStyles}
        {!isBlack && transitioning && outgoingSnapshot && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: getBoxBackground(outgoingSnapshot), transition: `all ${transitionDuration}ms ease`, zIndex: 1, ...transitionStyle(false) }}>
            {getVideoBackground(outgoingSnapshot)}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{renderOutputContent(outgoingSnapshot, { hideText: textCleared, projector: true })}</div>
          </div>
        )}
        {!isBlack && programContent && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: getBoxBackground(programContent), transition: `all ${transitionDuration}ms ease`, zIndex: 2, ...transitionStyle(true) }}>
            {getVideoBackground(programContent)}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{renderOutputContent(programContent, { hideText: textCleared, projector: true })}</div>
          </div>
        )}
        {!window.solaDesktop?.isDesktop && <button onClick={toggleFullscreen} title="Toggle fullscreen" style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 20, width: '36px', height: '36px', display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '4px', color: 'white', cursor: 'pointer' }}><Maximize2 size={17} /></button>}
      </div>
    );
  }

  if (viewMode === 'obs') {
    const menuItems = ['File', 'Edit', 'View', 'Docks', 'Profile', 'Scene Collection', 'Tools', 'Help'];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f0f', color: 'white', fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden' }}>
        {globalStyles}
        {modal && <Modal modal={modal} onClose={() => setModal(null)} />}
        {cameraDialogs}
        <RecordingManager
          open={recordingManagerOpen}
          onClose={() => setRecordingManagerOpen(false)}
          status={recordingStatus}
          elapsedMs={recordingElapsedMs}
          settings={recordingSettings}
          onSettingsChange={updateRecordingSettings}
          formats={recordingFormats}
          saveLocation={recordingSaveLocation}
          onChooseLocation={chooseRecordingLocation}
          onOpenProgram={openActiveOutputs}
          onStart={startProgramRecording}
          onPause={() => getRecordingEngine().pause()}
          onResume={() => getRecordingEngine().resume()}
          onStop={() => getRecordingEngine().stop()}
          error={recordingError}
          completion={recordingCompletion}
        />
        <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageFile} style={{ display: 'none' }} />
        <input ref={mediaInputRef} type="file" accept="video/*,audio/*" onChange={handleMediaFile} style={{ display: 'none' }} />
        <div style={{ padding: '10px 16px 6px', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>SolaWorship — Scene Studio</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '0 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={() => setViewMode('planner')} style={{ ...headerIconBtn(false), marginRight: '10px' }}><ArrowLeft size={12} /> Back to Planner</button>
          {menuItems.map((menuItem) => <button key={menuItem} onClick={() => menuItem === 'File' && setViewMode('planner')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '11px', padding: '6px 8px', cursor: 'pointer' }}>{menuItem}</button>)}
        </div>
        <div style={{ display: 'flex', gap: '0', padding: '10px', height: '38%' }}>
          <div ref={previewCanvasRef} style={{ flex: 1, position: 'relative', background: '#000', border: '1px solid ' + (studioMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)'), overflow: 'hidden', opacity: studioMode ? 1 : 0.35 }}>
            <span style={{ position: 'absolute', top: '8px', left: '8px', fontSize: '10px', background: 'rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: '3px', zIndex: 2 }}>Preview{!studioMode && ' (Studio Mode off)'}</span>
            {activeObsScene && activeObsScene.sources.map((sceneSource) => renderSceneSource(sceneSource, false))}
            {studioMode && activeObsSceneId !== 'scene-planner' && activeObsScene?.sources.filter((source) => source.visible).map((source, index) => {
              const selected = selectedSourceIds.includes(source.id) || selectedSourceId === source.id;
              return (
                <div key={`control-${source.id}`} onMouseDown={(event) => beginSourceTransform(event, source)} title={source.locked ? `${source.name} is locked` : `Drag ${source.name}`} style={{ position: 'absolute', left: `${Number(source.x || 0)}%`, top: `${Number(source.y || 0)}%`, width: `${Number(source.width ?? 100)}%`, height: `${Number(source.height ?? 100)}%`, boxSizing: 'border-box', border: selected ? '2px solid #d4a574' : '1px solid transparent', cursor: source.locked ? 'not-allowed' : 'move', zIndex: 30 + index, pointerEvents: source.locked ? 'none' : 'auto' }}>
                  {selected && <><span style={{ position: 'absolute', left: 0, top: '-20px', padding: '2px 5px', background: '#d4a574', color: '#17110b', fontSize: '8px', fontWeight: '700', whiteSpace: 'nowrap' }}>{source.name}{source.groupId ? ' - GROUPED' : ''}</span><button onMouseDown={(event) => beginSourceTransform(event, source, 'resize')} title="Resize" style={{ position: 'absolute', right: '-6px', bottom: '-6px', width: '13px', height: '13px', padding: 0, border: '2px solid #111', borderRadius: '2px', background: '#d4a574', cursor: 'nwse-resize' }} /></>}
                </div>
              );
            })}
          </div>
          <div style={{ width: '160px', background: '#171717', border: '1px solid rgba(255,255,255,0.1)', borderLeft: 'none', borderRight: 'none', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', opacity: studioMode ? 1 : 0.4 }}>
            <select value={transitionType} onChange={(event) => setTransitionType(event.target.value)} disabled={!studioMode} style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'white', fontSize: '11px', padding: '5px' }}>
              <option>Fade</option><option>Cut</option><option>Slide</option><option>Wipe</option><option>Dissolve</option>
            </select>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>Duration</div>
            <input type="range" min="0" max="2000" step="100" value={transitionDuration} disabled={!studioMode} onChange={(event) => setTransitionDuration(Number(event.target.value))} style={{ accentColor: '#d4a574' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button disabled={!studioMode} onClick={() => setTransitionDuration((current) => Math.max(0, current - 100))} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '3px', color: 'white', width: '20px', height: '20px', cursor: 'pointer' }}>−</button>
              <span style={{ fontSize: '11px', flex: 1, textAlign: 'center' }}>{transitionDuration}ms</span>
              <button disabled={!studioMode} onClick={() => setTransitionDuration((current) => Math.min(2000, current + 100))} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '3px', color: 'white', width: '20px', height: '20px', cursor: 'pointer' }}>+</button>
            </div>
            <button disabled={!studioMode} onClick={() => transitionToScene(activeObsScene)} style={{ marginTop: 'auto', padding: '8px', background: studioMode ? '#d4a574' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '5px', color: studioMode ? '#1a1a1a' : 'rgba(255,255,255,0.4)', fontWeight: '700', fontSize: '10px', cursor: studioMode ? 'pointer' : 'not-allowed' }}>SEND PREVIEW TO PROGRAM</button>
            {!studioMode && <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>Clicking a scene goes live instantly</div>}
          </div>
          <div style={{ flex: 1, position: 'relative', background: '#000', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', top: '8px', left: '8px', fontSize: '10px', background: 'rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: '3px', zIndex: 3 }}>Program</span>
            {!isBlack && (
              <>
                {transitioning && outgoingSnapshot && (
                  <div style={{ position: 'absolute', inset: 0, transition: `all ${transitionDuration}ms ease`, zIndex: 1, ...transitionStyle(false) }}>
                    {renderOutputContent(outgoingSnapshot, { hideText: textCleared })}
                  </div>
                )}
                <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transition: `all ${transitionDuration}ms ease`, zIndex: 2, ...transitionStyle(true) }}>
                  {renderOutputContent(programContent, { hideText: textCleared })}
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, borderTop: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
          <div style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.5px' }}>SCENES</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={deleteActiveObsScene} disabled={activeObsSceneId === 'scene-planner'} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '3px', color: activeObsSceneId === 'scene-planner' ? 'rgba(255,255,255,0.2)' : 'white', width: '18px', height: '18px', cursor: activeObsSceneId === 'scene-planner' ? 'default' : 'pointer', fontSize: '11px' }}>−</button>
                <button onClick={addObsScene} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '3px', color: 'white', width: '18px', height: '18px', cursor: 'pointer', fontSize: '11px' }}>+</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {allScenes.map((scene) => (
                <div key={scene.id} onClick={() => activateObsScene(scene)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', cursor: 'pointer', background: activeObsSceneId === scene.id ? 'rgba(212,165,116,0.15)' : 'transparent', borderBottom: scene.locked ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                  <Circle size={7} fill={activeObsSceneId === scene.id ? '#d4a574' : 'transparent'} color={activeObsSceneId === scene.id ? '#d4a574' : 'rgba(255,255,255,0.3)'} />
                  <span style={{ fontSize: '11px', color: activeObsSceneId === scene.id ? '#d4a574' : 'white' }}>{scene.name}</span>
                  {programContent && programContent.kind === 'obs-scene' && programContent.scene.id === scene.id && !isBlack && <span style={{ marginLeft: 'auto', fontSize: '8px', color: '#4ade80', fontWeight: '700' }}>● LIVE</span>}
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.5px' }}>SOURCES</span>
              <div style={{ display: 'flex', gap: '4px', position: 'relative' }}>
                <button onClick={removeSelectedSource} disabled={activeObsSceneId === 'scene-planner'} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '3px', color: activeObsSceneId === 'scene-planner' ? 'rgba(255,255,255,0.2)' : 'white', width: '18px', height: '18px', cursor: activeObsSceneId === 'scene-planner' ? 'default' : 'pointer', fontSize: '11px' }}>−</button>
                <button onClick={(event) => { event.stopPropagation(); if (activeObsSceneId !== 'scene-planner') setAddSourceMenuOpen((value) => !value); }} disabled={activeObsSceneId === 'scene-planner'} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '3px', color: activeObsSceneId === 'scene-planner' ? 'rgba(255,255,255,0.2)' : 'white', width: '18px', height: '18px', cursor: activeObsSceneId === 'scene-planner' ? 'default' : 'pointer', fontSize: '11px' }}>+</button>
                {addSourceMenuOpen && activeObsSceneId !== 'scene-planner' && (
                  <div onClick={(event) => event.stopPropagation()} style={{ position: 'absolute', top: '22px', right: 0, background: '#222', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', zIndex: 20, width: '190px', maxHeight: '310px', overflowY: 'auto' }}>
                    {SOURCE_TYPES.filter(([type]) => type !== 'planner').map(([type, label]) => (
                      <button key={type} onClick={() => addObsSource(type)} style={{ width: '100%', display: 'flex', gap: '7px', alignItems: 'center', padding: '7px 9px', background: 'none', border: 'none', color: 'white', fontSize: '10px', cursor: 'pointer', textAlign: 'left' }}>
                        {type === 'color' ? <Palette size={11} /> : type === 'text' ? <Type size={11} /> : type === 'image' ? <ImageIcon size={11} /> : type === 'camera' ? <Video size={11} /> : <Plus size={11} />} {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {selectedSourceIds.length > 0 && <div style={{ display: 'flex', gap: '5px', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}><button onClick={groupSelectedSources} disabled={selectedSourceIds.length < 2} style={{ flex: 1, padding: '4px', background: 'rgba(212,165,116,0.12)', border: '1px solid rgba(212,165,116,0.4)', borderRadius: '3px', color: '#d4a574', fontSize: '9px', cursor: 'pointer' }}>Group ({selectedSourceIds.length})</button><button onClick={ungroupSelectedSources} style={{ flex: 1, padding: '4px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '3px', color: 'white', fontSize: '9px', cursor: 'pointer' }}>Ungroup</button></div>}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
              {activeObsSceneId === 'scene-planner' && (
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', padding: '8px', lineHeight: '1.5' }}>
                  This scene always mirrors whatever is staged in the Planner&apos;s Preview, live. Switch to the Planner tab to change what it shows — this scene updates automatically, even while it&apos;s on Program.
                </div>
              )}
              {activeObsScene && activeObsSceneId !== 'scene-planner' && activeObsScene.sources.length === 0 && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', padding: '8px' }}>No sources</div>}
              {activeObsScene && activeObsSceneId !== 'scene-planner' && activeObsScene.sources.map((source) => (
                <div key={source.id} onClick={(event) => selectObsSource(source.id, event)} style={{ background: selectedSourceIds.includes(source.id) || selectedSourceId === source.id ? 'rgba(212,165,116,0.15)' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (selectedSourceIds.includes(source.id) || selectedSourceId === source.id ? '#d4a574' : 'rgba(255,255,255,0.08)'), borderRadius: '4px', marginBottom: '5px', padding: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px' }}>{source.name}</span>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button onClick={(event) => { event.stopPropagation(); moveSource(source.id, -1); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><ArrowUp size={10} color="rgba(255,255,255,0.4)" /></button>
                      <button onClick={(event) => { event.stopPropagation(); moveSource(source.id, 1); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><ArrowDown size={10} color="rgba(255,255,255,0.4)" /></button>
                      <button onClick={(event) => { event.stopPropagation(); toggleSourceLock(source.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: source.locked ? '#d4a574' : 'rgba(255,255,255,0.45)', fontSize: '10px' }}>{source.locked ? 'Lock' : 'Free'}</button>
                      <button onClick={(event) => { event.stopPropagation(); duplicateSource(source); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: '10px' }}>Dup</button>
                      <button onClick={(event) => { event.stopPropagation(); removeObsSource(source.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={10} color="#f87171" /></button>
                      <button onClick={(event) => { event.stopPropagation(); toggleSourceVisible(source.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>{source.visible ? <Eye size={11} color="#4ade80" /> : <EyeOff size={11} color="rgba(255,255,255,0.4)" />}</button>
                    </div>
                  </div>
                  {source.type === 'color' && <input type="color" value={source.color} onChange={(event) => updateSourceField(source.id, 'color', event.target.value)} style={{ marginTop: '5px', width: '100%', height: '18px', border: 'none', borderRadius: '3px' }} />}
                  {source.type === 'text' && <div onClick={(event) => event.stopPropagation()}><textarea rows={3} value={source.text} onChange={(event) => updateSourceField(source.id, 'text', event.target.value)} style={{ marginTop: '5px', width: '100%', padding: '5px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', color: 'white', fontSize: '10px', lineHeight: 1.35, resize: 'vertical', boxSizing: 'border-box' }} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 34px', gap: '5px', marginTop: '4px' }}><select value={source.template || 'clean'} onChange={(event) => updateSourceField(source.id, 'template', event.target.value)} style={{ minWidth: 0, background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', color: 'white', fontSize: '9px' }}><option value="clean">Clean text</option><option value="title">Classic title</option><option value="scripture">Scripture panel</option><option value="caption">Caption bar</option></select><input type="color" value={source.fontColor || '#ffffff'} onChange={(event) => updateSourceField(source.id, 'fontColor', event.target.value)} title="Font color" style={{ width: '34px', height: '24px', border: 0, padding: 0, background: 'none' }} /></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginTop: '4px' }}><select value={source.fontFamily || 'Arial, sans-serif'} onChange={(event) => updateSourceField(source.id, 'fontFamily', event.target.value)} style={{ minWidth: 0, background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', color: 'white', fontSize: '9px' }}><option value="Arial, sans-serif">Arial</option><option value={'Georgia, "Times New Roman", serif'}>Georgia</option><option value="Verdana, sans-serif">Verdana</option></select><input type="number" min="12" max="160" value={source.fontSize || 42} onChange={(event) => updateSourceField(source.id, 'fontSize', Number(event.target.value))} title="Font size" style={{ minWidth: 0, padding: '3px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', color: 'white', fontSize: '9px' }} /></div></div>}
                  {scenePanelTypes.includes(source.type) && <div onClick={(event) => event.stopPropagation()} style={{ marginTop: '5px' }}><input value={source.type === 'scripture' ? source.reference : source.type === 'song-panel' ? source.label : source.title} onChange={(event) => updateSourceField(source.id, source.type === 'scripture' ? 'reference' : source.type === 'song-panel' ? 'label' : 'title', event.target.value)} placeholder="Heading" style={{ width: '100%', padding: '4px 5px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', color: '#d4a574', fontSize: '9px', boxSizing: 'border-box' }} /><textarea rows={4} value={source.text} onChange={(event) => updateSourceField(source.id, 'text', event.target.value)} style={{ marginTop: '4px', width: '100%', padding: '5px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', color: 'white', fontSize: '10px', lineHeight: 1.35, resize: 'vertical', boxSizing: 'border-box' }} /><button onClick={() => applyPlannerPreviewToPanel(source)} style={{ width: '100%', marginTop: '4px', padding: '5px', background: 'rgba(212,165,116,0.15)', border: '1px solid #d4a574', borderRadius: '3px', color: '#d4a574', fontSize: '9px', fontWeight: '700', cursor: 'pointer' }}>Use current Planner preview</button><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 30px', gap: '4px', marginTop: '4px' }}><button onClick={() => applyPanelSide(source.id, 'left')} style={{ padding: '4px', background: source.x < 50 ? 'rgba(74,222,128,.14)' : 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.15)', borderRadius: '3px', color: 'white', fontSize: '8px', cursor: 'pointer' }}>Panel left</button><button onClick={() => applyPanelSide(source.id, 'right')} style={{ padding: '4px', background: source.x >= 50 ? 'rgba(74,222,128,.14)' : 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.15)', borderRadius: '3px', color: 'white', fontSize: '8px', cursor: 'pointer' }}>Panel right</button><input type="color" value={source.panelColor || '#17120f'} onChange={(event) => updateSourceField(source.id, 'panelColor', event.target.value)} title="Panel color" style={{ width: '30px', height: '24px', border: 0, padding: 0, background: 'none' }} /></div></div>}
                  {source.type === 'image' && source.dataUrl && <div onClick={(event) => event.stopPropagation()} style={{ display: 'flex', gap: '4px', marginTop: '5px' }}><button onClick={() => updateSourceFields(source.id, { x: 0, y: 0, width: 100, height: 100, objectFit: 'cover' })} style={{ flex: 1, padding: '4px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '3px', color: 'white', fontSize: '9px', cursor: 'pointer' }}>Full page</button><button onClick={() => updateSourceFields(source.id, { x: 65, y: 5, width: 28, height: 28, objectFit: 'contain' })} style={{ flex: 1, padding: '4px', background: 'rgba(212,165,116,0.12)', border: '1px solid rgba(212,165,116,0.4)', borderRadius: '3px', color: '#d4a574', fontSize: '9px', cursor: 'pointer' }}>Resizable</button></div>}
                  {source.type === 'lower-third' && <><input value={source.title} onChange={(event) => updateSourceField(source.id, 'title', event.target.value)} style={{ marginTop: '5px', width: '100%', padding: '3px 5px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', color: 'white', fontSize: '10px', boxSizing: 'border-box' }} /><input value={source.subtitle} onChange={(event) => updateSourceField(source.id, 'subtitle', event.target.value)} style={{ marginTop: '4px', width: '100%', padding: '3px 5px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', color: 'white', fontSize: '10px', boxSizing: 'border-box' }} /></>}
                  {source.type === 'browser' && <input value={source.url} onChange={(event) => updateSourceField(source.id, 'url', event.target.value)} style={{ marginTop: '5px', width: '100%', padding: '3px 5px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', color: 'white', fontSize: '10px', boxSizing: 'border-box' }} />}
                  {source.type === 'screen' && <button onClick={(event) => { event.stopPropagation(); startScreenCapture(source.id); }} style={{ marginTop: '5px', width: '100%', padding: '4px', background: 'rgba(212,165,116,0.15)', border: '1px solid #d4a574', borderRadius: '3px', color: '#d4a574', fontSize: '9px', cursor: 'pointer' }}>Select Screen / Window / Tab</button>}
                  {source.type === 'countdown' && <div onClick={(event) => event.stopPropagation()}><input type="number" min="0" value={source.seconds} onChange={(event) => updateSourceFields(source.id, { seconds: Number(event.target.value), initialSeconds: Number(event.target.value), timerRunning: false, timerEndsAt: null })} style={{ marginTop: '5px', width: '100%', padding: '4px 5px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', color: 'white', fontSize: '10px', boxSizing: 'border-box' }} /><div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}><button onClick={() => source.timerRunning ? pauseCountdown(source) : startCountdown(source)} style={{ flex: 1, padding: '5px', background: source.timerRunning ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)', border: `1px solid ${source.timerRunning ? '#f87171' : '#4ade80'}`, borderRadius: '3px', color: source.timerRunning ? '#f87171' : '#4ade80', fontSize: '9px', fontWeight: '700', cursor: 'pointer' }}>{source.timerRunning ? 'Pause' : 'Start countdown'}</button><button onClick={() => resetCountdown(source)} style={{ padding: '5px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '3px', color: 'white', fontSize: '9px', cursor: 'pointer' }}>Reset</button><input type="color" value={source.fontColor || '#ffffff'} onChange={(event) => updateSourceField(source.id, 'fontColor', event.target.value)} title="Timer color" style={{ width: '28px', height: '26px', border: 0, padding: 0, background: 'none' }} /></div></div>}
                  {(source.type === 'logo') && <input value={source.text} onChange={(event) => updateSourceField(source.id, 'text', event.target.value)} style={{ marginTop: '5px', width: '100%', padding: '3px 5px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', color: 'white', fontSize: '10px', boxSizing: 'border-box' }} />}
                  {source.type === 'camera' && <div onClick={(event) => event.stopPropagation()} style={{ marginTop: '5px' }}><button onClick={() => { setCameraSourcePicker({ id: source.id, deviceId: source.deviceId || '', audioDeviceId: source.audioDeviceId || '', resolution: source.resolution || '1920x1080', fps: source.fps || 30 }); refreshCameraDevices(true); }} style={{ width: '100%', padding: '4px', background: 'rgba(212,165,116,0.15)', border: '1px solid #d4a574', borderRadius: '3px', color: '#d4a574', fontSize: '9px', cursor: 'pointer' }}>{cameraStreams[source.id] ? 'Change Video Device' : 'Choose Video Device'}</button>{cameraStreams[source.id] && <div style={{ marginTop: '4px', color: 'rgba(255,255,255,0.45)', fontSize: '8px' }}>{source.resolution || 'Native'} · {Math.round(source.fps || 30)} FPS{source.audioDeviceId ? ' · Audio' : ''}</div>}</div>}
                  {source.type === 'phone-camera' && !cameraStreams[source.id] && <button onClick={(event) => { event.stopPropagation(); setCameraSourcePicker({ id: source.id, deviceId: source.deviceId || '', audioDeviceId: '', resolution: '1920x1080', fps: 30 }); refreshCameraDevices(); }} style={{ marginTop: '5px', width: '100%', padding: '4px', background: 'rgba(212,165,116,0.15)', border: '1px solid #d4a574', borderRadius: '3px', color: '#d4a574', fontSize: '9px', cursor: 'pointer' }}>Reconnect Camera</button>}
                  {selectedSourceId === source.id && <button onClick={(event) => { event.stopPropagation(); setShowAdvancedSource((value) => !value); }} style={{ width: '100%', marginTop: '6px', padding: '4px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px', color: 'rgba(255,255,255,0.55)', fontSize: '8px', cursor: 'pointer' }}>{showAdvancedSource ? 'Hide advanced controls' : 'Advanced controls'}</button>}
                  {selectedSourceId === source.id && showAdvancedSource && (
                    <div onClick={(event) => event.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginTop: '7px' }}>
                      {[['x', 'X %', -100, 100], ['y', 'Y %', -100, 100], ['width', 'Width %', 5, 100], ['height', 'Height %', 5, 100], ['rotation', 'Rotate', -180, 180], ['opacity', 'Opacity', 0, 100], ['crop', 'Crop', 0, 45]].map(([field, label, min, max]) => (
                        <label key={field} style={{ fontSize: '8px', color: 'rgba(255,255,255,0.45)' }}>{label}
                          <input type="number" min={min} max={max} value={source[field] ?? (['width', 'height', 'opacity'].includes(field) ? 100 : 0)} onChange={(event) => updateSourceField(source.id, field, Number(event.target.value))} disabled={source.locked} style={{ width: '100%', marginTop: '2px', padding: '3px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', color: 'white', fontSize: '10px', boxSizing: 'border-box' }} />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {captureStatus && <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', padding: '6px 2px', lineHeight: 1.4 }}>{captureStatus}</div>}
            </div>
          </div>
          <div style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.5px' }}>AUDIO MIXER</span>
              <SlidersHorizontal size={12} color="rgba(255,255,255,0.4)" />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '5px', marginBottom: '10px', fontSize: '9px', color: 'rgba(255,255,255,0.55)' }}>
                <div>Audio Inputs - Processing - Mixer - Master Bus - Program Output</div>
                <div style={{ color: 'rgba(255,255,255,0.35)' }}>Recording, streaming, and monitoring receive the Program Output. Desktop/system audio depends on browser capture support and user permission.</div>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button onClick={enableAudioEngine} style={{ flex: 1, padding: '6px', background: audioEngineReady ? 'rgba(74,222,128,0.15)' : 'rgba(212,165,116,0.15)', border: `1px solid ${audioEngineReady ? '#4ade80' : '#d4a574'}`, borderRadius: '4px', color: audioEngineReady ? '#4ade80' : '#d4a574', fontSize: '9px', cursor: 'pointer' }}>{audioEngineReady ? 'Audio Engine Active' : 'Enable Audio Engine'}</button>
                  <button onClick={() => setAudioMonitoring((current) => !current)} disabled={!audioEngineReady} style={{ flex: 1, padding: '6px', background: audioMonitoring ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${audioMonitoring ? '#4ade80' : 'rgba(255,255,255,0.14)'}`, borderRadius: '4px', color: audioMonitoring ? '#4ade80' : 'white', fontSize: '9px', cursor: 'pointer' }}>Monitor {audioMonitoring ? 'On' : 'Off'}</button>
                </div>
              </div>
              {audioChannels.map((channel) => (
                <div key={channel.id} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>{iconFor(channel.icon)}<span style={{ fontSize: '10px' }}>{channel.name}</span></div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => connectAudioInput(channel)} title="Connect this audio input" style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '3px', color: '#d4a574', cursor: 'pointer', fontSize: '9px' }}>IN</button>
                      <button onClick={() => setAudioChannels((current) => Audio.toggleSolo(current, channel.id))} style={{ background: channel.solo ? '#d4a574' : 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '3px', color: channel.solo ? '#1a1a1a' : 'white', cursor: 'pointer', fontSize: '9px' }}>S</button>
                      <button onClick={() => setAudioChannels((current) => Audio.toggleMute(current, channel.id))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>{channel.muted ? <VolumeX size={12} color="#e05a5a" /> : <Volume2 size={12} color="rgba(255,255,255,0.6)" />}</button>
                    </div>
                  </div>
                  <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>{channel.inputType} - {channel.bus} bus - {channel.available}</div>
                  <div style={{ display: 'flex', gap: '1px' }}>{Array.from({ length: 16 }).map((_, index) => <div key={index} style={{ flex: 1, height: '6px', background: !channel.muted && index < Math.round((audioMeters[channel.id] || 0) / 100 * 16) ? (index > 12 ? '#f87171' : '#4ade80') : 'rgba(255,255,255,0.1)' }} />)}</div>
                  <input type="range" min="0" max="100" value={channel.muted ? 0 : channel.level} onChange={(event) => setAudioChannels((current) => Audio.setChannelLevel(current, channel.id, Number(event.target.value)))} disabled={channel.muted} style={{ width: '100%', accentColor: '#d4a574', marginTop: '3px' }} />
                  <label style={{ display: 'block', fontSize: '8px', color: 'rgba(255,255,255,0.45)' }}>Gain {channel.gain ?? 0} dB
                    <input type="range" min="-24" max="24" value={channel.gain ?? 0} onChange={(event) => setAudioChannels((current) => Audio.setChannelGain(current, channel.id, Number(event.target.value)))} style={{ width: '100%', accentColor: '#7dd3fc' }} />
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '3px' }}>{(channel.processing || []).map((stage) => <span key={stage} style={{ fontSize: '8px', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '3px', padding: '2px 4px' }}>{stage}</span>)}</div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '8px', marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '4px' }}><span>Master Bus</span><span>{masterVolume}%</span></div>
                <input type="range" min="0" max="100" value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} style={{ width: '100%', accentColor: '#4ade80' }} />
                <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>Prepared buses: Master, Aux 1, Monitor Mix. Prepared effects: EQ, compressor, gate, limiter, reverb, delay.</div>
              </div>
            </div>
          </div>
          <div style={{ width: '160px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.5px' }}>CONTROLS</span>
              <Power size={12} color="rgba(255,255,255,0.4)" />
            </div>
            <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button onClick={() => showAlert('Streaming bridge required', 'Browsers cannot publish RTMP directly. Connect a desktop streaming bridge before this control can start a real stream.')} style={{ padding: '9px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '5px', color: 'rgba(255,255,255,0.55)', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>Streaming unavailable</button>
              <button onClick={() => setRecordingManagerOpen(true)} style={{ padding: '8px', background: recording ? 'rgba(220,38,38,0.2)' : recordingStatus === 'complete' ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (recording ? '#dc2626' : recordingStatus === 'complete' ? '#4ade80' : 'rgba(255,255,255,0.15)'), borderRadius: '5px', color: recording ? '#f87171' : recordingStatus === 'complete' ? '#4ade80' : 'white', fontSize: '11px', cursor: 'pointer' }}>{recordingStatus === 'recording' ? 'Recording Program' : recordingStatus === 'paused' ? 'Recording Paused' : recordingStatus === 'finalizing' ? 'Finalizing Video' : 'Recording Manager'}</button>
              <button onClick={() => showAlert('Virtual camera unavailable', 'A browser cannot register an operating-system virtual camera device. Use a desktop bridge for this output.')} style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '5px', color: 'rgba(255,255,255,0.55)', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}><CameraIcon size={12} /> Virtual Camera unavailable</button>
              <button onClick={() => setStudioMode((current) => !current)} style={{ padding: '8px', background: studioMode ? 'rgba(212,165,116,0.15)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (studioMode ? '#d4a574' : 'rgba(255,255,255,0.15)'), borderRadius: '5px', color: studioMode ? '#d4a574' : 'white', fontSize: '11px', cursor: 'pointer' }}>Studio Mode {studioMode ? 'ON' : 'OFF'}</button>
            <button onClick={takeSceneLive} style={{ padding: '8px', background: '#2563eb', border: '1px solid #2563eb', borderRadius: '5px', color: 'white', fontSize: '10px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}><Monitor size={12} /> PROJECT PROGRAM</button>
              <button onClick={() => setLiveOutputsOpen((current) => !current)} style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '5px', color: 'white', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}><SettingsIcon size={12} /> Settings</button>
              <button onClick={() => setViewMode('planner')} style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '5px', color: 'white', fontSize: '11px', cursor: 'pointer', marginTop: 'auto' }}>Exit</button>
            </div>
          </div>
        </div>
        {liveOutputsOpen && (
          <div onClick={(event) => event.stopPropagation()} style={{ position: 'fixed', bottom: '60px', right: '20px', background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '10px', width: '220px', zIndex: 60 }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', fontWeight: '700' }}>OUTPUT DESTINATIONS</div>
            {outputDestinationRows}
            <button onClick={copyTabletDisplayLink} style={{ width: '100%', marginTop: '8px', padding: '8px', background: 'rgba(37,99,235,0.16)', border: '1px solid #3b82f6', borderRadius: '4px', color: '#bfdbfe', cursor: 'pointer', fontSize: '10px' }}>Copy Tablet Screen Link</button>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 14px', borderTop: '1px solid rgba(255,255,255,0.1)', background: '#161616', fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: programContent && !isBlack ? '#4ade80' : 'rgba(255,255,255,0.4)', fontWeight: '700' }}>{programContent && !isBlack ? '● PROGRAM ACTIVE' : '○ PROGRAM IDLE'}</span>
            <span>{recording ? `Program recording ${recordingStatus}` : recordingStatus === 'complete' ? 'Recording file complete' : audioEngineReady ? 'Audio engine active' : 'Audio engine off'}</span>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>{Object.keys(cameraStreams).length} camera stream(s)</span><span>{Object.keys(screenStreams).length} screen capture(s)</span><span>RTMP bridge: not connected</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f0f', color: 'white', fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden', position: 'relative' }}>
      {globalStyles}
      {modal && <Modal modal={modal} onClose={() => setModal(null)} />}
      {cameraDialogs}
      {editingSlide && (
        <SlideEditor
          presName={slidePresentations.find((presentation) => presentation.id === editingSlide.presentationId)?.name || ''}
          slide={editingSlide.slide}
          bgCss={getBoxBackground({ kind: 'slide-deck' })}
          onClose={() => setEditingSlide(null)}
          onSave={(updates) => { updateSlideStyle(editingSlide.presentationId, editingSlide.slide.id, updates); setEditingSlide(null); }}
        />
      )}
      {songEditorOpen && <SongEditor onClose={() => setSongEditorOpen(false)} onSave={createLocalSong} />}
      <input ref={themeUploadRef} type="file" accept="image/*,video/*" onChange={(event) => readLibraryFile(event, 'theme')} style={{ display: 'none' }} />
      <input ref={mediaLibraryUploadRef} type="file" accept="image/*,video/*" onChange={(event) => readLibraryFile(event, 'media')} style={{ display: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#1a1a1a', borderBottom: '1px solid rgba(255,255,255,0.1)', gap: '8px' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', height: '40px' }}>
          <button onClick={(event) => { event.stopPropagation(); setRadialOpen((current) => !current); }} style={{ width: '40px', height: '40px', borderRadius: '50%', background: radialOpen ? '#d4a574' : '#241c14', border: '2px solid #d4a574', fontSize: '17px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="SolaWorship menu">🙏</button>
          <button onClick={(event) => { event.stopPropagation(); setRadialOpen((current) => !current); }} style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)', color: '#d4a574', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transform: radialOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.35s ease', flexShrink: 0 }}><ChevronRight size={12} /></button>
          <div onClick={(event) => event.stopPropagation()} style={{ display: 'flex', gap: '8px', maxWidth: radialOpen ? '220px' : '0px', opacity: radialOpen ? 1 : 0, overflow: 'hidden', transition: 'max-width 0.4s ease, opacity 0.3s ease' }}>
            {[
              { key: 'new', icon: <FilePlus size={14} />, onClick: newProject },
              { key: 'save', icon: <Save size={14} />, onClick: saveProject },
              { key: 'open', icon: <FolderOpen size={14} />, onClick: openMenuClicked },
              { key: 'live', icon: <Radio size={14} />, onClick: () => setLiveOutputsOpen((current) => !current) },
            ].map((item) => (
              <button key={item.key} onClick={item.onClick} style={{ ...roundBtn, flexShrink: 0 }}>{item.icon}</button>
            ))}
          </div>
          {openListVisible && (
            <div onClick={(event) => event.stopPropagation()} style={{ position: 'absolute', top: '48px', left: '70px', background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px', width: '190px', zIndex: 30, boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px', textTransform: 'uppercase' }}>Saved Projects</div>
              {savedProjects.length === 0 && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', padding: '4px 0' }}>None yet</div>}
              {savedProjects.map((projectKey) => (
                <button key={projectKey.key || projectKey} onClick={() => loadProject(projectKey.key || projectKey)} style={{ width: '100%', textAlign: 'left', padding: '6px 4px', background: 'none', border: 'none', color: '#d4a574', fontSize: '11px', cursor: 'pointer' }}>{(projectKey.key || projectKey).replace('sola-worship:project:', '')}</button>
              ))}
            </div>
          )}
          {liveOutputsOpen && (
            <div onClick={(event) => event.stopPropagation()} style={{ position: 'absolute', top: '48px', left: '70px', background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '10px', width: '220px', zIndex: 30 }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', fontWeight: '700' }}>OUTPUT DESTINATIONS</div>
              {outputDestinationRows}
              <button onClick={copyTabletDisplayLink} style={{ width: '100%', marginTop: '8px', padding: '8px', background: 'rgba(37,99,235,0.16)', border: '1px solid #3b82f6', borderRadius: '4px', color: '#bfdbfe', cursor: 'pointer', fontSize: '10px' }}>Copy Tablet Screen Link</button>
              <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                <input value={newOutputName} onChange={(event) => setNewOutputName(event.target.value)} placeholder="Add alternate output" style={{ flex: 1, padding: '5px 6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'white', fontSize: '11px' }} />
                <button onClick={() => { if (newOutputName.trim()) { setOutputs((current) => [...current, { id: 'o' + Date.now(), name: newOutputName.trim(), kind: 'display', active: true }]); setNewOutputName(''); } }} style={{ padding: '5px 8px', background: '#d4a574', border: 'none', borderRadius: '4px', color: '#1a1a1a', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>+</button>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '9px', color: storageStatus === 'ok' ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>{storageStatus === 'ok' ? '● synced' : '○'}</span>
          <button onClick={() => { setActiveObsSceneId('scene-planner'); setViewMode('obs'); }} title="Scene Studio (OBS-style) — opens showing your current Preview" style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Tv size={14} /></button>
          <button onClick={takePreviewLive} title="Project Preview full-screen on display 2" style={{ ...headerIconBtn(false), background: '#2563eb', borderColor: '#2563eb', color: 'white' }}><Monitor size={13} /> PROJECT</button>
          <button onClick={toggleBlack} style={{ ...headerIconBtn(isBlack), borderColor: '#dc2626', color: isBlack ? 'white' : '#f87171', background: isBlack ? '#dc2626' : 'rgba(220,38,38,0.12)' }}>⬛ {isBlack ? 'BLACK ON' : 'BLACK SCREEN'}</button>
          <button onClick={toggleClearText} style={headerIconBtn(textCleared)}>✕ {textCleared ? 'TEXT CLEARED' : 'CLEAR TEXT'}</button>
        </div>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div onDragOver={(event) => event.preventDefault()} onDrop={handleServiceDrop} style={{ width: '190px', background: '#0f0f0f', borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', padding: '8px 12px', textTransform: 'uppercase' }}>SERVICE ORDER</div>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', padding: '0 12px 6px' }}>Drag ⠿ handle to reorder</div>
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '36px' }}>
            {serviceOrder.map((item, index) => (
              <div key={item.id} ref={(element) => { serviceItemRefs.current[item.id] = element; }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContextMenu({ x: event.clientX, y: event.clientY, id: item.id }); }} style={{ position: 'relative', outline: pointerDragId === item.id ? '2px dashed #d4a574' : 'none', opacity: pointerDragId === item.id ? 0.5 : 1 }}>
                {editingId === item.id ? (
                  <div style={{ padding: '8px 12px', background: 'rgba(212,165,116,0.08)' }}>
                    <input value={editName} onChange={(event) => setEditName(event.target.value)} style={{ width: '100%', marginBottom: '4px', padding: '4px 6px', fontSize: '12px', background: '#1a1a1a', border: '1px solid #d4a574', borderRadius: '3px', color: 'white', boxSizing: 'border-box' }} />
                    <input value={editDuration} onChange={(event) => setEditDuration(event.target.value)} style={{ width: '100%', marginBottom: '4px', padding: '4px 6px', fontSize: '11px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '3px', color: 'white', boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => saveEdit(item.id)} style={{ flex: 1, padding: '4px', background: '#d4a574', border: 'none', borderRadius: '3px', color: '#1a1a1a', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: '4px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '3px', color: 'white', fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'stretch', background: stagedContent?.kind === 'service' && stagedContent.index === index ? 'rgba(212,165,116,0.15)' : 'transparent', borderLeft: stagedContent?.kind === 'service' && stagedContent.index === index ? '3px solid #d4a574' : '3px solid transparent' }}>
                      <div onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); setPointerDragId(item.id); }} title="Drag to reorder" style={{ display: 'flex', alignItems: 'center', padding: '0 2px', cursor: pointerDragId === item.id ? 'grabbing' : 'grab', color: 'rgba(255,255,255,0.35)' }}><GripVertical size={12} /></div>
                      <button onClick={() => stageServiceItem(index)} onDoubleClick={() => liveServiceItem(index)} style={{ flex: 1, padding: '8px 12px 8px 4px', textAlign: 'left', background: 'none', border: 'none', color: stagedContent?.kind === 'service' && stagedContent.index === index ? '#d4a574' : 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>{item.slides && item.slides.length > 0 && <span style={{ fontSize: '9px', color: '#d4a574' }}>♪</span>}<span>{item.name}</span></div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{item.duration}</div>
                      </button>
                    </div>
                    {expandedServiceItemId === item.id && item.slides && (
                      <div style={{ padding: '4px 8px 8px 26px', background: 'rgba(255,255,255,0.02)' }}>
                        {item.slides.map((slide) => (
                          <button key={slide.id} onClick={() => setStagedContent({ kind: 'song-slide', song: { title: item.name, artist: item.artist }, slide, fontSize: item.fontSize || songFontSize })} onDoubleClick={() => pushLive({ kind: 'song-slide', song: { title: item.name, artist: item.artist }, slide, fontSize: item.fontSize || songFontSize })} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 6px', marginBottom: '2px', background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: '3px', color: 'rgba(255,255,255,0.7)', fontSize: '10px', cursor: 'pointer' }}>{slide.label}</button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          {addingItem && (
            <div style={{ position: 'absolute', bottom: '40px', right: '8px', left: '8px', background: '#1e1e1e', border: '1px solid #d4a574', borderRadius: '6px', padding: '8px', zIndex: 10 }}>
              <input autoFocus value={newItemName} onChange={(event) => setNewItemName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addServiceItem()} placeholder="Item name..." style={{ width: '100%', padding: '5px 6px', fontSize: '12px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '3px', color: 'white', boxSizing: 'border-box', marginBottom: '5px' }} />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={addServiceItem} style={{ flex: 1, padding: '4px', background: '#d4a574', border: 'none', borderRadius: '3px', color: '#1a1a1a', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>Add</button>
                <button onClick={() => setAddingItem(false)} style={{ flex: 1, padding: '4px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '3px', color: 'white', fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}
          <button onClick={() => setAddingItem(true)} title="Add service item" style={{ position: 'absolute', bottom: '10px', right: '10px', width: '30px', height: '30px', borderRadius: '50%', background: '#d4a574', border: 'none', color: '#1a1a1a', fontSize: '18px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}><Plus size={16} strokeWidth={3} /></button>
        </div>
        {contextMenu && (
          <div onClick={(event) => event.stopPropagation()} style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', zIndex: 100, minWidth: '150px', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
            <button onClick={() => { const item = serviceOrder.find((entry) => entry.id === contextMenu.id); startEdit(item); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px', background: 'none', border: 'none', color: 'white', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}><Edit2 size={12} /> Edit</button>
            {(() => { const item = serviceOrder.find((entry) => entry.id === contextMenu.id); return item && item.slides && item.slides.length > 0 ? <button onClick={() => { setExpandedServiceItemId(expandedServiceItemId === contextMenu.id ? null : contextMenu.id); setContextMenu(null); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px', background: 'none', border: 'none', color: '#d4a574', fontSize: '12px', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid rgba(255,255,255,0.08)' }}><ChevDown size={12} /> Show Slides</button> : null; })()}
            <button onClick={() => removeServiceItem(contextMenu.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px', background: 'none', border: 'none', color: '#f87171', fontSize: '12px', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid rgba(255,255,255,0.08)' }}><Trash2 size={12} /> Remove</button>
          </div>
        )}
        <div style={{ width: '270px', background: '#1a1a1a', borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', overflowY: 'auto', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px' }}>
            <Database size={14} color="#d4a574" />
            <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px' }}>MEDIA LIBRARY</div>
          </div>
          <div style={tabBarStyle}>
            {['songs', 'bible', 'themes', 'media', 'slides'].map((tab) => (
              <button key={tab} onClick={() => { setMediaTab(tab); setSearchQuery(''); }} style={tabStyle(mediaTab === tab)}>{tab.toUpperCase()}</button>
            ))}
          </div>
          {mediaTab === 'songs' && (
            <div style={{ padding: '0 12px 64px', flex: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>Search online by title or artist. Songs saved locally can also be found by a lyric line.</div>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                <input value={songQuery} onChange={(event) => setSongQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && !songLoading && runSongSearch()} placeholder="Song title or artist" style={{ flex: 1, minWidth: 0, padding: '7px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'white', fontSize: '12px', boxSizing: 'border-box' }} />
                <button onClick={runSongSearch} disabled={songLoading} style={{ padding: '0 10px', background: '#d4a574', border: 'none', borderRadius: '4px', color: '#1a1a1a', fontWeight: '700', cursor: songLoading ? 'wait' : 'pointer', opacity: songLoading ? 0.65 : 1 }}><Search size={13} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '7px' }}>
                <button onClick={() => showPrompt('Paste lyrics or a page URL', '', importLyricsOrUrl)} style={{ padding: '7px', background: '#2b2b2b', border: '1px dashed rgba(255,255,255,0.22)', borderRadius: '4px', color: 'white', fontSize: '10px', cursor: 'pointer' }}>Import lyrics</button>
                <button onClick={openHymnarySearch} title="Search the Hymnary catalog" style={{ padding: '7px', background: 'rgba(212,165,116,0.1)', border: '1px solid rgba(212,165,116,0.45)', borderRadius: '4px', color: '#d4a574', fontSize: '10px', cursor: 'pointer' }}>Search Hymnary</button>
              </div>
              <label style={{ display: 'grid', gridTemplateColumns: '62px 1fr 34px', alignItems: 'center', gap: '6px', marginBottom: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '9px' }}>
                Song size
                <input type="range" min="30" max="80" step="2" value={songFontSize} onChange={(event) => {
                  const size = Number(event.target.value);
                  setSongFontSize(size);
                  setStagedContent((content) => content?.kind === 'song-slide' ? { ...content, fontSize: size } : content);
                  setProgramContent((content) => content?.kind === 'song-slide' ? { ...content, fontSize: size } : content);
                }} style={{ width: '100%', accentColor: '#d4a574' }} />
                <span style={{ textAlign: 'right', color: '#d4a574' }}>{songFontSize}px</span>
              </label>
              {songLoading && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '10px' }}>Searching...</div>}
              {songSourceNote && <div style={{ fontSize: '9px', color: songSourceNote.includes('Real') ? '#4ade80' : 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>{songSourceNote}</div>}
              {songResults.length > 0 && <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', color: 'rgba(255,255,255,0.45)', fontSize: '9px' }}><span>SEARCH RESULTS</span><span>{songResults.length}</span></div>
                <div style={{ maxHeight: '190px', overflowY: 'auto', paddingRight: '3px' }}>
                  {songResults.map((result) => {
                    const loadingResult = songResultLoadingId === result.id;
                    const selectedResult = activeSong?.id === result.id;
                    return <button key={result.id} onClick={() => pickSongResult(result)} disabled={loadingResult} style={{ width: '100%', textAlign: 'left', padding: '8px', marginBottom: '5px', background: selectedResult || loadingResult ? 'rgba(212,165,116,0.2)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (selectedResult || loadingResult ? '#d4a574' : 'rgba(255,255,255,0.1)'), borderRadius: '4px', color: 'white', cursor: loadingResult ? 'wait' : 'pointer', fontSize: '12px', opacity: loadingResult ? 0.75 : 1 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', fontWeight: '500' }}><span>{result.title}</span>{loadingResult && <span style={{ color: '#d4a574', fontSize: '9px' }}>Loading...</span>}</div><div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{result.artist} - {result.source}</div></button>;
                  })}
                </div>
              </div>}
              {activeSongSlides.length > 0 && (
                <div style={{ marginTop: '10px' }} draggable onDragStart={(event) => event.dataTransfer.setData('application/json', JSON.stringify({ dragKind: 'song', song: activeSong, slides: activeSongSlides }))}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>SLIDES (drag ⠿ or use buttons)</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => addSongToService(activeSong, activeSongSlides)} title="Add to Service Order" style={{ background: 'rgba(212,165,116,0.15)', border: '1px solid #d4a574', borderRadius: '3px', color: '#d4a574', padding: '3px 5px', fontSize: '9px', cursor: 'pointer' }}><Plus size={10} /></button>
                      <button onClick={saveSongLocally} title="Save to My Songs" style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid #4ade80', borderRadius: '3px', color: '#4ade80', padding: '3px 6px', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}><Bookmark size={10} /> Save</button>
                    </div>
                  </div>
                  {activeSongSlides.map((slide) => (
                    <button key={slide.id} onClick={() => stageSongSlide(slide)} onDoubleClick={() => liveSongSlide(slide)} style={{ width: '100%', textAlign: 'left', padding: '7px 8px', marginBottom: '4px', background: stagedContent?.kind === 'song-slide' && stagedContent.slide.id === slide.id ? 'rgba(212,165,116,0.2)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (stagedContent?.kind === 'song-slide' && stagedContent.slide.id === slide.id ? '#d4a574' : 'rgba(255,255,255,0.08)'), borderRadius: '4px', color: stagedContent?.kind === 'song-slide' && stagedContent.slide.id === slide.id ? '#d4a574' : 'rgba(255,255,255,0.8)', fontSize: '11px', cursor: 'pointer' }}>{slide.label}</button>
                  ))}
                </div>
              )}
              {savedSongs.length > 0 && (
                <div style={{ marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}><span>MY SONGS (saved on this computer)</span><span style={{ color: songLibraryStatus === 'saved' ? '#4ade80' : songLibraryStatus === 'saving' ? '#facc15' : '#f87171' }}>{songLibraryStatus === 'saved' ? '● saved' : songLibraryStatus === 'saving' ? 'saving...' : 'browser backup'}</span></div>
                  {savedSongs.map((song) => (
                    <div key={song.id} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                      <button onClick={() => { setActiveSong({ id: song.id, title: song.title, artist: song.artist, source: 'saved' }); setActiveSongSlides(song.slides); }} style={{ flex: 1, textAlign: 'left', padding: '6px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white', fontSize: '11px', cursor: 'pointer' }}>{song.title}</button>
                      <button onClick={() => removeSavedSong(song.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={12} color="#f87171" /></button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setSongEditorOpen(true)} title="Add new local song" style={{ position: 'absolute', right: '12px', bottom: '12px', zIndex: 12, width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: '#d4a574', color: '#171717', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.45)' }}><Plus size={18} strokeWidth={3} /></button>
            </div>
          )}
          {mediaTab === 'themes' && (
            <div style={{ padding: '0 12px 12px', flex: 1, overflowY: 'auto' }}>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Ambient backgrounds — click to apply instantly.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                {themeItems.map((theme) => (
                  <div key={theme.id} style={{ position: 'relative' }}>
                    <button onClick={() => applyBackground(theme)} style={{ width: '100%', height: '50px', borderRadius: '5px', border: activeBackground.id === theme.id ? '2px solid #d4a574' : '1px solid rgba(255,255,255,0.15)', background: theme.dataUrl && theme.kind !== 'video' ? `url(${theme.dataUrl}) center/cover` : theme.css || theme.color || '#222', backgroundSize: theme.animated ? '180% 180%' : 'cover', ...animStyleFor(theme.anim), cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                      {theme.kind === 'video' && theme.dataUrl && <LibraryVideoPreview item={theme} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                      <span style={{ position: 'absolute', bottom: '3px', left: '5px', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '9px', color: 'white', background: 'rgba(0,0,0,0.65)', padding: '1px 4px', borderRadius: '2px' }}>{theme.name}</span>
                    </button>
                    {theme.imported && <button onClick={() => removeTheme(theme.id)} title="Remove theme" style={{ position: 'absolute', top: '3px', right: '3px', width: '22px', height: '22px', display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '3px', color: '#f87171', cursor: 'pointer' }}><Trash2 size={11} /></button>}
                    {theme.kind === 'video' && <button onClick={() => setLibraryVideoLoop('theme', theme.id, theme.loop === false)} title={theme.loop === false ? 'Turn video loop on' : 'Turn video loop off'} aria-pressed={theme.loop !== false} style={{ position: 'absolute', top: '3px', left: '3px', width: '22px', height: '22px', display: 'grid', placeItems: 'center', background: theme.loop !== false ? '#d4a574' : 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '3px', color: theme.loop !== false ? '#171717' : 'white', cursor: 'pointer' }}><Repeat size={11} /></button>}
                  </div>
                ))}
              </div>
              <button onClick={() => themeUploadRef.current?.click()} style={{ width: '100%', padding: '8px', marginBottom: '6px', background: 'rgba(74,222,128,0.08)', border: '1px dashed #4ade80', borderRadius: '5px', color: '#4ade80', fontSize: '11px', cursor: 'pointer' }}>Import image or video theme</button>
              {!creatorOpen ? (
                <button onClick={() => setCreatorOpen(true)} style={{ width: '100%', padding: '8px', background: 'rgba(212,165,116,0.1)', border: '1px dashed #d4a574', borderRadius: '5px', color: '#d4a574', fontSize: '11px', cursor: 'pointer' }}>+ Create Motion Background</button>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px' }}>
                  <input value={creatorName} onChange={(event) => setCreatorName(event.target.value)} placeholder="Theme name" style={{ width: '100%', padding: '5px 6px', marginBottom: '6px', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '3px', color: 'white', fontSize: '11px', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <input type="color" value={creatorColor1} onChange={(event) => setCreatorColor1(event.target.value)} style={{ flex: 1, height: '26px', border: 'none', borderRadius: '3px', cursor: 'pointer' }} />
                    <input type="color" value={creatorColor2} onChange={(event) => setCreatorColor2(event.target.value)} style={{ flex: 1, height: '26px', border: 'none', borderRadius: '3px', cursor: 'pointer' }} />
                    <input type="color" value={creatorColor3 || '#000000'} onChange={(event) => setCreatorColor3(event.target.value)} title="Optional 3rd color" style={{ flex: 1, height: '26px', border: creatorColor3 ? 'none' : '1px dashed rgba(255,255,255,0.3)', borderRadius: '3px', cursor: 'pointer', opacity: creatorColor3 ? 1 : 0.4 }} />
                  </div>
                  <label style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>Angle: {creatorAngle}°
                    <input type="range" min="0" max="360" value={creatorAngle} onChange={(event) => setCreatorAngle(Number(event.target.value))} style={{ width: '100%', accentColor: '#d4a574' }} />
                  </label>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    {['none', 'pan', 'pulse'].map((animation) => (
                      <button key={animation} onClick={() => setCreatorAnim(animation)} style={{ flex: 1, padding: '5px', background: creatorAnim === animation ? 'rgba(212,165,116,0.2)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (creatorAnim === animation ? '#d4a574' : 'rgba(255,255,255,0.1)'), borderRadius: '3px', color: creatorAnim === animation ? '#d4a574' : 'rgba(255,255,255,0.7)', fontSize: '10px', cursor: 'pointer', textTransform: 'capitalize' }}>{animation}</button>
                    ))}
                  </div>
                  <div style={{ height: '36px', borderRadius: '4px', marginBottom: '8px', background: `linear-gradient(${creatorAngle}deg, ${creatorColor1}, ${creatorColor3 || creatorColor2}${creatorColor3 ? `, ${creatorColor2}` : ''})`, ...animStyleFor(creatorAnim) }} />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={createTheme} style={{ flex: 1, padding: '6px', background: '#d4a574', border: 'none', borderRadius: '4px', color: '#1a1a1a', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>Create</button>
                    <button onClick={() => setCreatorOpen(false)} style={{ flex: 1, padding: '6px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: 'white', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {mediaTab === 'media' && (
            <div style={{ padding: '0 12px 12px', flex: 1, overflowY: 'auto' }}>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Video/image only — no text. Click = preview, double-click = go live.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                {mediaItems.map((mediaItem) => (
                  <div key={mediaItem.id} style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => stageMediaBg(mediaItem)} onDoubleClick={() => liveMediaBg(mediaItem)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', padding: '7px', background: stagedContent?.kind === 'media-bg' && stagedContent.item.id === mediaItem.id ? 'rgba(212,165,116,0.2)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (stagedContent?.kind === 'media-bg' && stagedContent.item.id === mediaItem.id ? '#d4a574' : 'rgba(255,255,255,0.1)'), borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ width: '30px', height: '24px', borderRadius: '3px', background: mediaItem.dataUrl && mediaItem.kind !== 'video' ? `url(${mediaItem.dataUrl}) center/cover` : mediaItem.css || mediaItem.color || '#222', ...animStyleFor(mediaItem.anim), flexShrink: 0, overflow: 'hidden' }}>{mediaItem.kind === 'video' && mediaItem.dataUrl && <LibraryVideoPreview item={mediaItem} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '11px', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mediaItem.name}</span>
                        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>{mediaItem.category || mediaItem.kind} · {mediaItem.kind}</span>
                      </div>
                    </button>
                    {mediaItem.kind === 'video' && <button onClick={() => setLibraryVideoLoop('media', mediaItem.id, mediaItem.loop === false)} title={mediaItem.loop === false ? 'Turn video loop on' : 'Turn video loop off'} aria-pressed={mediaItem.loop !== false} style={{ width: '30px', flexShrink: 0, background: mediaItem.loop !== false ? 'rgba(212,165,116,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${mediaItem.loop !== false ? '#d4a574' : 'rgba(255,255,255,0.18)'}`, borderRadius: '4px', color: mediaItem.loop !== false ? '#d4a574' : 'rgba(255,255,255,0.55)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Repeat size={13} /></button>}
                    <button onClick={() => removeMedia(mediaItem.id)} title="Remove media" style={{ width: '30px', flexShrink: 0, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '4px', color: '#f87171', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => mediaLibraryUploadRef.current?.click()} style={{ display: 'block', width: '100%', padding: '8px', background: 'rgba(212,165,116,0.1)', border: '1px dashed #d4a574', borderRadius: '5px', color: '#d4a574', fontSize: '11px', cursor: 'pointer', textAlign: 'center', boxSizing: 'border-box' }}>Import image or video</button>
            </div>
          )}
          {mediaTab === 'slides' && (
            <div style={{ padding: '0 12px 12px', flex: 1, overflowY: 'auto' }}>
              <label style={{ display: 'grid', gridTemplateColumns: '62px 1fr 40px', alignItems: 'center', gap: '6px', marginBottom: '10px', color: 'rgba(255,255,255,0.6)', fontSize: '9px' }}>
                Slide size
                <input type="range" min="24" max="150" step="2" value={slideFontSize} onChange={(event) => {
                  const size = Number(event.target.value);
                  setSlideFontSize(size);
                  setStagedContent((content) => content?.kind === 'slide-deck' ? { ...content, fontSize: size } : content);
                  setProgramContent((content) => content?.kind === 'slide-deck' ? { ...content, fontSize: size } : content);
                }} style={{ width: '100%', accentColor: '#d4a574' }} />
                <span style={{ textAlign: 'right', color: '#d4a574' }}>{slideFontSize}px</span>
              </label>
              {slidePresentations.map((presentation) => (
                <div key={presentation.id} style={{ marginBottom: '8px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                  <div onClick={() => setExpandedPresId(expandedPresId === presentation.id ? null : presentation.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: 'rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600' }}>{presentation.name} <span style={{ opacity: 0.4 }}>({presentation.slides.length})</span></span>
                    <Trash2 size={12} color="#f87171" onClick={(event) => { event.stopPropagation(); deletePresentation(presentation.id); }} />
                  </div>
                  {expandedPresId === presentation.id && (
                    <div style={{ padding: '8px' }}>
                      {presentation.slides.map((slide) => (
                        <div key={slide.id} style={{ display: 'flex', gap: '4px', marginBottom: '5px' }}>
                          <button onClick={() => stageSlide(presentation, slide)} onDoubleClick={() => liveSlide(presentation, slide)} style={{ flex: 1, textAlign: 'left', padding: '6px', background: stagedContent?.kind === 'slide-deck' && stagedContent.slide.id === slide.id ? 'rgba(212,165,116,0.2)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px', color: 'white', fontSize: '10px', cursor: 'pointer' }}>{slide.text}</button>
                          <button onClick={() => editSlide(presentation.id, slide)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Edit2 size={11} color="rgba(255,255,255,0.5)" /></button>
                          <button onClick={() => deleteSlide(presentation.id, slide.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={11} color="#f87171" /></button>
                        </div>
                      ))}
                      <button onClick={() => addSlideToPresentation(presentation.id)} style={{ width: '100%', padding: '5px', marginTop: '4px', background: 'rgba(212,165,116,0.1)', border: '1px dashed #d4a574', borderRadius: '3px', color: '#d4a574', fontSize: '10px', cursor: 'pointer' }}>+ Add Slide</button>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addPresentation} style={{ width: '100%', padding: '8px', background: 'rgba(212,165,116,0.1)', border: '1px dashed #d4a574', borderRadius: '5px', color: '#d4a574', fontSize: '11px', cursor: 'pointer' }}>+ New Presentation</button>
            </div>
          )}
          {mediaTab === 'bible' && (
            <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
              <div style={{ position: 'relative', marginBottom: '8px' }}>
                <Search size={13} color="#7a8299" style={{ position: 'absolute', left: '8px', top: '8px' }} />
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="John, John 3, John 3:16, or words" style={{ width: '100%', padding: '7px 7px 7px 26px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'white', fontSize: '11px', boxSizing: 'border-box' }} />
              </div>
              <label style={{ display: 'grid', gridTemplateColumns: '62px 1fr 34px', alignItems: 'center', gap: '6px', marginBottom: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '9px' }}>
                Verse size
                <input type="range" min="24" max="150" step="2" value={bibleFontSize} onChange={(event) => {
                  const size = Number(event.target.value);
                  setBibleFontSize(size);
                  setStagedContent((content) => content?.kind === 'verse' ? { ...content, fontSize: size } : content);
                  setProgramContent((content) => content?.kind === 'verse' ? { ...content, fontSize: size } : content);
                }} style={{ width: '100%', accentColor: '#d4a574' }} />
                <span style={{ textAlign: 'right', color: '#d4a574' }}>{bibleFontSize}px</span>
              </label>
              <div style={{ display: 'flex', marginBottom: '8px', gap: '4px' }}>
                {['testament', 'version', 'aisearch'].map((tab) => (
                  <button key={tab} onClick={() => setBibleSubTab(tab)} style={{ flex: 1, padding: '6px 3px', background: bibleSubTab === tab ? 'rgba(212,165,116,0.2)' : 'rgba(255,255,255,0.04)', border: bibleSubTab === tab ? '1px solid #d4a574' : '1px solid transparent', borderRadius: '4px', color: bibleSubTab === tab ? '#d4a574' : 'rgba(255,255,255,0.6)', fontSize: '9px', fontWeight: '700', letterSpacing: '0.3px', cursor: 'pointer' }}>{tab === 'aisearch' ? 'AI SEARCH' : tab.toUpperCase()}</button>
                ))}
              </div>
              {searchQuery.trim() && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', marginBottom: '2px' }}>{bibleLoading ? `Loading ${selectedVersion.toUpperCase()}...` : `${bibleSearchResults.length} result${bibleSearchResults.length === 1 ? '' : 's'} in ${selectedVersion.toUpperCase()}`}</div>
                  {!bibleLoading && bibleSearchResults.length === 0 && <div style={{ padding: '16px 6px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>No local Bible verses match &quot;{searchQuery}&quot;.</div>}
                  {bibleSearchResults.map((match) => (
                    <button key={match.ref} onClick={() => stageAiVerse(match)} onDoubleClick={() => liveSearchVerse(match)} style={{ padding: '8px', textAlign: 'left', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>
                      <div style={{ color: '#d4a574', fontSize: '10px', fontWeight: '700', marginBottom: '3px' }}>{match.ref}</div>
                      <div style={{ fontSize: '10px', lineHeight: 1.4, color: 'rgba(255,255,255,0.8)' }}>{match.text}</div>
                    </button>
                  ))}
                </div>
              )}
              {!searchQuery.trim() && bibleSubTab === 'testament' && (
                <>
                  {bibleView === 'books' && (
                    <>
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                        <button onClick={() => { setTestament('old'); setSearchQuery(''); }} style={{ flex: 1, padding: '7px 4px', background: testament === 'old' ? 'rgba(212,165,116,0.2)' : 'rgba(255,255,255,0.04)', border: testament === 'old' ? '1px solid #d4a574' : '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: testament === 'old' ? '#d4a574' : 'rgba(255,255,255,0.7)', fontSize: '9px', fontWeight: '700', cursor: 'pointer' }}>OLD TESTAMENT</button>
                        <button onClick={() => { setTestament('new'); setSearchQuery(''); }} style={{ flex: 1, padding: '7px 4px', background: testament === 'new' ? 'rgba(212,165,116,0.2)' : 'rgba(255,255,255,0.04)', border: testament === 'new' ? '1px solid #d4a574' : '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: testament === 'new' ? '#d4a574' : 'rgba(255,255,255,0.7)', fontSize: '9px', fontWeight: '700', cursor: 'pointer' }}>NEW TESTAMENT</button>
                      </div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>{filteredBooks.length} books</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                        {filteredBooks.map((book) => (
                          <button key={book.name} onClick={() => { setSelectedBook(book); setSelectedChapter(null); setSelectedVerses([]); setVerseAnchor(null); setFocusedVerse(null); setBibleView('chapters'); }} style={{ padding: '8px 4px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'rgba(255,255,255,0.8)', fontSize: '10px', cursor: 'pointer' }}>{book.name.toUpperCase()}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {bibleView === 'chapters' && selectedBook && (
                    <>
                      <button onClick={() => setBibleView('books')} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#d4a574', fontSize: '11px', cursor: 'pointer', marginBottom: '8px', padding: 0 }}><ChevronLeft size={13} /> {selectedBook.name}</button>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>{selectedBook.chapters} chapters</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                        {Array.from({ length: selectedBook.chapters }, (_, index) => index + 1).map((chapter) => (
                          <button key={chapter} onClick={() => { setSelectedChapter(chapter); setSelectedVerses([]); setVerseAnchor(null); setFocusedVerse(null); setBibleView('verses'); }} style={{ padding: '7px 0', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'rgba(255,255,255,0.8)', fontSize: '11px', cursor: 'pointer' }}>{chapter}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {bibleView === 'verses' && selectedBook && selectedChapter && (
                    <>
                      <button onClick={() => setBibleView('chapters')} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#d4a574', fontSize: '11px', cursor: 'pointer', marginBottom: '8px', padding: 0 }}><ChevronLeft size={13} /> {selectedBook.name} {selectedChapter}</button>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginBottom: '6px' }}>Click a verse to select it · Shift+Click or Shift+↓/↑ to extend the range · dbl-click = go live</div>
                      {selectedVerses.length > 1 && (
                        <button onClick={addSelectedVersesToService} style={{ width: '100%', padding: '6px', marginBottom: '6px', background: 'rgba(212,165,116,0.2)', border: '1px solid #d4a574', borderRadius: '4px', color: '#d4a574', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>+ Add {selectedVerses.length} Selected as Slides</button>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {filteredVerseNumbers().length === 0 && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', padding: '10px 0', textAlign: 'center' }}>No verses match &quot;{searchQuery}&quot;</div>}
                        {filteredVerseNumbers().map((verse) => {
                          const isStaged = stagedContent?.kind === 'verse' && stagedContent.book === selectedBook.name && stagedContent.chapter === selectedChapter && stagedContent.verse === verse;
                          const isSelected = selectedVerses.includes(verse);
                          return (
                            <div key={verse} draggable onDragStart={(event) => event.dataTransfer.setData('application/json', JSON.stringify({ dragKind: 'verse', book: selectedBook.name, chapter: selectedChapter, verse }))} style={{ display: 'flex', gap: '3px', alignItems: 'stretch' }}>
                              <button onClick={(event) => handleVerseClick(verse, event.shiftKey)} onDoubleClick={() => liveVerse(verse)} style={{ flex: 1, display: 'flex', gap: '6px', padding: '6px 7px', textAlign: 'left', background: isStaged ? 'rgba(212,165,116,0.25)' : isSelected ? 'rgba(212,165,116,0.12)' : 'rgba(255,255,255,0.04)', border: isStaged ? '1px solid #d4a574' : isSelected ? '1px solid rgba(212,165,116,0.4)' : '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', color: isStaged ? '#d4a574' : 'rgba(255,255,255,0.8)', fontSize: '10px', cursor: 'pointer' }}>
                                <span style={{ fontWeight: '700', flexShrink: 0 }}>{verse}</span>
                                <span style={{ opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bibleTextFor(selectedBook.name, selectedChapter, verse)}</span>
                              </button>
                              <button onClick={() => addVerseToService(selectedBook.name, selectedChapter, verse)} title="Add to Service Order" style={{ background: 'rgba(212,165,116,0.1)', border: '1px solid rgba(212,165,116,0.4)', borderRadius: '4px', color: '#d4a574', padding: '0 6px', cursor: 'pointer', fontSize: '10px' }}>+</button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
              {!searchQuery.trim() && bibleSubTab === 'version' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '5px', marginBottom: '8px' }}>
                    {bibleVersions.map((version) => (
                      <button key={version.id} onClick={() => setSelectedVersion(version.id)} style={{ padding: '8px 2px', background: selectedVersion === version.id ? 'rgba(212,165,116,0.2)' : 'rgba(255,255,255,0.04)', border: selectedVersion === version.id ? '1px solid #d4a574' : '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: selectedVersion === version.id ? '#d4a574' : 'rgba(255,255,255,0.8)', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>{version.label}</button>
                    ))}
                  </div>
                  {bibleLoading && !selectedBibleData && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>Loading {selectedVersion.toUpperCase()} Bible…</div>}
                  {bibleLoadError && selectedVersion && <div style={{ fontSize: '10px', color: '#f87171', marginBottom: '8px' }}>⚠ {bibleLoadError}</div>}
                  {selectedBibleData && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>{selectedVersion.toUpperCase()} loaded with {selectedBibleData.books.length} books.</div>}
                </>
              )}
              {!searchQuery.trim() && bibleSubTab === 'aisearch' && (
                <>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                    <input value={aiQuery} onChange={(event) => setAiQuery(event.target.value)} placeholder="Speak or type a verse / topic" style={{ flex: 1, padding: '7px', background: 'rgba(255,255,255,0.05)', border: '1px solid #d4a574', borderRadius: '4px', color: 'white', fontSize: '11px', boxSizing: 'border-box' }} />
                    {voiceSupported && <button onClick={startListening} title="Speak your search" style={{ padding: '0 10px', background: listening ? '#dc2626' : 'rgba(212,165,116,0.2)', border: '1px solid ' + (listening ? '#dc2626' : '#d4a574'), borderRadius: '4px', color: listening ? 'white' : '#d4a574', cursor: 'pointer' }}><Mic2 size={13} /></button>}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.65)', minWidth: '68px' }}>Translate to</span>
                    <select value={selectedLanguage} onChange={(event) => setSelectedLanguage(event.target.value)} style={{ flex: 1, padding: '7px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: 'white', fontSize: '11px' }}>
                      {SUPPORTED_BIBLE_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
                    </select>
                  </div>
                  {listening && <div style={{ fontSize: '10px', color: '#f87171', marginBottom: '8px' }}>🎙 Listening — matches verses live as you speak...</div>}
                  {!voiceSupported && <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginBottom: '8px' }}>Voice search unsupported in this browser — type instead.</div>}
                  {voiceError && <div style={{ fontSize: '9px', color: '#f87171', marginBottom: '8px', lineHeight: '1.4' }}>⚠ {voiceError}</div>}
                  {liveGuess && (() => {
                    const { book, chapter, verse } = parseRef(liveGuess.ref);
                    const translated = selectedLanguage === 'en' ? liveGuess.text : bibleTextFor(book, chapter, verse);
                    return (
                      <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid #4ade80', borderRadius: '5px', padding: '7px', marginBottom: '8px' }}>
                        <div style={{ fontSize: '9px', color: '#4ade80', fontWeight: '700', marginBottom: '3px' }}>MATCHED & STAGED ✓</div>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#d4a574' }}>{liveGuess.ref}</div>
                        <div style={{ fontSize: '10px', opacity: 0.85 }}>{translated}</div>
                      </div>
                    );
                  })()}
                  {audioResults.length > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 9px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.6)' }}>AUDIO MIXER</span>
                        <SlidersHorizontal size={12} color="rgba(255,255,255,0.4)" />
                      </div>
                      <div style={{ padding: '9px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {audioResults.map((channel) => (
                          <div key={channel.id}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>{iconFor(channel.icon)}<span style={{ fontSize: '11px', fontWeight: '600' }}>{channel.name}</span></div>
                              <button onClick={() => toggleMute(channel.id)} style={{ background: channel.muted ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '4px', padding: '3px', cursor: 'pointer', display: 'flex' }}>{channel.muted ? <VolumeX size={12} color="#e05a5a" /> : <Volume2 size={12} color="rgba(255,255,255,0.6)" />}</button>
                            </div>
                            <input type="range" min="0" max="100" value={channel.muted ? 0 : channel.level} onChange={(event) => setLevel(channel.id, Number(event.target.value))} disabled={channel.muted} style={{ width: '100%', accentColor: channel.muted ? '#7a4a4a' : '#d4a574' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!isAudioQuery && aiQuery && !liveGuess && (
                    keywordMatches.length > 0 ? (
                      <div>
                        {keywordMatches.map((match) => (
                          <button key={match.ref} onClick={() => stageAiVerse(match)} style={{ width: '100%', textAlign: 'left', padding: '8px', marginBottom: '5px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '11px' }}>
                            <div style={{ fontWeight: '700', color: '#d4a574', marginBottom: '3px' }}>{match.ref}</div>
                            <div style={{ opacity: 0.85, fontSize: '10px' }}>{match.text}</div>
                          </button>
                        ))}
                      </div>
                    ) : <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', padding: '12px 4px', textAlign: 'center' }}>No matches yet — keep speaking or try a different phrase.</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px', gap: '8px', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', gap: '10px', minHeight: 0 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Preview — click to go live</span>
              <div onClick={goLive} style={{ flex: 1, background: getBoxBackground(stagedContent), ...(stagedContent?.kind !== 'obs-scene' ? contentAnimationStyle(stagedContent) : {}), borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', cursor: 'pointer', minHeight: 0 }}>
                {getVideoBackground(stagedContent)}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>{renderContent(stagedContent)}</div>
                {deck && (
                  <div onClick={(event) => event.stopPropagation()} style={{ display: 'flex', gap: '4px', overflowX: 'auto', padding: '5px 8px', background: 'rgba(0,0,0,0.4)' }}>
                    {deck.slides.map((slide) => (
                      <button key={slide.id} onClick={() => pickDeckSlide(slide)} onDoubleClick={() => pickDeckSlide(slide, true)} style={{ flexShrink: 0, padding: '4px 8px', background: deck.activeId === slide.id ? '#d4a574' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '3px', color: deck.activeId === slide.id ? '#1a1a1a' : 'white', fontSize: '10px', cursor: 'pointer' }}>{slide.label || slide.text.slice(0, 14)}</button>
                    ))}
                  </div>
                )}
                <div style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '9px', color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.4)', padding: '3px 6px', borderRadius: '3px' }}>PREVIEW</div>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Program / On Air</span>
                <span style={{ fontSize: '9px', fontWeight: '700', color: programContent && !isBlack ? '#4ade80' : '#7a8299' }}>{programContent && !isBlack ? '● LIVE' : '○ OFF'}</span>
              </div>
              <div style={{ flex: 1, background: isBlack ? '#000' : (programContent ? getBoxBackground(programContent) : '#111'), ...((!isBlack && programContent && programContent.kind !== 'obs-scene') ? contentAnimationStyle(programContent) : {}), borderRadius: '8px', border: '2px solid ' + (programContent && !isBlack ? '#4ade80' : 'rgba(255,255,255,0.1)'), display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', minHeight: 0 }}>
                {!isBlack && getVideoBackground(programContent)}
                {!isBlack && <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>{renderOutputContent(programContent, { hideText: textCleared })}</div>}
                <div style={{ position: 'absolute', bottom: '8px', right: '8px', fontSize: '9px', color: 'rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.4)', padding: '3px 6px', borderRadius: '3px' }}>{activeOutputs.length} dest.</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setMultiviewOpen((current) => !current)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: multiviewOpen ? 'rgba(212,165,116,0.15)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (multiviewOpen ? '#d4a574' : 'rgba(255,255,255,0.12)'), borderRadius: '5px', color: multiviewOpen ? '#d4a574' : 'rgba(255,255,255,0.7)', fontSize: '10px', cursor: 'pointer' }}>
              <LayoutGrid size={11} /> Stage Monitor
            </button>
          </div>
          {multiviewOpen && (
            <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '10px', maxHeight: '140px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', marginBottom: '3px' }}>PREVIEW</div>
                  <div style={{ height: '50px', borderRadius: '4px', background: getBoxBackground(stagedContent), border: '1px solid rgba(255,255,255,0.15)', overflow: 'hidden', position: 'relative' }}><div style={{ transform: 'scale(0.3)', width: '330%', height: '330%' }}>{renderContent(stagedContent)}</div></div>
                </div>
                <div>
                  <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', marginBottom: '3px' }}>PROGRAM</div>
                  <div style={{ height: '50px', borderRadius: '4px', background: isBlack ? '#000' : getBoxBackground(programContent), border: '1px solid ' + (programContent && !isBlack ? '#4ade80' : 'rgba(255,255,255,0.15)'), overflow: 'hidden', position: 'relative' }}>{!isBlack && <div style={{ transform: 'scale(0.3)', width: '330%', height: '330%' }}>{renderContent(programContent, { hideText: textCleared })}</div>}</div>
                </div>
                {obsScenes.map((scene) => (
                  <div key={scene.id} onClick={() => setStagedContent({ kind: 'obs-scene', scene: JSON.parse(JSON.stringify(scene)) })} onDoubleClick={() => transitionToScene(scene)} title="Click to preview; double-click to send to Program" style={{ cursor: 'pointer' }}>
                    <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', marginBottom: '3px' }}>{scene.name.toUpperCase()}</div>
                    <div style={{ height: '50px', borderRadius: '4px', background: '#000', border: '1px solid rgba(255,255,255,0.15)', overflow: 'hidden', position: 'relative' }}>{scene.sources.map((sceneSource) => renderObsSource(sceneSource, false, cameraStreams, screenStreams))}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
