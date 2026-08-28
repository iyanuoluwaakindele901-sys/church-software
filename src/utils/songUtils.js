import { KNOWN_SONG_ARTISTS, LOCAL_SONG_LIBRARY } from '../data/bibleData';

const LRCLIB_API = 'https://lrclib.net/api';
const LRCLIB_HEADERS = { 'Lrclib-Client': 'Sola Worship/0.0.0 (local worship presentation app)' };

const fetchWithTimeout = async (url, options = {}, timeoutMs = 7000) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
};

const fetchProvider = async (proxyPath, directUrl, options = {}) => {
  try {
    const response = await fetchWithTimeout(proxyPath, options);
    const contentType = response.headers.get('content-type') || '';
    // A JSON response came from the provider, even when it is a 404 or 429.
    // HTML/text responses usually mean that this host does not expose the proxy.
    if (contentType.includes('json') || response.status === 429) return response;
  } catch {
    // A production host may not expose the local proxy, so try the provider directly.
  }
  return fetchWithTimeout(directUrl, options);
};

const lyricsFromLrc = (syncedLyrics = '') => syncedLyrics
  .replace(/^\[[^\]]+\]\s*/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const normalizeOnlineSong = (item) => ({
  id: `lrclib-${item.id}`,
  title: item.trackName || item.name || 'Untitled',
  artist: item.artistName || 'Unknown artist',
  album: item.albumName || '',
  duration: item.duration || 0,
  source: 'LRCLIB',
  lyrics: (item.plainLyrics || lyricsFromLrc(item.syncedLyrics)).trim(),
});

const songKey = (song) => `${song.title || ''}|${song.artist || ''}`
  .toLowerCase()
  .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
  .replace(/[^a-z0-9|]+/g, ' ')
  .trim();

const normalizeMetadata = (value = '') => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const metadataMatches = (candidate, requested) => {
  const candidateValue = normalizeMetadata(candidate);
  const requestedValue = normalizeMetadata(requested);
  return Boolean(candidateValue && requestedValue)
    && (candidateValue === requestedValue
      || candidateValue.startsWith(`${requestedValue} `)
      || requestedValue.startsWith(`${candidateValue} `));
};

async function searchLrcLib(query, limit = 12) {
  try {
    const queryString = `q=${encodeURIComponent(query.trim())}`;
    const response = await fetchProvider(`/__sola/lyrics/lrclib/api/search?${queryString}`, `${LRCLIB_API}/search?${queryString}`, { headers: LRCLIB_HEADERS });
    if (!response.ok) return { songs: [], status: response.status === 429 ? 'rate-limited' : 'unavailable', retryAfter: response.headers.get('retry-after') };
    const payload = await response.json();
    const songs = (Array.isArray(payload) ? payload : [])
      .map(normalizeOnlineSong)
      .filter((song) => song.lyrics)
      .slice(0, limit);
    return { songs, status: 'ok', retryAfter: null };
  } catch {
    return { songs: [], status: 'unavailable', retryAfter: null };
  }
}

async function findLrcLibLyrics(artist, title) {
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    const response = await fetchProvider(`/__sola/lyrics/lrclib/api/search?${params}`, `${LRCLIB_API}/search?${params}`, { headers: LRCLIB_HEADERS });
    if (!response.ok) return null;
    const payload = await response.json();
    const matches = (Array.isArray(payload) ? payload : []).map(normalizeOnlineSong).filter((song) => song.lyrics);
    return matches.find((song) => metadataMatches(song.title, title) && metadataMatches(song.artist, artist)) || null;
  } catch {
    return null;
  }
}

export async function fetchRealLyricsAT(artist, title) {
  const lrcLibMatch = await findLrcLibLyrics(artist, title);
  if (lrcLibMatch) return lrcLibMatch;
  try {
    const lyricsPath = `/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetchProvider(`/__sola/lyrics/ovh${lyricsPath}`, `https://api.lyrics.ovh${lyricsPath}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.lyrics) return null;
    return { artist, title, source: 'lyrics.ovh', lyrics: data.lyrics };
  } catch {
    return null;
  }
}

