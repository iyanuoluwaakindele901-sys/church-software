export const BIBLE_BOOKS = {
  old: [
    ['Genesis', 50], ['Exodus', 40], ['Leviticus', 27], ['Numbers', 36], ['Deuteronomy', 34],
    ['Joshua', 24], ['Judges', 21], ['Ruth', 4], ['1 Samuel', 31], ['2 Samuel', 24],
    ['1 Kings', 22], ['2 Kings', 25], ['1 Chronicles', 29], ['2 Chronicles', 36], ['Ezra', 10],
    ['Nehemiah', 13], ['Esther', 10], ['Job', 42], ['Psalms', 150], ['Proverbs', 31],
    ['Ecclesiastes', 12], ['Song of Solomon', 8], ['Isaiah', 66], ['Jeremiah', 52], ['Lamentations', 5],
    ['Ezekiel', 48], ['Daniel', 12], ['Hosea', 14], ['Joel', 3], ['Amos', 9],
    ['Obadiah', 1], ['Jonah', 4], ['Micah', 7], ['Nahum', 3], ['Habakkuk', 3],
    ['Zephaniah', 3], ['Haggai', 2], ['Zechariah', 14], ['Malachi', 4],
  ].map(([name, chapters]) => ({ name, chapters })),
  new: [
    ['Matthew', 28], ['Mark', 16], ['Luke', 24], ['John', 21], ['Acts', 28],
    ['Romans', 16], ['1 Corinthians', 16], ['2 Corinthians', 13], ['Galatians', 6], ['Ephesians', 6],
    ['Philippians', 4], ['Colossians', 4], ['1 Thessalonians', 5], ['2 Thessalonians', 3], ['1 Timothy', 6],
    ['2 Timothy', 4], ['Titus', 3], ['Philemon', 1], ['Hebrews', 13], ['James', 5],
    ['1 Peter', 5], ['2 Peter', 3], ['1 John', 5], ['2 John', 1], ['3 John', 1],
    ['Jude', 1], ['Revelation', 22],
  ].map(([name, chapters]) => ({ name, chapters })),
};

export const KNOWN_VERSES = {
  'Genesis 1:1': 'In the beginning God created the heaven and the earth.',
  'Psalms 23:1': 'The LORD is my shepherd; I shall not want.',
  'John 3:16': 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
  'Romans 8:28': 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.',
  'Isaiah 40:31': 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.',
  '1 Corinthians 13:4': 'Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up.',
  'Philippians 4:13': 'I can do all things through Christ which strengtheneth me.',
  'Joshua 1:9': 'Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.',
  'John 14:27': 'Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid.',
  'Matthew 11:28': 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.',
  'Proverbs 3:5': 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.',
};

export const BIBLE_VERSION_FILES = {
  yor: { id: 'yor', label: 'YOR', name: 'Open Yoruba Contemporary Bible', file: 'yor_vpl.txt', format: 'vpl' },
  kjv: { id: 'kjv', label: 'KJV', file: 'kjv.ewb' },
  niv: { id: 'niv', label: 'NIV', file: 'niv.ewb' },
  nlt: { id: 'nlt', label: 'NLT', file: 'nlt.ewb' },
  msg: { id: 'msg', label: 'MSG', file: 'msg.ewb' },
  amp: { id: 'amp', label: 'AMP', file: 'amp.ewb' },
  asv: { id: 'asv', label: 'ASV', file: 'asv.ewb' },
  ylt: { id: 'ylt', label: 'YLT', file: 'ylt.ewb' },
  niva: { id: 'niva', label: 'NIVA', file: 'niva.ewb' },
  nkjv: { id: 'nkjv', label: 'NKJV', file: 'nkjv.ewb_3' },
};

export const SUPPORTED_BIBLE_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'fr', name: 'French' },
];

