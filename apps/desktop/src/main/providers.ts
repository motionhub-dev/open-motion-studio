// The model providers a person has set up: where each is, which model it runs, and its key.
// Settings live in the app's userData as settings.json; a key never does. Each key is sealed
// with Electron's safeStorage (the OS keychain's secret) and kept as ciphertext in keys.json,
// opened only at the moment of a call, and never sent to the renderer, written to a log or
// put in an error (CLAUDE.md, "Architecture rules").

import { safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentSettings, Protocol, ProviderInput, ProviderView, Providers } from '../shared/api';
import { CLAUDE_EFFORTS } from './agent/harness';

interface StoredProvider {
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  model: string;
  images: boolean;
}

interface Settings {
  providers: StoredProvider[];
  active: string | null;
  agents?: Partial<AgentSettings>;
}

const NO_AGENT_SETTINGS: AgentSettings = {
  claude: { model: '', effort: '', fallbackModel: '', budgetUsd: null },
  codex: { model: '', effort: '' },
};

/**
 * A model or effort as a CLI argument takes it: empty (the agent's own default) or a name with no space and no
 * leading dash, so it can never read as another flag.
 */
function cleanName(value: unknown, what: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(`Not ${what}.`);
  const name = value.trim();
  if (name && !/^[A-Za-z0-9][\w.:/[\]-]*$/.test(name)) throw new Error(`Not ${what}: ${name}`);
  return name;
}

/** One coding agent's settings as the form gave them, checked. */
export function cleanAgentSettings<K extends keyof AgentSettings>(kind: K, input: unknown): AgentSettings[K] {
  if (!input || typeof input !== 'object') throw new Error('Not an agent’s settings.');
  const given = input as Record<string, unknown>;
  const model = cleanName(given.model, 'a model');
  const effort = cleanName(given.effort, 'an effort');
  if (kind === 'codex') return { model, effort } as AgentSettings[K];
  if (kind !== 'claude') throw new Error('Choose an agent.');
  if (effort && !CLAUDE_EFFORTS.includes(effort)) throw new Error(`Claude Code takes an effort of ${CLAUDE_EFFORTS.join(', ')}.`);
  const fallbackModel = cleanName(given.fallbackModel, 'a fallback model');
  if (fallbackModel && fallbackModel === model) throw new Error('The fallback model has to be another model than the one Claude Code runs on.');
  const budget = given.budgetUsd;
  if (budget !== null && budget !== undefined && (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0)) {
    throw new Error('A cap per turn is an amount above zero, in dollars.');
  }
  return { model, effort, fallbackModel, budgetUsd: typeof budget === 'number' ? budget : null } as AgentSettings[K];
}

export interface Provider extends StoredProvider {
  /** The key, opened from its seal for this call; '' for a server on this machine that needs none. */
  key: string;
}

const LOCAL = ['localhost', '127.0.0.1', '[::1]'];
const isLocal = (url: string): boolean => LOCAL.includes(new URL(url).hostname);

async function readJson<T>(file: string, empty: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty;
    throw new Error(`${file} could not be read: ${(error as Error).message}`);
  }
}

const writeJson = (file: string, value: unknown) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

/** Whether this machine seals keys with a real secret. Linux without a keyring falls back to a fixed one. */
export function weakKeyStorage(): boolean {
  return process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text';
}

function cleanUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('A provider needs an address.');
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`Not an address: ${value}`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL.includes(url.hostname))) {
    throw new Error('A provider is reached over https (http only on this machine).');
  }
  return url.href.replace(/\/+$/, '');
}

function cleanText(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`A provider needs ${what}.`);
  return value.trim();
}

/** A provider as the form gave it, checked; a new one is given an id. */
function cleanProvider(input: ProviderInput): StoredProvider {
  if (input.protocol !== 'anthropic' && input.protocol !== 'openai') throw new Error('A provider speaks Messages or Chat Completions.');
  return {
    id: typeof input.id === 'string' && input.id ? input.id : randomUUID(),
    name: cleanText(input.name, 'a name'),
    protocol: input.protocol,
    baseUrl: cleanUrl(input.baseUrl),
    model: cleanText(input.model, 'a model'),
    images: input.images !== false,
  };
}

/** The providers as the renderer may see them: no key, only whether one is set. */
export class ProviderStore {
  constructor(private readonly dir: string) {}

