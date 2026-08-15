export async function translateText(text, targetLang) {
  if (!text || !targetLang || targetLang === 'en') return text;
  // Minimal fallback translator: use libretranslate public instance if available.
  try {
    const res = await fetch('https://libretranslate.de/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'en', target: targetLang, format: 'text' }),
    });
    if (!res.ok) return `${text} [translation unavailable]`;
    const data = await res.json();
    return data.translatedText || `${text} [translation unavailable]`;
  } catch (err) {
    return `${text} [translation failed]`;
  }
}
