import { BIBLE_BOOKS, BIBLE_VERSION_FILES, KNOWN_VERSES, SUPPORTED_BIBLE_LANGUAGES, TRANSLATED_VERSES } from '../data/bibleData.js';

const LOADED_BIBLE_VERSIONS = {};
const BIBLE_LOAD_PROMISES = {};
const CANONICAL_BOOKS = [...BIBLE_BOOKS.old, ...BIBLE_BOOKS.new];

export function decodeAscii(bytes) {
  return new TextDecoder('ascii').decode(bytes).replace(/\0+.*$/, '');
}

export function readInt64LE(view, offset) {
  if (typeof view.getBigInt64 === 'function') {
    return Number(view.getBigInt64(offset, true));
  }
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  return high * 0x100000000 + low;
}

export async function decompressDeflate(bytes) {
  if (typeof DecompressionStream === 'function') {
    const ds = new DecompressionStream('deflate');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }
  throw new Error('Browser does not support DecompressionStream for EWB Bible decompression.');
}

export function buildVerseMap(bookName, text) {
  const verses = {};
  const lines = text.split(/\r?\n\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^(\d+):(\d+)\s+(.*)$/);
    if (!match) continue;
    const [, chapter, verse, content] = match;
    verses[`${bookName} ${chapter}:${verse}`] = content.trim();
  }
  return verses;
}

export async function parseEwbBible(version, bytes) {
  const header = decodeAscii(bytes.subarray(0, 22));
  if (header !== 'EasyWorship Bible Text') throw new Error('Unsupported EWB format');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bookCount = 66;
  const bookRecordsOffset = 0x58;
  const books = [];
  for (let i = 0; i < bookCount; i++) {
    const base = bookRecordsOffset + i * 224;
    const embeddedName = decodeAscii(bytes.subarray(base, base + 51)).trim();
    const name = CANONICAL_BOOKS[i]?.name || embeddedName;
    const chapterCount = bytes[base + 51];
    const versesPerChapter = Array.from(bytes.subarray(base + 52, base + 52 + chapterCount));
    const bookOffset = readInt64LE(view, base + 0xd0);
    const bookLength = readInt64LE(view, base + 0xd8);
    if (!name || !chapterCount || bookOffset < 0 || bookLength <= 0 || bookOffset + bookLength > bytes.byteLength) {
      throw new Error(`Invalid ${version.toUpperCase()} EWB book record ${i + 1}.`);
    }
    books.push({ name, chapterCount, versesPerChapter, bookOffset, bookLength });
  }

  const verses = {};
  for (const book of books) {
    if (!book.bookOffset || !book.bookLength) continue;
    const trailerOffset = book.bookOffset + book.bookLength - 10;
    const hasEasyWorshipTrailer = bytes[trailerOffset] === 0x51
      && bytes[trailerOffset + 1] === 0x4b
      && bytes[trailerOffset + 2] === 0x03
      && bytes[trailerOffset + 3] === 0x04;
    const compressedEnd = hasEasyWorshipTrailer ? trailerOffset : book.bookOffset + book.bookLength;
    const compressed = bytes.subarray(book.bookOffset, compressedEnd);
    const decompressed = await decompressDeflate(compressed);
    const text = new TextDecoder('utf-8').decode(decompressed);
    Object.assign(verses, buildVerseMap(book.name, text));
  }
  if (books.length !== 66 || Object.keys(verses).length < 30000) {
    throw new Error(`${version.toUpperCase()} local Bible data is incomplete.`);
  }
  return { loaded: true, verses, books };
}

export async function fetchBibleVersion(version) {
  if (LOADED_BIBLE_VERSIONS[version]) return LOADED_BIBLE_VERSIONS[version];
  if (BIBLE_LOAD_PROMISES[version]) return BIBLE_LOAD_PROMISES[version];
  const info = BIBLE_VERSION_FILES[version];
  if (!info) throw new Error(`Bible version ${version} is not configured.`);
  BIBLE_LOAD_PROMISES[version] = (async () => {
    const response = await fetch(`/bibles/${info.file}`);
    if (!response.ok) throw new Error(`Failed to load local Bible file ${info.file} (${response.status}).`);
    const buffer = await response.arrayBuffer();
    const loaded = await parseEwbBible(version, new Uint8Array(buffer));
    setLoadedBibleVersion(version, loaded);
    return loaded;
  })();
  try {
    return await BIBLE_LOAD_PROMISES[version];
  } finally {
    delete BIBLE_LOAD_PROMISES[version];
  }
}

export function parseRef(ref) {
  const lastSpace = ref.lastIndexOf(' ');
  const book = ref.substring(0, lastSpace);
  const chVerse = ref.substring(lastSpace + 1);
  const [chapter, verse] = chVerse.split(':').map(Number);
  return { book, chapter, verse };
}

