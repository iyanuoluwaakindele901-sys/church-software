import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BIBLE_VERSION_FILES } from '../src/data/bibleData.js';
import { parseEwbBible, parseVplBible } from '../src/utils/bible.js';

const bibleDirectory = fileURLToPath(new URL('../public/bibles/', import.meta.url));
const results = [];

for (const [version, info] of Object.entries(BIBLE_VERSION_FILES)) {
  const file = await readFile(`${bibleDirectory}/${info.file}`);
  const parsed = info.format === 'vpl'
    ? parseVplBible(version, file.toString('utf8'))
    : await parseEwbBible(version, new Uint8Array(file));
  const verseCount = Object.keys(parsed.verses).length;
  const sample = parsed.verses['John 3:16'];
  if (parsed.books.length !== 66 || verseCount < 30000 || !sample) {
    throw new Error(`${version.toUpperCase()} failed Bible integrity checks.`);
  }
  results.push({ version: version.toUpperCase(), books: parsed.books.length, verses: verseCount });
}

console.log(JSON.stringify({ versions: results.length, integrity: 'ok', results }));
