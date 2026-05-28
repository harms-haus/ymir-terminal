import { useState, useEffect, useCallback } from 'react';

export function useTheme() {
  const [accentColor, setAccentColorState] = useState('#007acc');

  const applyToDom = useCallback((color: string) => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--accent-hover', color + 'cc');
    }
  }, []);

  const setAccentColor = useCallback((color: string) => {
    setAccentColorState(color);
    applyToDom(color);
  }, [applyToDom]);

  useEffect(() => {
    applyToDom(accentColor);
  }, [applyToDom, accentColor]);

  const themeVars = {
    '--accent': accentColor,
    '--accent-hover': accentColor + 'cc',
  } as React.CSSProperties;

  return { accentColor, setAccentColor, themeVars };
}