export function verseCountFor(bookName, chapter, version = 'kjv') {
  const loaded = LOADED_BIBLE_VERSIONS[version];
  if (loaded && loaded.books) {
    const book = loaded.books.find((candidate) => candidate.name === bookName);
    if (book && chapter >= 1 && chapter <= book.chapterCount) return book.versesPerChapter[chapter - 1] || 0;
  }
  let h = 0;
  for (let i = 0; i < bookName.length; i++) h += bookName.charCodeAt(i);
  return ((h * 3 + chapter * 7) % 26) + 8;
}

export function getVerseText(bookName, chapter, verse, version = 'kjv') {
  const ref = `${bookName} ${chapter}:${verse}`;
  const versionData = LOADED_BIBLE_VERSIONS[version];
  const loaded = versionData?.verses?.[ref];
  if (loaded) return loaded;
  if (versionData === undefined) return `[Loading ${version.toUpperCase()} Bible passage ${ref}...]`;
  return `[${ref} is not included in the local ${version.toUpperCase()} Bible file.]`;
}

export async function getVerseTextAsync(bookName, chapter, verse, version = 'kjv') {
  if (!LOADED_BIBLE_VERSIONS[version]) await fetchBibleVersion(version);
  return getVerseText(bookName, chapter, verse, version);
}

export function translateVerse(bookName, chapter, verse, version, language) {
  const ref = `${bookName} ${chapter}:${verse}`;
  const base = getVerseText(bookName, chapter, verse, version);
  if (language === 'en') return base;
  const translated = TRANSLATED_VERSES[language]?.[ref];
  if (translated) return translated;
  return `${base} [translation unavailable for ${SUPPORTED_BIBLE_LANGUAGES.find((item) => item.code === language)?.name || language}]`;
}

const VERSE_TOPIC_INDEX = Object.entries(KNOWN_VERSES).map(([ref, text]) => ({ ref, text }));

export function findLiveVerseMatch(query) {
  const q = query.toLowerCase().trim();
  if (q.length < 5) return null;
  let best = null;
  let bestScore = 0;
  for (const verse of VERSE_TOPIC_INDEX) {
    const text = verse.text.toLowerCase();
    let score = 0;
    if (text.startsWith(q)) score = q.length + 10;
    else if (text.includes(q)) score = q.length * 0.6;
    if (score > bestScore) {
      bestScore = score;
      best = verse;
    }
  }
  return bestScore > 8 ? best : null;
}

export function searchVerseTopicsByKeyword(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const loadedMatches = Object.entries(LOADED_BIBLE_VERSIONS).flatMap(([version, data]) => (
    Object.entries(data?.verses || {})
      .filter(([, text]) => text.toLowerCase().includes(q))
      .map(([ref, text]) => ({ ref, text, version }))
  ));
  const knownMatches = VERSE_TOPIC_INDEX.filter((verse) => verse.text.toLowerCase().includes(q));
  return [...loadedMatches, ...knownMatches].slice(0, 50);
}

export function searchBibleVersion(query, version = 'kjv', limit = 100) {
  const data = LOADED_BIBLE_VERSIONS[version];
  const normalized = query.trim().toLowerCase();
  if (!normalized || !data?.verses) return [];

  const bookOnly = data.books.find((entry) => {
    const name = entry.name.toLowerCase();
    return name === normalized || name.startsWith(normalized);
  });
  if (bookOnly) {
    return Object.entries(data.verses)
      .filter(([ref]) => ref.startsWith(`${bookOnly.name} `))
      .map(([ref, text]) => ({ ref, text, version }))
      .slice(0, limit);
  }

  const referenceMatch = normalized.match(/^(.+?)\s+(\d+)(?::|\s+)?(\d+)?$/);
  if (referenceMatch) {
    const [, requestedBook, requestedChapter, requestedVerse] = referenceMatch;
    const book = data.books.find((entry) => (
      entry.name.toLowerCase() === requestedBook
      || entry.name.toLowerCase().startsWith(requestedBook)
    ));
    if (book) {
      const prefix = `${book.name} ${Number(requestedChapter)}:`;
      return Object.entries(data.verses)
        .filter(([ref]) => requestedVerse ? ref === `${prefix}${Number(requestedVerse)}` : ref.startsWith(prefix))
        .map(([ref, text]) => ({ ref, text, version }))
        .slice(0, limit);
    }
  }

  const terms = normalized.split(/\s+/).filter(Boolean);
  return Object.entries(data.verses)
    .filter(([ref, text]) => {
      const haystack = `${ref} ${text}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .map(([ref, text]) => ({ ref, text, version }))
    .slice(0, limit);
}

export function setLoadedBibleVersion(version, loaded) {
  LOADED_BIBLE_VERSIONS[version] = loaded;
}

export function getLoadedBibleVersion(version) {
  return LOADED_BIBLE_VERSIONS[version];
}
