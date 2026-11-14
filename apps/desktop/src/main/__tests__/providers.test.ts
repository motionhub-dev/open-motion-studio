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
const WIRE = { protocol: 'anthropic' as const, images: true };
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
    const listed = await store.save({ ...WIRE, name: 'Anthropic', baseUrl: 'https://api.anthropic.com/', model: 'claude-opus-5-5', key: KEY });
    expect(JSON.stringify(listed)).not.toContain(KEY);
    expect(listed.providers[0]).toMatchObject({ baseUrl: 'https://api.anthropic.com', hasKey: true });
    expect(listed.active).toBe(listed.providers[0]!.id);
    expect(await readFile(join(dir, 'settings.json'), 'utf8')).not.toContain(KEY);
    expect(await readFile(join(dir, 'keys.json'), 'utf8')).not.toContain(KEY);
    expect((await store.active()).key).toBe(KEY);
  });

  it('keeps the stored key when a change gives none', async () => {
    const store = new ProviderStore(dir);
    const { providers } = await store.save({ ...WIRE, name: 'A', baseUrl: 'https://a.example', model: 'm', key: KEY });
    await store.save({ ...WIRE, id: providers[0]!.id, name: 'A', baseUrl: 'https://a.example', model: 'm2' });
    expect(await store.active()).toMatchObject({ model: 'm2', key: KEY });
  });

  it('refuses an address a key should not be sent to', async () => {
    const store = new ProviderStore(dir);
    for (const baseUrl of ['http://api.example.com', 'ftp://x', 'not a url']) {
      await expect(store.save({ ...WIRE, name: 'A', baseUrl, model: 'm' })).rejects.toThrow();
    }
  });

  it('calls a server on this machine without a key, and no other', async () => {
    const store = new ProviderStore(dir);
    const local = await store.save({ protocol: 'openai', images: false, name: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen' });
    expect(local.providers[0]).toMatchObject({ protocol: 'openai', images: false, hasKey: false, ready: true });
    expect(await store.active()).toMatchObject({ key: '', baseUrl: 'http://localhost:11434/v1' });
    const remote = await store.save({ protocol: 'openai', images: true, name: 'R', baseUrl: 'https://r.example/v1', model: 'm' });
    await store.activate(remote.providers[1]!.id);
    await expect(store.active()).rejects.toThrow('has no key');
    await expect(store.save({ ...WIRE, protocol: 'grpc' as never, name: 'X', baseUrl: 'https://x.example', model: 'm' })).rejects.toThrow();
  });

  it('drafts a provider for a test without saving it: the typed key, else the stored one', async () => {
    const store = new ProviderStore(dir);
    const { providers } = await store.save({ ...WIRE, name: 'A', baseUrl: 'https://a.example', model: 'm', key: KEY });
    const id = providers[0]!.id;
    expect(await store.draft({ ...WIRE, id, name: 'A', baseUrl: 'https://a.example', model: 'm2' })).toMatchObject({ id, model: 'm2', key: KEY });
    expect(await store.draft({ ...WIRE, id, name: 'A', baseUrl: 'https://a.example', model: 'm', key: ' sk-new ' })).toMatchObject({ key: 'sk-new' });
    expect(await store.draft({ protocol: 'openai', images: false, name: 'L', baseUrl: 'http://127.0.0.1:1234/v1', model: 'q' })).toMatchObject({ key: '' });
    await expect(store.draft({ ...WIRE, name: 'B', baseUrl: 'https://b.example', model: 'm' })).rejects.toThrow("Type B's key");
    await expect(store.draft({ ...WIRE, name: 'B', baseUrl: 'http://b.example', model: 'm', key: KEY })).rejects.toThrow();
    expect((await store.list()).providers).toHaveLength(1);
    expect((await store.list()).providers[0]!.model).toBe('m');
  });

  it('forgets the key with the provider, and says when no model is set up', async () => {
    const store = new ProviderStore(dir);
    const { providers } = await store.save({ ...WIRE, name: 'A', baseUrl: 'https://a.example', model: 'm', key: KEY });
    const after = await store.remove(providers[0]!.id);
    expect(after).toMatchObject({ providers: [], active: null });
    expect(await readFile(join(dir, 'keys.json'), 'utf8')).toBe('{}\n');
    await expect(store.active()).rejects.toThrow('No model is set up');
  });
});

describe('the coding agents’ settings', () => {
  it('are kept in settings.json beside the providers, each agent on its own, unset meaning its own default', async () => {
    const store = new ProviderStore(dir);
    expect(await store.agentSettings()).toEqual({
      claude: { model: '', effort: '', fallbackModel: '', budgetUsd: null },
      codex: { model: '', effort: '' },
    });
    await store.save({ ...WIRE, name: 'A', baseUrl: 'https://a.example', model: 'm', key: KEY });
    await store.saveAgentSettings('claude', { model: ' opus ', effort: 'xhigh', fallbackModel: 'sonnet', budgetUsd: 2 });
    await store.saveAgentSettings('codex', { model: 'gpt-6.1-sol', effort: 'high' });
    const saved = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'));
    expect(saved.agents).toEqual({
      claude: { model: 'opus', effort: 'xhigh', fallbackModel: 'sonnet', budgetUsd: 2 },
      codex: { model: 'gpt-6.1-sol', effort: 'high' },
    });
    expect(saved.providers).toHaveLength(1);
    // Saving a provider keeps the agents' settings.
    await store.save({ ...WIRE, name: 'B', baseUrl: 'https://b.example', model: 'm', key: KEY });
    expect((await store.agentSettings()).codex.model).toBe('gpt-6.1-sol');
  });

  it('refuses what could read as another flag, an effort Claude Code does not take, and a cap that is no amount', async () => {
    const store = new ProviderStore(dir);
    const claude = { model: '', effort: '', fallbackModel: '', budgetUsd: null };
    await expect(store.saveAgentSettings('claude', { ...claude, model: '--dangerously-skip-permissions' })).rejects.toThrow('Not a model');
    await expect(store.saveAgentSettings('codex', { model: 'a b', effort: '' })).rejects.toThrow('Not a model');
    await expect(store.saveAgentSettings('claude', { ...claude, effort: 'ultra' })).rejects.toThrow('effort');
    await expect(store.saveAgentSettings('claude', { ...claude, model: 'opus', fallbackModel: 'opus' })).rejects.toThrow('fallback');
    for (const budgetUsd of [0, -1, Number.NaN, '5']) {
      await expect(store.saveAgentSettings('claude', { ...claude, budgetUsd })).rejects.toThrow('cap');
    }
    await expect(store.saveAgentSettings('built-in' as never, {})).rejects.toThrow();
  });
});
