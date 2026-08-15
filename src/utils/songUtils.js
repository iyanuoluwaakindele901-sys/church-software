import { KNOWN_SONG_ARTISTS, LOCAL_SONG_LIBRARY } from '../data/bibleData';

export async function fetchRealLyricsAT(artist, title) {
  try {
    const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.lyrics) return null;
    return { artist, title, lyrics: data.lyrics };
  } catch {
    return null;
  }
}

export async function searchOnlineSongs(query, limit = 8) {
  try {
    const response = await fetch(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query.trim())}`);
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.data || []).slice(0, limit).map((item) => ({
      id: `online-${item.id}`,
      title: item.title,
      artist: item.artist?.name || 'Unknown artist',
      source: 'lyrics.ovh',
    }));
  } catch {
    return [];
  }
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
