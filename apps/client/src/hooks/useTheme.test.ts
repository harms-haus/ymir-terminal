/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, beforeEach } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from './useTheme';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTheme', () => {
  beforeEach(() => {
    // Reset any custom properties on document root between tests
    if (typeof document !== 'undefined') {
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent-hover');
    }
  });

  // -----------------------------------------------------------------------
  // 1. useTheme() returns { accentColor, setAccentColor, themeVars }
  // -----------------------------------------------------------------------
  test('returns accentColor, setAccentColor, and themeVars', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current).toHaveProperty('accentColor');
    expect(result.current).toHaveProperty('setAccentColor');
    expect(result.current).toHaveProperty('themeVars');
    expect(typeof result.current.setAccentColor).toBe('function');
  });

  // -----------------------------------------------------------------------
  // 2. Default accent color is '#007acc'
  // -----------------------------------------------------------------------
  test('default accent color is #007acc', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.accentColor).toBe('#007acc');
  });

  // -----------------------------------------------------------------------
  // 3. setAccentColor('#ff0000') updates the accent color
  // -----------------------------------------------------------------------
  test('setAccentColor updates the accent color', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.accentColor).toBe('#007acc');

    act(() => {
      result.current.setAccentColor('#ff0000');
    });

    expect(result.current.accentColor).toBe('#ff0000');
  });

  // -----------------------------------------------------------------------
  // 4. themeVars returns CSS custom properties object with correct values
  // -----------------------------------------------------------------------
  test('themeVars returns CSS custom properties object', () => {
    const { result } = renderHook(() => useTheme());

    // Default themeVars
    expect(result.current.themeVars).toEqual({
      '--accent': '#007acc',
      '--accent-hover': '#007acccc',
    });

    // After setting a new color
    act(() => {
      result.current.setAccentColor('#ff0000');
    });

    expect(result.current.themeVars).toEqual({
      '--accent': '#ff0000',
      '--accent-hover': '#ff0000cc',
    });
  });

  // -----------------------------------------------------------------------
  // 5. Theme persists via CSS custom properties on document root
  // -----------------------------------------------------------------------
  test('theme persists via CSS custom properties on document root', () => {
    const { result } = renderHook(() => useTheme());

    // Initial mount should set CSS custom properties
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#007acc');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toBe('#007acccc');

    act(() => {
      result.current.setAccentColor('#ff0000');
    });

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ff0000');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toBe('#ff0000cc');
  });
});
