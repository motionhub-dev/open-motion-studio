import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { within } from '../preview';

vi.mock('electron', () => ({ app: {}, protocol: {} }));

describe('within', () => {
  const root = join('/projects', 'film', '.motion-studio', 'build');

  it('maps a URL path to a file under the root', () => {
    expect(within(root, 'film.js')).toBe(join(root, 'film.js'));
    expect(within(root, 'img/logo%20big.png')).toBe(join(root, 'img', 'logo big.png'));
  });

  it('refuses a path that would leave the root, however it is spelled', () => {
    for (const path of ['../film.tsx', '%2e%2e/film.tsx', 'a/../../x', '..%2F..%2Fsecret', '..\\x', '']) {
      expect(within(root, path)).toBeNull();
    }
  });
});