export async function searchOnlineSongsDetailed(query, limit = 8) {
  const lrcLib = await searchLrcLib(query, Math.max(limit, 12));
  if (lrcLib.songs.length) return { songs: lrcLib.songs.slice(0, limit), issue: null };
  try {
    const suggestPath = `/suggest/${encodeURIComponent(query.trim())}`;
    const response = await fetchProvider(`/__sola/lyrics/ovh${suggestPath}`, `https://api.lyrics.ovh${suggestPath}`);
    if (!response.ok) {
      const issue = lrcLib.status === 'rate-limited' || response.status === 429
        ? `Online lyrics search is temporarily busy${lrcLib.retryAfter ? ` (retry after ${lrcLib.retryAfter})` : ''}. Please try again shortly.`
        : 'The online lyrics services could not be reached. Check the internet connection and try again.';
      return { songs: [], issue };
    }
    const payload = await response.json();
    const lyricsOvhSongs = (payload.data || []).slice(0, limit).map((item) => ({
      id: `online-${item.id}`,
      title: item.title,
      artist: item.artist?.name || 'Unknown artist',
      source: 'lyrics.ovh',
    }));
    const seen = new Set();
    const songs = lyricsOvhSongs.filter((song) => {
      const key = songKey(song);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { songs, issue: null };
  } catch {
    const issue = lrcLib.status === 'ok'
      ? null
      : 'The online lyrics services could not be reached. Check the internet connection and try again.';
    return { songs: [], issue };
  }
}

export async function searchOnlineSongs(query, limit = 8) {
  const result = await searchOnlineSongsDetailed(query, limit);
  return result.songs;
}

export function guessArtist(query) {
  const q = query.toLowerCase().trim();
  for (const key of Object.keys(KNOWN_SONG_ARTISTS)) {
    if (q.includes(key)) return KNOWN_SONG_ARTISTS[key];
  }
  return null;
}

export function slidesFromLyrics(lyricsText) {
  const sections = lyricsText.replace(/\r/g, '').split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const blocks = sections.flatMap((section) => {
    const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 4) return [lines.join('\n')];
    const chunks = [];
    for (let index = 0; index < lines.length; index += 4) chunks.push(lines.slice(index, index + 4).join('\n'));
    return chunks;
  });
  return blocks.map((block, index) => ({ id: 'lyr' + index, label: `Part ${index + 1}`, text: block }));
}

export function simulateGoogleSongSearch(query) {
  const base = query.trim() || 'Untitled';
  const title = base.replace(/\b\w/g, (char) => char.toUpperCase());
  return [
    { id: 'r1', title, artist: 'Various Artists', source: 'genius.com (simulated)' },
    { id: 'r2', title: `${title} (Live)`, artist: 'Worship Together', source: 'worshiptogether.com (simulated)' },
    { id: 'r3', title: `${title} - Acoustic`, artist: 'Community Music', source: 'hymnary.org (simulated)' },
  ];
}

export function openExternalSongSearch(query) {
  if (!query) return;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query + ' lyrics')}`;
  try { window.open(url, '_blank'); } catch { /* noop */ }
}

export function generateSlidesForSong(result) {
  return [
    { id: 's1', label: 'Verse 1', text: `${result.title}\nVerse one lyrics would appear here.` },
    { id: 's2', label: 'Chorus', text: `${result.title}\nChorus lyrics would appear here.` },
    { id: 's3', label: 'Verse 2', text: `${result.title}\nVerse two lyrics would appear here.` },
    { id: 's4', label: 'Bridge', text: `${result.title}\nBridge lyrics would appear here.` },
  ];
}

export function searchLocalSongs(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return LOCAL_SONG_LIBRARY.filter((song) => song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q) || song.lyrics.toLowerCase().includes(q));
}

export function songSlidesFromLyrics(song) {
  const lines = song.lyrics.split(/\n/).filter(Boolean);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 4) {
    blocks.push({ id: `${song.id}-b${index}`, label: `Part ${Math.floor(index / 4) + 1}`, text: lines.slice(index, index + 4).join('\n') });
  }
  return blocks;
}
