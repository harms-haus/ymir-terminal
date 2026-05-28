import { test, expect } from 'bun:test';
import { hashPassword, verifyPassword } from './password';

test('hashPassword returns a string', async () => {
  const hash = await hashPassword('supersecret');
  expect(typeof hash).toBe('string');
  expect(hash.length).toBeGreaterThan(0);
});

test('verifyPassword returns true for correct password', async () => {
  const hash = await hashPassword('hunter2');
  const result = await verifyPassword('hunter2', hash);
  expect(result).toBe(true);
});

test('verifyPassword returns false for wrong password', async () => {
  const hash = await hashPassword('correct-horse-battery-staple');
  const result = await verifyPassword('wrong-password', hash);
  expect(result).toBe(false);
});

test('different passwords produce different hashes', async () => {
  const hashA = await hashPassword('password-a');
  const hashB = await hashPassword('password-b');
  expect(hashA).not.toBe(hashB);
});
