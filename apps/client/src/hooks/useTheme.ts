import { useState, useEffect, useCallback } from 'react';

export function dullColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let hDeg = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === r) {
      hDeg = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      hDeg = ((b - r) / d + 2) / 6;
    } else {
      hDeg = ((r - g) / d + 4) / 6;
    }
  }

  const newS = Math.min(100, Math.max(0, Math.round(s * 0.6 * 100)));
  const newL = Math.min(100, Math.max(0, Math.round(l * 0.55 * 100)));
  const hNorm = ((hDeg % 1) + 1) % 1;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const sNorm = newS / 100;
  const lNorm = newL / 100;

  const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
  const p = 2 * lNorm - q;

  const outR = Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255);
  const outG = Math.round(hue2rgb(p, q, hNorm) * 255);
  const outB = Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255);

  return (
    '#' +
    outR.toString(16).padStart(2, '0') +
    outG.toString(16).padStart(2, '0') +
    outB.toString(16).padStart(2, '0')
  );
}

export function useTheme() {
  const [accentColor, setAccentColorState] = useState('#007acc');

  const applyToDom = useCallback((color: string) => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--accent-hover', color + 'cc');
      document.documentElement.style.setProperty('--accent-dim', dullColor(color));
    }
  }, []);

  const setAccentColor = useCallback((color: string) => {
    setAccentColorState(color);
  }, []);

  useEffect(() => {
    applyToDom(accentColor);
  }, [applyToDom, accentColor]);

  const themeVars = {
    '--accent': accentColor,
    '--accent-hover': accentColor + 'cc',
    '--accent-dim': dullColor(accentColor),
  } as React.CSSProperties;

  return { accentColor, setAccentColor, themeVars };
}
