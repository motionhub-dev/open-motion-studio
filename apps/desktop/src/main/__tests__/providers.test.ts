import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in keychain: sealing reverses the text, so a sealed key never equals the key.
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (text: string) => Buffer.from([...text].reverse().join('')),
    decryptString: (sealed: Buffer) => [...sealed.toString()].reverse().join(''),
  },
}));

const { ProviderStore } = await import('../providers');

const KEY = 'sk-ant-secret-0123456789';
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oms-providers-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('ProviderStore', () => {
  it('keeps the key sealed, out of the settings and out of what the renderer sees', async () => {
    const store = new ProviderStore(dir);
    const listed = await store.save({ name: 'Anthropic', baseUrl: 'https://api.anthropic.com/', model: 'claude-opus-5-5', key: KEY });
    expect(JSON.stringify(listed)).not.toContain(KEY);
    expect(listed.providers[0]).toMatchObject({ baseUrl: 'https://api.anthropic.com', hasKey: true });
    expect(listed.active).toBe(listed.providers[0]!.id);
    expect(await readFile(join(dir, 'settings.json'), 'utf8')).not.toContain(KEY);
    expect(await readFile(join(dir, 'keys.json'), 'utf8')).not.toContain(KEY);
    expect((await store.active()).key).toBe(KEY);
  });

  it('keeps the stored key when a change gives none', async () => {
    const store = new ProviderStore(dir);
    const { providers } = await store.save({ name: 'A', baseUrl: 'https://a.example', model: 'm', key: KEY });
    await store.save({ id: providers[0]!.id, name: 'A', baseUrl: 'https://a.example', model: 'm2' });
    expect(await store.active()).toMatchObject({ model: 'm2', key: KEY });
  });

  it('refuses an address a key should not be sent to', async () => {
    const store = new ProviderStore(dir);
    for (const baseUrl of ['http://api.example.com', 'ftp://x', 'not a url']) {
      await expect(store.save({ name: 'A', baseUrl, model: 'm' })).rejects.toThrow();
    }
    await expect(store.save({ name: 'Local', baseUrl: 'http://localhost:11434', model: 'm' })).resolves.toBeTruthy();
  });

  it('forgets the key with the provider, and says when no model is set up', async () => {
    const store = new ProviderStore(dir);
    const { providers } = await store.save({ name: 'A', baseUrl: 'https://a.example', model: 'm', key: KEY });
    const after = await store.remove(providers[0]!.id);
    expect(after).toMatchObject({ providers: [], active: null });
    expect(await readFile(join(dir, 'keys.json'), 'utf8')).toBe('{}\n');
    await expect(store.active()).rejects.toThrow('No model is set up');
  });
});
