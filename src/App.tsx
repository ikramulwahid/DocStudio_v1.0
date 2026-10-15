import React, { useState, useEffect } from 'react';
import { Topbar } from './components/topbar/Topbar';
import { Workspace } from './components/workspace/Workspace';
import { ThemeMode } from './types';
import './styles/theme.css';
import './styles/globals.css';
import './App.css';

const THEME_STORAGE_KEY = 'docstudio_ui_theme';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (saved === 'multicolor' || saved === 'light' || saved === 'dark') {
      return saved;
    }
    return 'multicolor';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
  };

  return (
    <div className="app-container" data-theme={theme}>
      <Topbar
        currentTheme={theme}
        onThemeChange={handleThemeChange}
        documentName="Untitled-1.docstudio"
        sessionStatus="New"
      />
      <Workspace />
    </div>
  );
};

export default App;
