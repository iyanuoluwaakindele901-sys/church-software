const CUSTOM_LIBRARY_ASSETS = [
  { key: 'christmas-snow', name: 'Christmas Snow', kind: 'video', dataUrl: './media/custom/christmas-snow.mp4', loop: true, category: 'Christmas' },
  { key: 'communion-loop', name: 'Communion Loop', kind: 'video', dataUrl: './media/custom/communion-loop.mp4', loop: true, category: 'Communion' },
  { key: 'blue-purple-cross', name: 'Blue & Purple Cross', kind: 'video', dataUrl: './media/custom/blue-purple-cross.mp4', loop: true, category: 'Worship' },
  { key: 'green-radiance', name: 'Green Radiance', kind: 'video', dataUrl: './media/custom/green-radiance.mp4', loop: true, category: 'Worship' },
  { key: 'sermon', name: 'Sermon', kind: 'image', dataUrl: './media/custom/sermon.jfif', category: 'Sermon' },
  { key: 'sun-and-clouds', name: 'Sun & Clouds', kind: 'image', dataUrl: './media/custom/sun-and-clouds.jpg', category: 'Worship' },
  { key: 'worship-tree', name: 'Worship Tree', kind: 'image', dataUrl: './media/custom/worship-media-pro-04.jpg', category: 'Worship' },
];

export const SERVICE_THEMES = [
  { id: 'service-welcome', name: 'Welcome Dawn', kind: 'image', dataUrl: './media/service/welcome-dawn.png', category: 'Welcome' },
  { id: 'service-worship', name: 'Worship Glory', kind: 'image', dataUrl: './media/service/worship-glory.png', category: 'Worship' },
  { id: 'service-word', name: 'The Word', kind: 'image', dataUrl: './media/service/word-prayer.png', category: 'Sermon & Prayer' },
  { id: 'service-thanks', name: 'Thanksgiving', kind: 'image', dataUrl: './media/service/thanksgiving.png', category: 'Offering & Closing' },
  { id: 'motion-living-water', name: 'Living Water Motion', kind: 'motion', css: 'radial-gradient(circle at 22% 18%, rgba(70,210,235,.28), transparent 27%), radial-gradient(circle at 75% 72%, rgba(33,94,170,.35), transparent 32%), linear-gradient(145deg, #031526, #092c45 48%, #071525)', animated: true, anim: 'drift', category: 'Motion' },
  { id: 'motion-glory-gold', name: 'Glory Gold Motion', kind: 'motion', css: 'radial-gradient(circle at 75% 18%, rgba(255,196,92,.4), transparent 24%), radial-gradient(circle at 18% 80%, rgba(113,67,175,.3), transparent 28%), linear-gradient(150deg, #110c23, #2d1947 52%, #17101d)', animated: true, anim: 'glow', category: 'Motion' },
  { id: 'motion-emerald', name: 'Emerald Grace Motion', kind: 'motion', css: 'radial-gradient(circle at 18% 30%, rgba(52,211,153,.25), transparent 30%), radial-gradient(circle at 82% 68%, rgba(234,179,8,.2), transparent 27%), linear-gradient(145deg, #031b1a, #07473f 48%, #071b22)', animated: true, anim: 'drift', category: 'Motion' },
  ...CUSTOM_LIBRARY_ASSETS.map(({ key, ...item }) => ({ ...item, id: `custom-theme-${key}` })),
];

export const SERVICE_MEDIA = [
  { id: 'media-welcome', name: 'Welcome / Pre-service', kind: 'image', dataUrl: './media/service/welcome-dawn.png', category: 'Welcome' },
  { id: 'media-praise', name: 'Praise & Worship', kind: 'image', dataUrl: './media/service/worship-glory.png', category: 'Worship' },
  { id: 'media-prayer', name: 'Prayer & Altar Call', kind: 'image', dataUrl: './media/service/word-prayer.png', category: 'Prayer' },
  { id: 'media-sermon', name: 'Sermon / Scripture', kind: 'image', dataUrl: './media/service/word-prayer.png', category: 'Word' },
  { id: 'media-offering', name: 'Offering & Thanksgiving', kind: 'image', dataUrl: './media/service/thanksgiving.png', category: 'Offering' },
  { id: 'media-communion', name: 'Holy Communion', kind: 'image', dataUrl: './themes/holy-communion.jpg', category: 'Communion' },
  { id: 'media-announcements', name: 'Announcements', kind: 'image', dataUrl: './media/service/thanksgiving.png', category: 'Notices' },
  { id: 'media-closing', name: 'Closing Blessing', kind: 'image', dataUrl: './media/service/welcome-dawn.png', category: 'Closing' },
  { id: 'media-motion-water', name: 'Living Water - short loop', kind: 'motion', css: SERVICE_THEMES[4].css, anim: 'drift', loop: true, category: 'Motion' },
  { id: 'media-motion-glory', name: 'Glory Gold - short loop', kind: 'motion', css: SERVICE_THEMES[5].css, anim: 'glow', loop: true, category: 'Motion' },
  { id: 'media-motion-emerald', name: 'Emerald Grace - short loop', kind: 'motion', css: SERVICE_THEMES[6].css, anim: 'drift', loop: true, category: 'Motion' },
  ...CUSTOM_LIBRARY_ASSETS.map(({ key, ...item }) => ({ ...item, id: `custom-media-${key}` })),
];

const uniqueSavedItems = (saved, builtIns) => {
  const usedIds = new Set(builtIns.map((item) => item.id));
  return saved.filter((item) => !builtIns.some((builtIn) => builtIn.id === item.id)).map((item, index) => {
    let id = item.id || `imported-${Date.now()}-${index}`;
    if (usedIds.has(id)) id = `${id}-recovered-${index}`;
    usedIds.add(id);
    return id === item.id ? item : { ...item, id };
  });
};

export const mergeBuiltInMedia = (saved = [], builtIns = SERVICE_MEDIA) => [
  ...builtIns,
  ...uniqueSavedItems(saved, builtIns),
];

export const mergeBuiltInThemes = (saved = []) => [
  ...SERVICE_THEMES,
  ...uniqueSavedItems(saved, SERVICE_THEMES),
];
