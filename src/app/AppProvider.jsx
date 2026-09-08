import { createContext, useState } from 'react';

// This context intentionally lives beside its provider so the app has one shared entry point.
// eslint-disable-next-line react-refresh/only-export-components
export const AppContext = createContext(null);

export default function AppProvider({ children }) {
  const [cameraManagerOpen, setCameraManagerOpen] = useState(false);

  const runExternalSongSearch = (query) => {
    if (!query) return;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query + ' lyrics')}`;
    try {
      window.open(url, '_blank');
    } catch {
      // noop
    }
  };

  return (
    <AppContext.Provider value={{ cameraManagerOpen, setCameraManagerOpen, runExternalSongSearch }}>
      {children}
    </AppContext.Provider>
  );
}
