// The models dialog, in two panes: the providers down the left (the active one badged), and the
// one selected, or a new one, as a form on the right: a service to start from, its address and
// model, a key, whether the model reads images, a connection test, and save. A key goes to the
// main process and is never shown again; a test uses the one typed, or the one stored. Below the
// providers, the person's own coding agents (ADR 0008), each with where it stands and the one
// thing to do about it: install or update it from its vendor's page, or sign in through it.

import { Check, ExternalLink, KeyRound, Loader, Plus, RefreshCw, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import type {
  AgentModel,
  AgentSettings,
  Agents,
  HarnessState,
  HarnessView,
  ProviderInput,
  ProviderTest,
  Providers,
  ProviderView,
} from '../../shared/api';
import { reason } from './reason';

type Preset = Omit<ProviderInput, 'key'> & { note: string };

/** Where each service is reached. A model left empty is the person's to name: services rename theirs often. */
const PRESETS: Preset[] = [
  { note: 'Messages', name: 'Anthropic', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5', images: true },
  { note: 'Chat Completions', name: 'OpenRouter', protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: '', images: true },
  { note: 'Chat Completions', name: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', images: true },
  { note: 'Chat Completions', name: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', images: false },
  { note: 'Chat Completions', name: 'Gemini', protocol: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: '', images: true },
  { note: 'Messages', name: 'MiniMax', protocol: 'anthropic', baseUrl: 'https://api.minimax.io/anthropic', model: 'MiniMax-M3', images: false },
  { note: 'This computer, no key', name: 'Ollama', protocol: 'openai', baseUrl: 'http://localhost:11434/v1', model: '', images: false },
  { note: 'This computer, no key', name: 'LM Studio', protocol: 'openai', baseUrl: 'http://localhost:1234/v1', model: '', images: false },
  { note: 'Any compatible server', name: 'Custom', protocol: 'openai', baseUrl: 'https://', model: '', images: true },
];

const fromPreset = ({ note: _, ...preset }: Preset): ProviderInput => ({ ...preset, key: '' });
const fromView = (p: ProviderView): ProviderInput => ({ id: p.id, name: p.name, protocol: p.protocol, baseUrl: p.baseUrl, model: p.model, images: p.images, key: '' });

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** What each state of a coding agent is called. */
const STATES: Record<HarnessState, string> = { missing: 'Not installed', old: 'Needs an update', 'signed-out': 'Not signed in', ready: 'Ready' };

type OutsideKind = HarnessView['kind'];

/** The models a coding agent offers, asked of it when shown: null while it is asked, empty when it could not say. */
export function useAgentModels(kind: OutsideKind | null): { models: AgentModel[] | null; error: string | null } {
  const [found, setFound] = useState<{ kind: OutsideKind; models: AgentModel[]; error: string | null } | null>(null);
  useEffect(() => {
    if (!kind) return;
    let live = true;
    window.studio.agentModels(kind).then(
      (models) => live && setFound({ kind, models, error: null }),
      (e) => live && setFound({ kind, models: [], error: reason(e) }),
    );
    return () => {
      live = false;
    };
  }, [kind]);
  return found && found.kind === kind ? found : { models: null, error: null };
}

/** The efforts a model takes; for the agent's own default model, any its models take. */
const effortsOf = (models: AgentModel[], model: string) =>
  models.find((m) => m.id === model)?.efforts ?? [...new Set(models.flatMap((m) => m.efforts))];

/**
 * A coding agent's model and effort. Claude Code takes a full model name as well as its aliases, so in Models
 * (`freeModel`) its model is typed, with the aliases offered.
 */
export function ModelEffort({
  kind,
  models,
  value,
  onChange,
  freeModel = false,
}: {
  kind: OutsideKind;
  models: AgentModel[];
  value: { model: string; effort: string };
  onChange(change: { model?: string; effort?: string }): void;
  freeModel?: boolean;
}) {
  const own = kind === 'claude' ? 'Claude Code' : 'Codex';
  const efforts = effortsOf(models, value.model);
  return (
    <>
      <label>
        Model
        {freeModel ? (
          <>
            <input
              type="text"
              className="mono"
              list={`${kind}-models`}
              value={value.model}
              placeholder={`${own}'s default`}
              onChange={(e) => onChange({ model: e.target.value })}
            />
            <datalist id={`${kind}-models`}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </datalist>
          </>
        ) : (
          <select value={value.model} onChange={(e) => onChange({ model: e.target.value })}>
            <option value="">Default</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            {value.model && !models.some((m) => m.id === value.model) && <option value={value.model}>{value.model}</option>}
          </select>
        )}
      </label>
      <label>
        Effort
        <select value={value.effort} onChange={(e) => onChange({ effort: e.target.value })}>
          <option value="">Default</option>
          {efforts.map((effort) => (
            <option key={effort} value={effort}>
              {effort}
            </option>
          ))}
          {value.effort && !efforts.includes(value.effort) && <option value={value.effort}>{value.effort}</option>}
        </select>
      </label>
    </>
  );
}

/** How a ready coding agent runs: its model and effort, and for Claude Code its fallback model and cap per turn. */
function AgentSettingsFields<K extends OutsideKind>({
  kind,
  value,
  onChange,
}: {
  kind: K;
  value: AgentSettings[K];
  onChange(next: AgentSettings[K]): void;
}) {
  const { models, error } = useAgentModels(kind);
  const claude = kind === 'claude' ? (value as AgentSettings['claude']) : null;
  return (
    <div className="fields">
      <ModelEffort kind={kind} models={models ?? []} value={value} freeModel={kind === 'claude'} onChange={(change) => onChange({ ...value, ...change })} />
      {claude && (
        <>
          <label>
            Fallback model
            <input
              type="text"
              className="mono"
              list="claude-models"
              value={claude.fallbackModel}
              placeholder="None"
              onChange={(e) => onChange({ ...claude, fallbackModel: e.target.value } as AgentSettings[K])}
            />
            <span className="hint">When its own model is overloaded.</span>
          </label>
          <label>
            Cap per turn, US$
            <input
              type="number"
              min="0.01"
              step="0.5"
              value={claude.budgetUsd ?? ''}
              placeholder="No cap"
              onChange={(e) => onChange({ ...claude, budgetUsd: e.target.value === '' ? null : Number(e.target.value) } as AgentSettings[K])}
            />
            <span className="hint">A turn stops when it has spent this much.</span>
          </label>
        </>
      )}
      {error && <p className="hint wide">{error}</p>}
    </div>
  );
}

/** One of the person's own coding agents: where it stands, the one thing to do about it, and, ready, how it runs. */
function AgentPane({
  harness,
  settings,
  onAgents,
  onClose,
}: {
  harness: HarnessView;
  settings: AgentSettings;
  onAgents(agents: Agents): void;
  onClose(): void;
}) {
  const [busy, setBusy] = useState<'checking' | 'signing-in' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(settings[harness.kind]);
  const [saved, setSaved] = useState(false);
  async function act(kind: 'checking' | 'signing-in' | 'saving') {
    setBusy(kind);
    setError(null);
    setSaved(false);
    try {
      onAgents(
        kind === 'signing-in'
          ? await window.studio.signInAgent(harness.kind)
          : kind === 'saving'
            ? await window.studio.saveAgentSettings(harness.kind, draft)
            : await window.studio.agents(),
      );
      if (kind === 'saving') setSaved(true);
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="provider-form agent-pane">
      <div className="panel-head">
        <h2>{harness.name}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <p className={`agent-state ${harness.state}`}>
        <strong>{STATES[harness.state]}</strong>
        {harness.version && <span className="mono">{harness.version}</span>}
      </p>
      <p className="note">
        {harness.state === 'ready'
          ? `Your own ${harness.name}, on its own sign-in and plan. Pick it for a project at the top of the assistant; the Studio gives it the film's tools and asks you before it goes beyond its sandbox.`
          : harness.state === 'signed-out'
            ? harness.kind === 'codex'
              ? `${harness.name} is installed. Sign in through it: your browser opens its sign-in, and the Studio never sees your account's credentials.`
              : `${harness.name} is installed. ${harness.hint ?? ''}: it signs in on its own, and the Studio never sees your account's credentials.`
            : `${harness.hint ?? ''}. The Studio looks for it where its installer puts it, never in a project.`}
      </p>
      {harness.state === 'ready' && (
        <AgentSettingsFields
          kind={harness.kind}
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setSaved(false);
          }}
        />
      )}
      {busy === 'signing-in' && <p className="note">Finish signing in in your browser; this waits for it.</p>}
      {saved && (
        <p className="test good" role="status">
          {harness.kind === 'claude' ? 'Saved. Claude Code starts on it at your next message, in the same conversation.' : 'Saved. Codex runs on it from your next message.'}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <span className="spacer" />
        <button type="button" className="button" disabled={busy !== null} onClick={() => void act('checking')}>
          {busy === 'checking' ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />}
          Check again
        </button>
        {harness.link && (harness.state === 'missing' || harness.state === 'old') && (
          <a className="button primary" href={harness.link} target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
            {harness.state === 'old' ? 'Update' : 'Install'} {harness.name}
          </a>
        )}
        {harness.state === 'signed-out' && harness.kind === 'codex' && (
          <button type="button" className="button primary" disabled={busy !== null} onClick={() => void act('signing-in')}>
            {busy === 'signing-in' && <Loader size={14} className="spin" />}
            Sign in
          </button>
        )}
        {harness.state === 'ready' && (
          <button type="button" className="button primary" disabled={busy !== null} onClick={() => void act('saving')}>
            {busy === 'saving' && <Loader size={14} className="spin" />}
            Save
          </button>
        )}
      </div>
    </div>
  );
}

export function Settings({
  providers,
  agent,
  onChange,
  onClose,
}: {
  providers: Providers;
  /** The coding agent to open Models on, rather than the providers. */
  agent?: OutsideKind;
  onChange(p: Providers): void;
  onClose(): void;
}) {
  /** The person's own coding agents, and which one is open in the right pane, if any. */
  const [agents, setAgents] = useState<Agents | null>(null);
  const [shown, setShown] = useState<OutsideKind | null>(agent ?? null);
  useEffect(() => {
    let live = true;
    window.studio.agents().then(
      (found) => live && setAgents(found),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  const harness = agents?.harnesses.find((h) => h.kind === shown);
  const first = providers.providers.find((p) => p.id === providers.active) ?? providers.providers[0];
  const [form, setForm] = useState<ProviderInput>(first ? fromView(first) : fromPreset(PRESETS[0]!));
  const [preset, setPreset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<ProviderTest | 'testing' | null>(null);

  function select(next: ProviderInput) {
    setShown(null);
    setForm(next);
    setError(null);
    setTest(null);
  }

  function edit(change: Partial<ProviderInput>) {
    setForm((f) => ({ ...f, ...change }));
    setTest(null);
  }

  async function run(action: () => Promise<Providers>): Promise<Providers | null> {
    setError(null);
    try {
      const next = await action();
      onChange(next);
      return next;
    } catch (e) {
      setError(reason(e));
      return null;
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const before = new Set(providers.providers.map((p) => p.id));
    const next = await run(() => window.studio.saveProvider(form));
    // a new provider is the one id that was not there before; keep it selected, its key now stored
    const saved = next?.providers.find((p) => (form.id ? p.id === form.id : !before.has(p.id)));
    if (saved) setForm(fromView(saved));
  }

  async function remove(id: string) {
    const next = await run(() => window.studio.removeProvider(id));
    if (next) {
      const other = next.providers.find((p) => p.id === next.active) ?? next.providers[0];
      select(other ? fromView(other) : fromPreset(PRESETS[0]!));
    }
  }

  async function testConnection() {
    setError(null);
    setTest('testing');
    try {
      setTest(await window.studio.testProvider(form));
    } catch (e) {
      setTest({ ok: false, error: reason(e) });
    }
  }

  const stored = providers.providers.find((p) => p.id === form.id);

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="dialog models" role="dialog" aria-modal="true" aria-label="Models" onClick={(e) => e.stopPropagation()}>
        <div className="models-list">
          <h2>Models</h2>
          <p className="note">The agent runs on the one marked. Keys stay in this computer's keychain.</p>
          <ul>
            {providers.providers.map((p) => (
              <li key={p.id}>
                <button type="button" className={`provider-row${p.id === form.id && !shown ? ' selected' : ''}`} onClick={() => select(fromView(p))}>
                  <span className="avatar" aria-hidden="true">
                    {initials(p.name)}
                  </span>
                  <span className="who">
                    <strong>{p.name}</strong>
                    <span className="mono">{p.ready ? p.model : `${p.model} · no key`}</span>
                  </span>
                  {p.id === providers.active && <span className="badge">Active</span>}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`provider-row add${form.id || shown ? '' : ' selected'}`}
            onClick={() => {
              setPreset(0);
              select(fromPreset(PRESETS[0]!));
            }}
          >
            <Plus size={14} /> Add a provider
          </button>
          <h3 className="label agents-label">Your coding agents</h3>
          <p className="note">An agent you already use, on its own sign-in and plan.</p>
          {!agents ? (
            <p className="note">
              <Loader size={12} className="spin" /> Looking for them…
            </p>
          ) : (
            <ul>
              {agents.harnesses.map((h) => (
                <li key={h.kind}>
                  <button type="button" className={`provider-row${shown === h.kind ? ' selected' : ''}`} onClick={() => setShown(h.kind)}>
                    <span className="avatar" aria-hidden="true">
                      {initials(h.name)}
                    </span>
                    <span className="who">
                      <strong>{h.name}</strong>
                      <span className="mono">{h.version ? `${STATES[h.state]} · ${h.version}` : STATES[h.state]}</span>
                    </span>
                    <span className={`state-dot ${h.state}`} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {harness ? (
          <AgentPane key={harness.kind} harness={harness} settings={agents!.settings} onAgents={setAgents} onClose={onClose} />
        ) : (
        <form className="provider-form" onSubmit={save}>
          <div className="panel-head">
            <h2>{stored ? stored.name : 'Add a provider'}</h2>
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
          {providers.weakKeyStorage && (
            <p className="error">This system has no keychain, so keys are kept with a fixed secret any program on it could open.</p>
          )}

          {!form.id && (
            <fieldset className="presets">
              <legend className="label">Service</legend>
              {PRESETS.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  className={`preset${i === preset ? ' selected' : ''}`}
                  aria-pressed={i === preset}
                  onClick={() => {
                    setPreset(i);
                    select({ ...fromPreset(p), key: form.key });
                  }}
                >
                  <strong>{p.name}</strong>
                  <span>{p.note}</span>
                </button>
              ))}
            </fieldset>
          )}

          <div className="fields">
            <label>
              Name
              <input type="text" value={form.name} onChange={(e) => edit({ name: e.target.value })} />
            </label>
            <label>
              Protocol
              <select value={form.protocol} onChange={(e) => edit({ protocol: e.target.value as ProviderInput['protocol'] })}>
                <option value="anthropic">Anthropic Messages</option>
                <option value="openai">OpenAI Chat Completions</option>
              </select>
            </label>
            <label className="wide">
              Address{form.protocol === 'openai' ? ' (before /chat/completions)' : ''}
              <input type="text" className="mono" value={form.baseUrl} onChange={(e) => edit({ baseUrl: e.target.value })} />
            </label>
            <label className="wide">
              Model
              <input type="text" className="mono" value={form.model} placeholder="The model's id at this service" onChange={(e) => edit({ model: e.target.value })} />
            </label>
            <label className="wide">
              Key
              <input
                type="password"
                value={form.key}
                autoComplete="off"
                placeholder={stored?.hasKey ? 'Stored: leave empty to keep it' : 'None for a server on this computer'}
                onChange={(e) => edit({ key: e.target.value })}
              />
              <span className="hint">
                <KeyRound size={12} /> Sealed with this computer's keychain. The Studio never shows it again.
              </span>
            </label>
            <label className="check wide">
              <input type="checkbox" checked={form.images} onChange={(e) => edit({ images: e.target.checked })} />
              The model reads images: the agent sees its stills and your marks as pictures
            </label>
          </div>

          {test && test !== 'testing' && (
            <p className={test.ok ? 'test good' : 'test bad'} role="status">
              {test.ok
                ? `Connected: ${form.model} answered${test.calledTool ? ' and called a tool' : ', but did not call a tool, which the agent needs'} in ${(test.ms / 1000).toFixed(1)} s.`
                : test.error}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <div className="actions">
            {stored && (
              <button type="button" className="quiet" onClick={() => void remove(stored.id)}>
                Remove
              </button>
            )}
            {stored && stored.id !== providers.active && (
              <button type="button" className="quiet" onClick={() => void run(() => window.studio.activateProvider(stored.id))}>
                <Check size={14} /> Use this one
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="button" onClick={testConnection} disabled={test === 'testing'}>
              {test === 'testing' && <Loader size={14} className="spin" />}
              Test connection
            </button>
            <button type="submit" className="button primary">
              Save
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
