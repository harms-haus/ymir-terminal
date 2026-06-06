/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

import { YmirLogo } from './YmirLogo';

describe('YmirLogo', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders SVG with data-testid="ymir-logo"
  // -----------------------------------------------------------------------
  test('renders SVG with data-testid="ymir-logo"', () => {
    const { getByTestId } = render(React.createElement(YmirLogo));

    const svg = getByTestId('ymir-logo');
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });

  // -----------------------------------------------------------------------
  // 2. Defaults width/height to 120
  // -----------------------------------------------------------------------
  test('defaults width/height to 120', () => {
    const { getByTestId } = render(React.createElement(YmirLogo));

    const svg = getByTestId('ymir-logo');
    expect(svg.getAttribute('width')).toBe('120');
    expect(svg.getAttribute('height')).toBe('120');
  });

  // -----------------------------------------------------------------------
  // 3. Applies custom size prop
  // -----------------------------------------------------------------------
  test('applies custom size prop', () => {
    const { getByTestId } = render(React.createElement(YmirLogo, { size: 64 }));

    const svg = getByTestId('ymir-logo');
    expect(svg.getAttribute('width')).toBe('64');
    expect(svg.getAttribute('height')).toBe('64');
  });
});