  private get settingsFile() {
    return join(this.dir, 'settings.json');
  }

  private get keysFile() {
    return join(this.dir, 'keys.json');
  }

  private settings() {
    return readJson<Settings>(this.settingsFile, { providers: [], active: null });
  }

  private keys() {
    return readJson<Record<string, string>>(this.keysFile, {});
  }

  async list(): Promise<Providers> {
    const [settings, keys] = await Promise.all([this.settings(), this.keys()]);
    const providers: ProviderView[] = settings.providers.map((p) => ({
      ...p,
      hasKey: p.id in keys,
      ready: p.id in keys || isLocal(p.baseUrl),
    }));
    return { providers, active: settings.active, weakKeyStorage: weakKeyStorage() };
  }

  /** Adds a provider (no id) or changes one; a key, when given, replaces the stored one. */
  async save(input: ProviderInput): Promise<Providers> {
    const settings = await this.settings();
    const provider = cleanProvider(input);
    const at = settings.providers.findIndex((p) => p.id === provider.id);
    if (input.id && at < 0) throw new Error('That provider no longer exists.');
    if (at >= 0) settings.providers[at] = provider;
    else settings.providers.push(provider);
    settings.active ??= provider.id;
    if (typeof input.key === 'string' && input.key.trim()) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('This system has no keychain to keep a key in.');
      const keys = await this.keys();
      keys[provider.id] = safeStorage.encryptString(input.key.trim()).toString('base64');
      await writeJson(this.keysFile, keys);
    }
    await writeJson(this.settingsFile, settings);
    return this.list();
  }

  async remove(id: unknown): Promise<Providers> {
    const settings = await this.settings();
    settings.providers = settings.providers.filter((p) => p.id !== id);
    if (settings.active === id) settings.active = settings.providers[0]?.id ?? null;
    const keys = await this.keys();
    if (typeof id === 'string' && id in keys) {
      delete keys[id];
      await writeJson(this.keysFile, keys);
    }
    await writeJson(this.settingsFile, settings);
    return this.list();
  }

  async activate(id: unknown): Promise<Providers> {
    const settings = await this.settings();
    if (!settings.providers.some((p) => p.id === id)) throw new Error('That provider no longer exists.');
    settings.active = id as string;
    await writeJson(this.settingsFile, settings);
    return this.list();
  }

  /** How the person runs their own coding agents; what was never set is the agent's own default. */
  async agentSettings(): Promise<AgentSettings> {
    const saved = (await this.settings()).agents ?? {};
    return { claude: { ...NO_AGENT_SETTINGS.claude, ...saved.claude }, codex: { ...NO_AGENT_SETTINGS.codex, ...saved.codex } };
  }

  async saveAgentSettings<K extends keyof AgentSettings>(kind: K, input: unknown): Promise<AgentSettings> {
    const cleaned = cleanAgentSettings(kind, input);
    const settings = await this.settings();
    settings.agents = { ...settings.agents, [kind]: cleaned };
    await writeJson(this.settingsFile, settings);
    return this.agentSettings();
  }

  /** The active provider with its key opened, for one call. */
  async active(): Promise<Provider> {
    const settings = await this.settings();
    const provider = settings.providers.find((p) => p.id === settings.active);
    if (!provider) throw new Error('No model is set up: add a provider in Settings.');
    return this.opened(provider, undefined);
  }

  /**
   * A provider as the form describes it, not saved, with a key for one call: the one typed, else
   * the one stored for it, else none for a server on this machine. For a connection test.
   */
  async draft(input: ProviderInput): Promise<Provider> {
    const provider = cleanProvider(input);
    const typed = typeof input.key === 'string' && input.key.trim() ? input.key.trim() : undefined;
    if (!typed && !isLocal(provider.baseUrl) && !(await this.keys())[provider.id]) throw new Error(`Type ${provider.name}'s key to test it.`);
    return this.opened(provider, typed);
  }

  private async opened(provider: StoredProvider, typed: string | undefined): Promise<Provider> {
    if (typed) return { ...provider, key: typed };
    const sealed = (await this.keys())[provider.id];
    if (sealed) return { ...provider, key: safeStorage.decryptString(Buffer.from(sealed, 'base64')) };
    if (isLocal(provider.baseUrl)) return { ...provider, key: '' };
    throw new Error(`${provider.name} has no key: add one in Settings.`);
  }
}
