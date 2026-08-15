function createIcon(path, viewBox = '0 0 24 24') {
  return function Icon(props) {
    const { size = 16, color = 'currentColor', strokeWidth = 2, ...rest } = props;
    return (
      <svg viewBox={viewBox} width={size} height={size} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
        {path}
      </svg>
    );
  };
}

export const Database = createIcon(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 8h18" /><path d="M3 12h18" /><path d="M3 16h18" /></>);
export const Search = createIcon(<><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></>);
export const Monitor = createIcon(<><rect x="4" y="5" width="16" height="12" rx="2" /><path d="M12 17v3" /><path d="M8 20h8" /></>);
export const Mic = createIcon(<><path d="M12 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><path d="M19 10a7 7 0 0 1-14 0" /><path d="M12 17v3" /></>);
export const FileText = createIcon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></>);
export const Volume2 = createIcon(<><path d="M11 5 6 9H2v6h4l5 4Z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>);
export const VolumeX = createIcon(<><path d="M11 5 6 9H2v6h4l5 4Z" /><path d="m17 9 4 4" /><path d="m21 9-4 4" /></>);
export const SlidersHorizontal = createIcon(<><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /><circle cx="8" cy="7" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="8" cy="17" r="2" /></>);
export const ChevronLeft = createIcon(<><path d="m15 18-6-6 6-6" /></>);
export const Plus = createIcon(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>);
export const Edit2 = createIcon(<><path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 3 22l1.5-4.5Z" /></>);
export const Trash2 = createIcon(<><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></>);
export const Tv = createIcon(<><rect x="2" y="4" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 18v3" /></>);
export const Radio = createIcon(<><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="8" /><path d="M2 12h2" /><path d="M20 12h2" /></>);
export const FolderOpen = createIcon(<><path d="M6 7h-2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-8l-2-2H6Z" /></>);
export const Save = createIcon(<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" /></>);
export const FilePlus = createIcon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 13v6" /><path d="M15 16h-6" /></>);
export const Eye = createIcon(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>);
export const EyeOff = createIcon(<><path d="M3 3l18 18" /><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4" /><path d="M9.88 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a16.9 16.9 0 0 1-4.2 5.2" /><path d="M6.1 6.1A16.9 16.9 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 3.4-.6" /></>);
export const ArrowUp = createIcon(<><path d="m5 12 7-7 7 7" /><path d="M12 5v14" /></>);
export const ArrowDown = createIcon(<><path d="m19 12-7 7-7-7" /><path d="M12 19V5" /></>);
export const Video = createIcon(<><rect x="2" y="7" width="15" height="10" rx="2" /><path d="m17 10 5-3v8l-5-3" /></>);
export const ImageIcon = createIcon(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10.5" r="1.5" /><path d="m21 15-5-5-8 8" /></>);
export const Type = createIcon(<><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></>);
export const Palette = createIcon(<><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 7.5 14.5" /><path d="M8 13c.5-2 1.5-3 4-3" /></>);
export const Mic2 = createIcon(<><path d="M12 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><path d="M19 10a7 7 0 0 1-14 0" /><path d="M12 17v3" /><path d="M8 21h8" /></>);
export const ArrowLeft = createIcon(<><path d="m12 19-7-7 7-7" /><path d="M5 12h14" /></>);
export const LayoutGrid = createIcon(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>);
export const X = createIcon(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
export const ChevronRight = createIcon(<><path d="m9 18 6-6-6-6" /></>);
export const ChevronDown = createIcon(<><path d="m6 9 6 6 6-6" /></>);
export const Bookmark = createIcon(<><path d="M6 3h12a1 1 0 0 1 1 1v16l-7-3-7 3V4a1 1 0 0 1 1-1Z" /></>);
export const Circle = createIcon(<><circle cx="12" cy="12" r="8" /></>, '0 0 24 24');
export const Power = createIcon(<><path d="M12 2v10" /><path d="M5.6 6.6a8 8 0 1 0 12.8 0" /></>);
export const Camera = createIcon(<><path d="M4 8h3l1.5-2h7L16 8h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13" r="3" /></>);
export const Settings = createIcon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1 0 2.8 2 2 0 0 1-2.8 0l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8 0 2 2 0 0 1 0-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 0-2.8 2 2 0 0 1 2.8 0l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 0 2 2 0 0 1 0 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);
export const GripVertical = createIcon(<><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /></>);
export const CheckSquare = createIcon(<><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>);
export const Square = createIcon(<><rect x="3" y="3" width="18" height="18" rx="2" /></>);
export const AlignLeft = createIcon(<><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="18" y2="18" /></>);
export const AlignCenter = createIcon(<><line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="6" y1="18" x2="18" y2="18" /></>);
export const AlignRight = createIcon(<><line x1="4" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="6" y1="18" x2="20" y2="18" /></>);
export const Bold = createIcon(<><path d="M6 4h8a4 4 0 0 1 0 8H6Z" /><path d="M6 12h9a4 4 0 0 1 0 8H6Z" /></>);
export const Maximize2 = createIcon(<><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>);
export const Minimize2 = createIcon(<><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="10" y1="14" x2="3" y2="21" /></>);
export default { Database, Search, Monitor, Mic, FileText, Volume2, VolumeX, SlidersHorizontal, ChevronLeft, Plus, Edit2, Trash2, Tv, Radio, FolderOpen, Save, FilePlus, Eye, EyeOff, ArrowUp, ArrowDown, Video, ImageIcon, Type, Palette, Mic2, ArrowLeft, LayoutGrid, X, ChevronRight, ChevronDown, Bookmark, Circle, Power, Camera, Settings, GripVertical, CheckSquare, Square, AlignLeft, AlignCenter, AlignRight, Bold, Maximize2, Minimize2 };
