/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
await GlobalRegistrator.register();
import { test, expect } from 'bun:test';
import { render } from '@testing-library/react';

test('renders a simple React element', () => {
  const { getByText } = render(<div>Hello, Ymir!</div>);
  expect(getByText('Hello, Ymir!')).toBeTruthy();
});