export const TRANSLATED_VERSES = {
  es: {
    'John 3:16': 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito; para que todo aquel que en él cree, no perezca, mas tenga vida eterna.',
    'Genesis 1:1': 'En el principio creó Dios los cielos y la tierra.',
    'Psalms 23:1': 'El Señor es mi pastor; nada me faltará.',
    'Romans 8:28': 'Sabemos que a los que aman a Dios, todas las cosas les ayudan a bien.',
    'Philippians 4:13': 'Todo lo puedo en Cristo que me fortalece.',
  },
  yo: {
    'John 3:16': 'Nítorí pé Ọlọrun fẹ́ ayé ní bẹ́ẹ̀ gẹ́lẹ́, ó fi Ọmọ rẹ̀ kan bí, kí gbogbo ẹni tí ó bá gbà á gbà ìyè ayérayé.',
    'Genesis 1:1': 'Ní ìbẹ̀rẹ̀ Ọlọrun dá ọ̀run àti ilẹ̀ ayé.',
    'Psalms 23:1': 'Olúwa ni olùtọ́ mi, emi kì yóò ní àìníkan.',
    'Romans 8:28': 'A sì mọ̀ pé ohun gbogbo ń ṣiṣẹ́ pọ̀ fún rere sí àwọn tí ó fẹ́ Ọlọrun.',
    'Philippians 4:13': 'Mo lè ṣe gbogbo nkan nínú Kristi tí ó fún mi ní agbára.',
  },
  fr: {
    'John 3:16': 'Car Dieu a tant aimé le monde qu\'il a donné son Fils unique, afin que quiconque croit en lui ne périsse point, mais ait la vie éternelle.',
    'Genesis 1:1': 'Au commencement, Dieu créa les cieux et la terre.',
    'Psalms 23:1': 'L\'Éternel est mon berger: je ne manquerai de rien.',
    'Romans 8:28': 'Nous savons que toutes choses concourent au bien de ceux qui aiment Dieu.',
    'Philippians 4:13': 'Je puis tout par celui qui me fortifie.',
  },
};

export const BUILTIN_THEMES = [
  { id: 'sunset', name: 'Sunset', css: 'linear-gradient(160deg, #4a3625 0%, #8a5a3a 35%, #d4915a 60%, #2a2035 100%)', animated: false, anim: 'none' },
  { id: 'clouds', name: 'Clouds', css: 'linear-gradient(160deg, #2b3a4a 0%, #4d6a85 40%, #8fa8bd 70%, #cfd9e0 100%)', animated: false, anim: 'none' },
  { id: 'midnight', name: 'Midnight', css: 'linear-gradient(160deg, #0a0a1a 0%, #1a1a3a 40%, #2a1a4a 70%, #150a25 100%)', animated: false, anim: 'none' },
  { id: 'stage', name: 'Stage', css: 'linear-gradient(160deg, #1a0a0a 0%, #4a1a1a 35%, #7a2a1a 60%, #2a0a0a 100%)', animated: false, anim: 'none' },
];

export const KNOWN_SONG_ARTISTS = {
  'amazing grace': 'Chris Tomlin', 'how great is our god': 'Chris Tomlin', '10000 reasons': 'Matt Redman',
  '10,000 reasons': 'Matt Redman', 'oceans': 'Hillsong United', 'what a beautiful name': 'Hillsong Worship',
  'good good father': 'Chris Tomlin', 'cornerstone': 'Hillsong Worship', 'living hope': 'Phil Wickham',
  'reckless love': 'Cory Asbury', 'way maker': 'Sinach', 'goodness of god': 'Bethel Music',
  'raise a hallelujah': 'Bethel Music', 'graves into gardens': 'Elevation Worship',
};

export const LOCAL_SONG_LIBRARY = [
  { id: 'local1', title: 'Amazing Grace', artist: 'Chris Tomlin', lyrics: 'Amazing grace! How sweet the sound\nThat saved a wretch like me\nI once was lost, but now am found\nWas blind, but now I see.', source: 'local library' },
  { id: 'local2', title: 'How Great Is Our God', artist: 'Chris Tomlin', lyrics: 'The splendor of a King, clothed in majesty\nLet all the earth rejoice\nAll the earth rejoice\nHe wraps Himself in light, and darkness tries to hide\nAnd trembles at His voice.', source: 'local library' },
  { id: 'local3', title: '10,000 Reasons', artist: 'Matt Redman', lyrics: 'Bless the Lord, O my soul\nO my soul\nWorship His holy name\nSing like never before\nO my soul\nI\'ll worship Your holy name.', source: 'local library' },
  { id: 'local4', title: 'Way Maker', artist: 'Sinach', lyrics: 'You are here, moving in our midst\nI worship You\nI worship You\nYou are here, working in this place\nI worship You\nI worship You.', source: 'local library' },
];
