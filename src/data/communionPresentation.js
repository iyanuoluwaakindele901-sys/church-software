import communionSource from './holyCommunion.txt?raw';

export const COMMUNION_PRESENTATION_ID = 'builtin-holy-communion';
export const COMMUNION_THEME_ID = 'builtin-holy-communion-theme';

export const COMMUNION_THEME = {
  id: COMMUNION_THEME_ID,
  name: 'Holy Communion',
  kind: 'image',
  css: 'linear-gradient(rgba(12, 7, 4, 0.66), rgba(12, 7, 4, 0.76)), url("./themes/holy-communion.jpg") center/cover no-repeat',
  imported: false,
  credit: 'Photo by James Coleman on Unsplash',
};

const cleanLine = (line) => line
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/\u2013|\u2014/g, '-');

const splitLongLine = (line, maxLength = 72) => {
  if (line.length <= maxLength) return [line];
  const sentenceParts = line.split(/(?<=[.!?;:])\s+/);
  const result = [];
  let current = '';

  sentenceParts.forEach((part) => {
    if (part.length > maxLength) {
      const words = part.split(/\s+/);
      words.forEach((word) => {
        if (!current || `${current} ${word}`.length <= maxLength) current = current ? `${current} ${word}` : word;
        else { result.push(current); current = word; }
      });
      return;
    }
    if (!current || `${current} ${part}`.length <= maxLength) current = current ? `${current} ${part}` : part;
    else { result.push(current); current = part; }
  });
  if (current) result.push(current);
  return result;
};

const isHeading = (text) => {
  const withoutNumber = text.replace(/^\d+\.\s*/, '');
  const letters = withoutNumber.replace(/[^A-Za-z]/g, '');
  return letters.length >= 4 && withoutNumber.length <= 72 && withoutNumber === withoutNumber.toUpperCase();
};

const createCommunionSlides = () => {
  const blocks = communionSource
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n+/)
    .map((block) => block.split('\n').map(cleanLine).filter(Boolean))
    .filter((lines) => lines.length);

  const slides = [{
    id: 'communion-title',
    label: 'Holy Communion',
    text: 'HOLY COMMUNION\nThe Order of Service',
    fontSize: 76,
    fontFamily: 'Georgia, "Times New Roman", serif',
    align: 'center',
    bold: true,
  }];
  let section = 'Preparation';
  let sequence = 1;

  blocks.forEach((rawLines) => {
    const blockText = rawLines.join(' ');
    const heading = rawLines.length === 1 && isHeading(blockText);
    if (heading) section = blockText.replace(/^\d+\.\s*/, '').replace(/[.:]+$/, '');

    const lines = rawLines.flatMap((line) => splitLongLine(line));
    const groups = [];
    let group = [];
    let characterCount = 0;

    lines.forEach((line) => {
      const nextCount = characterCount + line.length;
      if (group.length && (group.length >= 5 || nextCount > 185)) {
        groups.push(group);
        group = [];
        characterCount = 0;
      }
      group.push(line);
      characterCount += line.length;
    });
    if (group.length) groups.push(group);

    groups.forEach((groupLines, groupIndex) => {
      const compact = groupLines.join('\n');
      const groupHeading = heading && groups.length === 1;
      slides.push({
        id: `communion-${sequence}`,
        label: groupHeading ? section : `${section} ${groupIndex + 1}`,
        text: compact,
        fontSize: 62,
        fontFamily: 'Georgia, "Times New Roman", serif',
        align: 'center',
        bold: groupHeading || /^(All|President):/.test(compact),
      });
      sequence += 1;
    });
  });

  return slides;
};

export const COMMUNION_PRESENTATION = {
  id: COMMUNION_PRESENTATION_ID,
  name: 'Holy Communion Service',
  description: 'Complete Holy Communion liturgy',
  themeId: COMMUNION_THEME_ID,
  builtin: true,
  slides: createCommunionSlides(),
};

export const ensureCommunionPresentation = (presentations = []) => (
  presentations.some((presentation) => presentation.id === COMMUNION_PRESENTATION_ID)
    ? presentations.map((presentation) => presentation.id === COMMUNION_PRESENTATION_ID ? {
      ...presentation,
      slides: presentation.slides.map((slide) => ({ ...slide, fontSize: slide.id === 'communion-title' ? 76 : 62 })),
    } : presentation)
    : [...presentations, COMMUNION_PRESENTATION]
);

export const ensureCommunionTheme = (themes = []) => (
  themes.some((theme) => theme.id === COMMUNION_THEME_ID)
    ? themes
    : [...themes, COMMUNION_THEME]
);
