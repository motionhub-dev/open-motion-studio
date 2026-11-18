// Settings, a page over Home or the editor: General (theme, language, launch at login), the model providers, the
// person's own coding agents (ADR 0008), the voice providers (ADR 0012), the workspace and diagnostics.
// Provider secrets remain in the main process and are never read back.

import { SystemMessage, Translated, usePreferences } from './preferences';
import { Select } from './select';
import { ArrowLeft, Check, ExternalLink, Folder, KeyRound, Loader, Plus, RefreshCw, Volume2 } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
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
  VoiceChoice,
  VoiceInput,
  VoiceKind,
  VoiceView,
  WorkspaceSettings,
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

/** How each voice provider is set up: where its key is, what else it needs, and its default model. */
const VOICE_GUIDES: Record<VoiceKind, { name: string; steps: string[]; link: string; linkLabel: string; model: string }> = {
  azure: {
    name: 'Azure',
    steps: [
      'In the Azure portal, create a Speech resource. Its free tier speaks a monthly allowance at no cost.',
      'Open the resource’s Keys and Endpoint page: copy Key 1, and its Location, as eastasia.',
    ],
    link: 'https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices',
    linkLabel: 'Create a Speech resource',
    model: '',
  },
  elevenlabs: {
    name: 'ElevenLabs',
    steps: ['Sign in to ElevenLabs; its free plan speaks a monthly allowance.', 'Under API Keys, create a key with Text to Speech and Voices allowed.'],
    link: 'https://elevenlabs.io/app/settings/api-keys',
    linkLabel: 'Open API Keys',
    model: 'eleven_multilingual_v2',
  },
  minimax: {
    name: 'MiniMax',
    steps: [
      'Sign in to MiniMax’s platform: minimax.io, or minimaxi.com in mainland China. Pick the same site below.',
      'Create a key under API Keys. Group id is optional; leave it empty unless your account needs it.',
    ],
    link: 'https://www.minimax.io/platform/user-center/basic-information/interface-key',
    linkLabel: 'Open MiniMax’s keys',
    model: 'speech-2.8-hd',
  },
  openai: {
    name: 'OpenAI',
    steps: [
      'Already have an OpenAI key? Paste it: it speaks, and one transcription of each line gives its words’ times.',
      'Otherwise create one under API keys.',
    ],
    link: 'https://platform.openai.com/api-keys',
    linkLabel: 'Open API keys',
    model: 'gpt-4o-mini-tts',
  },
};

const VOICE_KINDS = Object.keys(VOICE_GUIDES) as VoiceKind[];
const SAMPLE = { zh: '热量从高处流向低处，除非你推它一把。', en: 'Heat moves downhill, unless you push it.' };

/** A voice provider: how to get its key, the key and what else it needs, a voice to hear, and what a film writes for it. */
function VoicePane({
  kind,
  view,
  onVoices,
}: {
  kind: VoiceKind;
  view: VoiceView | undefined;
  onVoices(voices: VoiceView[]): void;
  onClose(): void;
}) {
  const { t: tr } = usePreferences();
  const guide = VOICE_GUIDES[kind];
  const [draft, setDraft] = useState<VoiceInput>({
    kind,
    region: view?.region ?? (kind === 'minimax' ? 'global' : ''),
    groupId: view?.groupId ?? '',
    model: view?.model ?? '',
    key: '',
  });
  const [choices, setChoices] = useState<VoiceChoice[] | null>(null);
  const [voice, setVoice] = useState(view?.voiceId ?? '');
  const [sample, setSample] = useState<string | null>(null);
  const [busy, setBusy] = useState<'saving' | 'listing' | 'speaking' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const edit = (change: Partial<VoiceInput>) => {
    setDraft((d) => ({ ...d, ...change }));
  };
  async function act<T>(what: 'saving' | 'listing' | 'speaking', work: () => Promise<T>): Promise<T | null> {
    setBusy(what);
    setError(null);
    try {
      return await work();
    } catch (e) {
      setError(reason(e));
      return null;
    } finally {
      setBusy(null);
    }
  }
  const chosen = choices?.find((c) => c.id === voice);
  const sampleText = (chosen?.language ?? voice).toLowerCase().startsWith('zh') ? SAMPLE.zh : SAMPLE.en;
  return (
    <div className="provider-form agent-pane voice-pane">
      <div className="panel-head">
        <h2>{guide.name}</h2>

      </div>
      <p className="note">{tr("Speaks a film’s lines into the project’s voice/, kept with the film; a line is spoken again only when its words change.")}</p>
      <ol className="guide">
        {guide.steps.map((step) => (
          <li key={step}>{tr(step)}</li>
        ))}
      </ol>
      <div className="fields">
        {kind === 'azure' && (
          <label>
            <Translated text="Region" />
            <input type="text" className="mono" value={draft.region ?? ''} placeholder="eastasia" onChange={(e) => edit({ region: e.target.value })} />
          </label>
        )}
        {kind === 'minimax' && (
          <>
            <label>
              {tr("Site")}
              <Select
                aria-label={tr('Region')}
                value={draft.region ?? 'global'}
                onValueChange={(region) => edit({ region })}
                options={[
                  { value: 'global', label: 'minimax.io' },
                  { value: 'china', label: tr('minimaxi.com (mainland China)') },
                ]}
              />
            </label>
            <label>
              {tr("Group id (optional)")}
              <input type="text" className="mono" value={draft.groupId ?? ''} onChange={(e) => edit({ groupId: e.target.value })} />
            </label>
          </>
        )}
        {guide.model && (
          <label>
            <Translated text="Model" />
            <input type="text" className="mono" value={draft.model ?? ''} placeholder={guide.model} onChange={(e) => edit({ model: e.target.value })} />
          </label>
        )}
        <label className="wide">
          <Translated text="Key" />
          <input
            type="password"
            value={draft.key ?? ''}
            autoComplete="off"
            placeholder={view?.hasKey ? tr("Stored: leave empty to keep it") : tr("Your {0} key", {0: guide.name})}
            onChange={(e) => edit({ key: e.target.value })}
          />
          <span className="hint">
            <KeyRound size={12} /> {tr("Sealed with this computer’s keychain. The Studio never shows it again.")}
          </span>
        </label>
        <label className="wide">
          <Translated text="Voice" />
          <span className="voice-pick">
            <Select
              editable
              aria-label={tr('Voice')}
              className="mono"
              value={voice}
              placeholder={choices ? tr('{0} voices: type to search', { 0: choices.length }) : tr('List the voices first')}
              options={(choices ?? []).map((c) => ({ value: c.id, label: c.language ? `${c.name} · ${c.language}` : c.name }))}
              onValueChange={(next) => {
                setVoice(next);
                setSample(null);
              }}
            />
            <button
              type="button"
              className="button"
              disabled={busy !== null}
              onClick={() => void act('listing', () => window.studio.voiceChoices(draft)).then((found) => found && setChoices(found))}
            >
              {busy === 'listing' && <Loader size={14} className="spin" />}
              {tr("List voices")}
            </button>
          </span>

        </label>
      </div>
      {voice && (
        <div className="voice-sample">
          <button
            type="button"
            className="button"
            disabled={busy !== null}
            onClick={() => void act('speaking', () => window.studio.sampleVoice(draft, voice, sampleText)).then((url) => url && setSample(url))}
          >
            {busy === 'speaking' ? <Loader size={14} className="spin" /> : <Volume2 size={14} />}
            {tr("Hear it")}
          </button>
          {sample && <audio src={sample} controls autoPlay />}
          <p className="hint">
            {tr("Save this voice, then generate the film’s narration from Voice in the top bar.")}
          </p>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          <SystemMessage text={error} error />
        </p>
      )}
      <div className="actions">
        {view && (
          <button
            type="button"
            className="quiet"
            disabled={busy !== null}
            onClick={() => void act('saving', () => window.studio.removeVoice(kind)).then((next) => next && onVoices(next))}
          >
            <Translated text="Remove" />
          </button>
        )}
        <a className="button" href={guide.link} target="_blank" rel="noreferrer">
          <ExternalLink size={14} />
          {tr(guide.linkLabel)}
        </a>
        <span className="spacer" />
        <button
          type="button"
          className="button primary"
          data-action="save"
          disabled={busy !== null}
          onClick={() =>
            void act('saving', () => window.studio.saveVoice({ ...draft, voiceId: voice.trim() })).then((next) => {
              if (!next) return;
              setDraft(d => ({ ...d, key: '' }));
              onVoices(next);

            })
          }
        >
          {busy === 'saving' && <Loader size={14} className="spin" />}
          {tr("Save")}
        </button>
      </div>
    </div>
  );
}

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
  const { t, t: tr } = usePreferences();
  const own = kind === 'claude' ? 'Claude Code' : 'Codex';
  const efforts = effortsOf(models, value.model);
  return (
    <>
      <label>
        {tr("Model")}
        <Select aria-label={tr("Model")} editable={freeModel} className={freeModel ? 'mono' : ''} value={value.model} placeholder={tr("{0}'s default", {0: own})} onValueChange={model => onChange({ model })} options={[
          { value: '', label: t('Default') },
          ...models.map(model => ({ value: model.id, label: model.name })),
          ...(value.model && !models.some(model => model.id === value.model) ? [{ value: value.model, label: value.model }] : []),
        ]} />
      </label>
      <label>
        <Translated text="Effort" />
        <Select aria-label={t('Effort')} value={value.effort} onValueChange={effort => onChange({ effort })} options={[
          { value: '', label: t('Default') },
          ...efforts.map(effort => ({ value: effort, label: tr(effort) })),
          ...(value.effort && !efforts.includes(value.effort) ? [{ value: value.effort, label: value.effort }] : []),
        ]} />
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
  const { t: tr } = usePreferences();
  const { models, error } = useAgentModels(kind);
  const claude = kind === 'claude' ? (value as AgentSettings['claude']) : null;
  return (
    <div className="fields">
      <ModelEffort kind={kind} models={models ?? []} value={value} freeModel={kind === 'claude'} onChange={(change) => onChange({ ...value, ...change })} />
      {claude && (
        <>
          <label>
            <Translated text="Fallback model" />
            <input
              type="text"
              className="mono"
              list="claude-models"
              value={claude.fallbackModel}
              placeholder={tr("None")}
              onChange={(e) => onChange({ ...claude, fallbackModel: e.target.value } as AgentSettings[K])}
            />
            <span className="hint">{tr("When its own model is overloaded.")}</span>
          </label>
          <label>
            {tr("Cap per turn, US$")}
            <input
              type="number"
              min="0.01"
              step="0.5"
              value={claude.budgetUsd ?? ''}
              placeholder={tr("No cap")}
              onChange={(e) => onChange({ ...claude, budgetUsd: e.target.value === '' ? null : Number(e.target.value) } as AgentSettings[K])}
            />
            <span className="hint">{tr("A turn stops when it has spent this much.")}</span>
          </label>
        </>
      )}
      {error && <p className="hint wide"><SystemMessage text={error} error /></p>}
    </div>
  );
}

/** One of the person's own coding agents: where it stands, the one thing to do about it, and, ready, how it runs. */
function AgentPane({
  onSaved,
  harness,
  settings,
  onAgents,
}: {
  harness: HarnessView;
  settings: AgentSettings;
  onSaved(): void;
  onAgents(agents: Agents): void;
  onClose(): void;
}) {
  const { t: tr } = usePreferences();
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
      if (kind === 'saving') { setSaved(true); onSaved(); }
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

      </div>
      <p className={`agent-state ${harness.state}`}>
        <strong>{tr(STATES[harness.state])}</strong>
        {harness.version && <span className="mono">{harness.version}</span>}
      </p>
      <p className="note">
        {harness.state === 'ready'
          ? tr("Your own {0}, on its own sign-in and plan. Pick it for a project at the top of the assistant; the Studio gives it the film's tools and asks you before it goes beyond its sandbox.", {0: harness.name})
          : harness.state === 'signed-out'
            ? harness.kind === 'codex'
              ? tr("{0} is installed. Sign in through it: your browser opens its sign-in, and the Studio never sees your account's credentials.", {0: harness.name})
              : tr("{0} is installed. {1}: it signs in on its own, and the Studio never sees your account's credentials.", {0: harness.name, 1: tr(harness.hint ?? '')})
            : tr("{0}. The Studio looks for it where its installer puts it, never in a project.", {0: tr(harness.hint ?? '')})}
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
      {busy === 'signing-in' && <p className="note">{tr("Finish signing in in your browser; this waits for it.")}</p>}
      {saved && (
        <p className="test good" role="status">
          {harness.kind === 'claude' ? tr("Saved. Claude Code starts on it at your next message, in the same conversation.") : tr("Saved. Codex runs on it from your next message.")}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          <SystemMessage text={error} error />
        </p>
      )}
      <div className="actions">
        <span className="spacer" />
        <button type="button" className="button" disabled={busy !== null} onClick={() => void act('checking')}>
          {busy === 'checking' ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />}
          {tr("Check again")}
        </button>
        {harness.link && (harness.state === 'missing' || harness.state === 'old') && (
          <a className="button primary" href={harness.link} target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
            {harness.state === 'old' ? tr("Update") : tr("Install")} {harness.name}
          </a>
        )}
        {harness.state === 'signed-out' && harness.kind === 'codex' && (
          <button type="button" className="button primary" disabled={busy !== null} onClick={() => void act('signing-in')}>
            {busy === 'signing-in' && <Loader size={14} className="spin" />}
            {tr("Sign in")}
          </button>
        )}
        {harness.state === 'ready' && (
          <button type="button" className="button primary" disabled={busy !== null} data-action="save" onClick={() => void act('saving')}>
            {busy === 'saving' && <Loader size={14} className="spin" />}
            {tr("Save")}
          </button>
        )}
      </div>
    </div>
  );
}

function WorkspacePane() {
  const { t: tr } = usePreferences();
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    window.studio.workspace().then(setWorkspace, (e) => setError(reason(e)));
  }, []);
  async function choose() {
    setBusy(true);
    setError(null);
    try {
      const next = await window.studio.chooseWorkspace();
      if (next) setWorkspace(next);
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="provider-form agent-pane workspace-pane">
      <div className="panel-head">
        <h2><Translated text="Workspace" /></h2>

      </div>
      <p className="note"><Translated text="New films and copies of templates get their own folders here." /></p>
      <div className="fields">
        <label className="wide">
          <Translated text="Default workspace" />
          <input type="text" className="mono" readOnly aria-label={tr("Default workspace")} value={workspace?.path ?? ''} placeholder={tr("Loading…")} title={workspace?.path} />
        </label>
      </div>
      <div className="actions">
        <button type="button" className="button" disabled={busy} onClick={() => void choose()}>
          {busy ? <Loader size={14} className="spin" /> : <Folder size={14} />} {tr("Change folder")}
        </button>
      </div>
      <p className="note"><Translated text="Changes are saved immediately and apply to new projects. Existing projects stay where they are." /></p>
      {error && <p className="error" role="alert"><SystemMessage text={error} error /></p>}

    </div>
  );
}

/** The app-wide preferences: each choice is saved the moment it is made and applies to every window. */
function GeneralPane() {
  const { preferences, ready, save, t } = usePreferences();
  const [startup, setStartup] = useState<{ supported: boolean; enabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let live = true;
    const refresh = () =>
      window.studio.systemStartup().then(
        (next) => live && setStartup(next),
        (e) => live && setError(reason(e)),
      );
    void refresh();
    const stop = window.studio.onPreferencesChanged(() => void refresh());
    window.addEventListener('focus', refresh);
    return () => {
      live = false;
      stop();
      window.removeEventListener('focus', refresh);
    };
  }, []);
  async function update(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await work();
      setSaved(true);
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="provider-form general-settings" aria-labelledby="general-heading">
      <h2 id="general-heading">{t('General')}</h2>
      <p className="note">{t('Preferences apply to all OpenMotionStudio windows and are saved immediately.')}</p>
      <label className="preference-row">
        <span>
          <strong>{t('Theme')}</strong>
          <span className="note">{t('Choose how OpenMotionStudio looks.')}</span>
        </span>
        <Select
          aria-label={t('Theme')}
          disabled={!ready || busy}
          value={preferences.theme}
          onValueChange={(theme) => void update(() => save({ theme: theme as typeof preferences.theme }))}
          options={[
            { value: 'system', label: t('Follow system') },
            { value: 'light', label: t('Light') },
            { value: 'dark', label: t('Dark') },
          ]}
        />
      </label>
      <label className="preference-row">
        <span>
          <strong>{t('Language')}</strong>
          <span className="note">{t('Interface language. Film content and model responses are not changed.')}</span>
        </span>
        <Select
          aria-label={t('Language')}
          disabled={!ready || busy}
          value={preferences.language}
          onValueChange={(language) => void update(() => save({ language: language as typeof preferences.language }))}
          options={[
            { value: 'system', label: t('Follow system') },
            { value: 'en', label: 'English' },
            { value: 'zh-CN', label: '简体中文' },
          ]}
        />
      </label>
      <label className="preference-row">
        <span>
          <strong>{t('Launch at login')}</strong>
          <span className="note">{t('Automatically start OpenMotionStudio when you sign in to your computer.')}</span>
          {startup && !startup.supported && <span className="note">{t('Available in installed Windows and macOS builds.')}</span>}
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          aria-label={t('Launch at login')}
          checked={startup?.enabled ?? false}
          disabled={!startup?.supported || busy}
          onChange={(event) => {
            const enabled = event.target.checked;
            void update(async () => setStartup(await window.studio.setSystemStartup(enabled)));
          }}
        />
      </label>
      {busy && <p role="status">{t('Saving…')}</p>}
      {saved && (
        <p role="status" className="test good">
          {t('Settings saved.')}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          <SystemMessage text={error} error />
        </p>
      )}
    </section>
  );
}

/** Settings' sections, in the order a sidebar lists them. */
export const SETTINGS_SECTIONS = [
  ['general', 'General'],
  ['models', 'Model Providers'],
  ['agents', 'Coding Agents'],
  ['voices', 'Voice Services'],
  ['diagnostics', 'Diagnostics'],
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number][0];

export function Settings({
  providers,
  agent,
  voice,
  workspace,
  models,
  embedded,
  back = false,
  onChange,
  onClose,
}: {
  providers: Providers;
  /** The coding agent to open Models on, rather than the providers. */
  agent?: OutsideKind;
  /** The voice provider to open Models on. */
  voice?: VoiceKind;
  workspace?: boolean;
  models?: boolean;
  /**
   * The section shown when Settings is one of Home's pages: no header or sidebar of its own, Home's sidebar choosing
   * the section, and leaving by that sidebar asking first about unsaved edits, as leaving by its own would.
   */
  embedded?: SettingsSection;
  /** Within Home, opened from something the person was doing (a setup step, Ctrl/⌘ ,), so it offers the way back. */
  back?: boolean;
  onChange(p: Providers): void;
  onClose(): void;
}) {
  const { t, t: tr } = usePreferences();
  const page = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const continuation = useRef<(() => void) | null>(null);
  const [pending, setPending] = useState<HTMLElement | null>(null);
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => window.studio.onSettingsChanged(external => {
    if (external) {
      setNotice("Settings changed in another window. Your input has been kept. Reload to use the latest settings.");
    }
  }), []);
  function markSaved() {
    dirty.current = false;
    setNotice("Settings saved.");
    continuation.current?.();
    continuation.current = null;
  }
  useEffect(() => {
    if (embedded) return () => { continuation.current = null; };
    const previous = document.activeElement as HTMLElement | null;
    // The heading, not the back button: a screen reader hears where it is, and no focus ring greets a click.
    page.current?.querySelector<HTMLElement>('.settings-header h1')?.focus();
    return () => { continuation.current = null; previous?.focus(); };
  }, []);
  // Within Home, its sidebar and header lead away: a click there with edits unsaved is held, as one on the sidebar here is.
  useEffect(() => {
    if (!embedded) return;
    const hold = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('.home-nav button, .home-header button');
      if (!target || !dirty.current || page.current?.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(target);
    };
    document.addEventListener('click', hold, true);
    return () => document.removeEventListener('click', hold, true);
  }, [!!embedded]);
  function continueNavigation(target: HTMLElement) {
    dirty.current = false;
    setPending(null);
    target.click();
  }
  /** The person's own coding agents, and which one is open in the right pane, if any. */
  const [agents, setAgents] = useState<Agents | null>(null);
  const [shown, setShown] = useState<OutsideKind | null>(agent ?? null);
  /** The voice providers set up, and which one is open in the right pane, if any. */
  const [voices, setVoices] = useState<VoiceView[] | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceShown, setVoiceShown] = useState<VoiceKind | null>(voice ?? null);
  const [section, setSection] = useState<SettingsSection>(
    embedded ?? (agent ? 'agents' : voice ? 'voices' : models ? 'models' : 'general'),
  );
  // Asked for the workspace, General opens on it: its pane is the last of General's.
  useEffect(() => {
    if (workspace) page.current?.querySelector('.workspace-pane')?.scrollIntoView({ block: 'start' });
  }, []);
  useEffect(() => {
    let live = true;
    window.studio.agents().then(
      (found) => live && setAgents(found),
      () => undefined,
    );
    window.studio.voices().then(
      (found) => live && setVoices(found),
      (e) => live && setVoiceError(reason(e)),
    );
    return () => {
      live = false;
    };
  }, [reload]);
  const harness = agents?.harnesses.find((h) => h.kind === shown) ?? (section === 'agents' ? agents?.harnesses[0] : undefined);
  const first = providers.providers.find((p) => p.id === providers.active) ?? providers.providers[0];
  const [form, setForm] = useState<ProviderInput>(first ? fromView(first) : fromPreset(PRESETS[0]!));
  const [preset, setPreset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<ProviderTest | 'testing' | null>(null);

  function select(next: ProviderInput) {
    setShown(null);
    setVoiceShown(null);
    setConfirmRemove(false);
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
    if (saved) { setForm(fromView(saved)); markSaved(); }
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
  const sections = SETTINGS_SECTIONS;

  function open(id: SettingsSection) {
    setSection(id);
    setShown(id === 'agents' ? (agents?.harnesses[0]?.kind ?? null) : null);
    setVoiceShown(id === 'voices' ? VOICE_KINDS[0]! : null);
  }

  // Home's sidebar chooses the section of Settings within it.
  useEffect(() => {
    if (embedded && embedded !== section) open(embedded);
  }, [embedded]);

  function saveAndContinue(target: HTMLElement) {
    const buttons = Array.from(page.current?.querySelectorAll<HTMLButtonElement>('.provider-form button') ?? []);
    const saveButton = buttons.find((button) => button.dataset.action === 'save');
    if (saveButton && !saveButton.disabled) {
      continuation.current = () => continueNavigation(target);
      saveButton.click();
    }
  }

  function discardAndContinue(target: HTMLElement) {
    const saved = providers.providers.find((p) => p.id === form.id);
    setForm(saved ? fromView(saved) : fromPreset(PRESETS[0]!));
    setReload((n) => n + 1);
    continueNavigation(target);
  }

  function reloadSettings() {
    dirty.current = false;
    setReload((n) => n + 1);
    setNotice('');
    const current = providers.providers.find((p) => p.id === form.id);
    if (current) setForm(fromView(current));
  }

  return (
    <div
      className={`studio-settings${embedded ? ' embedded' : ''}`}
      ref={page}
      onInputCapture={() => {
        if (section === 'general') return;
        dirty.current = true;
        setNotice('');
      }}
      onClickCapture={(event) => {
        // Leaving a form with edits asks first: the click is held until the person chooses.
        const target = (event.target as HTMLElement).closest<HTMLElement>('.settings-nav button, .settings-services button, .settings-header button');
        if (target && dirty.current) {
          event.preventDefault();
          event.stopPropagation();
          setPending(target);
        }
      }}
    >
      {/* Within Home each pane's own heading names the page: the head holds only the way back, when there is one. */}
      {(!embedded || back) && (
        <header className="settings-header">
          <button type="button" className="icon-button" aria-label={t('Back to previous page')} onClick={onClose}>
            <ArrowLeft size={20} />
          </button>
          {!embedded && <h1 tabIndex={-1}>{t('Settings')}</h1>}
        </header>
      )}
      {pending && (
        <div className="settings-notice" role="alert">
          <span>{t('You have unsaved changes.')}</span>
          <button className="button primary" onClick={() => saveAndContinue(pending)}>
            {t('Save and continue')}
          </button>
          <button className="button" onClick={() => discardAndContinue(pending)}>
            {t('Discard changes')}
          </button>
          <button
            className="quiet"
            onClick={() => {
              setPending(null);
              continuation.current = null;
            }}
          >
            {t('Keep editing')}
          </button>
        </div>
      )}
      {notice && (
        <div className="settings-notice" role="status">
          {t(notice)}
          {notice.startsWith('Settings changed') && (
            <button className="button" onClick={reloadSettings}>
              {t('Reload settings (discard edits)')}
            </button>
          )}
        </div>
      )}
      <div className="settings-layout">
        {!embedded && (
          <nav className="settings-nav" aria-label={t('Settings categories')}>
            {sections.map(([id, label]) => (
              <button
                key={id}
                className={`provider-row${section === id ? ' selected' : ''}`}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => open(id)}
              >
                {t(label)}
              </button>
            ))}
          </nav>
        )}
        <main className="settings-content">
        {section === 'general' ? (
          <>
            <GeneralPane />
            <WorkspacePane key={reload} />
          </>
        ) : section === 'diagnostics' ? (
          <div className="provider-form">
            <h2>{t('Diagnostics')}</h2>
            <p className="note">{t('Local runtime logs help diagnose startup, build and export failures.')}</p>
            <button className="button" onClick={() => window.studio.showLogs().catch((e) => setError(reason(e)))}>
              <Folder size={16} /> {t('Open logs folder')}
            </button>
            {error && (
              <p role="alert" className="error">
                <SystemMessage text={error} error />
              </p>
            )}
          </div>
        ) : <>
        <div className="settings-services">
          {section === 'models' && <>
          <h2><Translated text="Model Providers" /></h2>
          <p className="note"><Translated text="The agent runs on the one marked. Keys stay in this computer's keychain." /></p>
          <ul>
            {providers.providers.map((p) => (
              <li key={p.id}>
                <button type="button" className={`provider-row${p.id === form.id && !shown && !voiceShown ? ' selected' : ''}`} onClick={() => select(fromView(p))}>
                  <span className="avatar" aria-hidden="true">
                    {initials(p.name)}
                  </span>
                  <span className="who">
                    <strong>{p.name}</strong>
                    <span className="mono">{p.ready ? p.model : tr("{0} · no key", {0: p.model})}</span>
                  </span>
                  {p.id === providers.active && <span className="badge"><Translated text="Active" /></span>}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`provider-row add${form.id || shown || voiceShown ? '' : ' selected'}`}
            onClick={() => {
              setPreset(0);
              select(fromPreset(PRESETS[0]!));
            }}
          >
            <Plus size={14} /> <Translated text="Add a provider" />
          </button>
          </>}
          {section === 'agents' && <>
          <h2><Translated text="Coding Agents" /></h2>
          <p className="note"><Translated text="An agent you already use, on its own sign-in and plan." /></p>
          {!agents ? (
            <p className="note">
              <Loader size={12} className="spin" /> <Translated text="Looking for them…" />
            </p>
          ) : (
            <ul>
              {agents.harnesses.map((h) => (
                <li key={h.kind}>
                  <button
                    type="button"
                    className={`provider-row${shown === h.kind ? ' selected' : ''}`}
                    onClick={() => {
                      setVoiceShown(null);
                      setShown(h.kind);
                    }}
                  >
                    <span className="avatar" aria-hidden="true">
                      {initials(h.name)}
                    </span>
                    <span className="who">
                      <strong>{h.name}</strong>
                      <span className="mono">{h.version ? `${tr(STATES[h.state])} · ${h.version}` : tr(STATES[h.state])}</span>
                    </span>
                    <span className={`state-dot ${h.state}`} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          </>}
          {section === 'voices' && <>
          <h2><Translated text="Voice Services" /></h2>
          <p className="note"><Translated text="Speaks a film’s lines, with each word’s time for its captions." /></p>
          <ul>
            {VOICE_KINDS.map((kind) => {
              const set = voices?.find((v) => v.kind === kind);
              return (
                <li key={kind}>
                  <button
                    type="button"
                    className={`provider-row${voiceShown === kind ? ' selected' : ''}`}
                    onClick={() => {
                      setShown(null);
                      setVoiceShown(kind);
                    }}
                  >
                    <span className="avatar" aria-hidden="true">
                      {initials(VOICE_GUIDES[kind].name)}
                    </span>
                    <span className="who">
                      <strong>{VOICE_GUIDES[kind].name}</strong>
                      <span className="mono">{set ? (set.region ?? set.model ?? tr("Set up")) : tr("Not set up")}</span>
                    </span>
                    <span className={`state-dot${set ? ' ready' : ''}`} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          </>}
        </div>

        {voiceShown ? (
          voices ? (
            <VoicePane key={`${voiceShown}-${reload}`} kind={voiceShown} view={voices.find((v) => v.kind === voiceShown)} onVoices={next => { setVoices(next); markSaved(); }} onClose={onClose} />
          ) : (
            <div className="provider-form agent-pane">
              <div className="panel-head">
                <h2>{VOICE_GUIDES[voiceShown].name}</h2>

              </div>
              {voiceError ? (
                <p className="error" role="alert"><SystemMessage text={voiceError} error /></p>
              ) : (
                <p className="note"><Loader size={12} className="spin" /> <Translated text="Loading voice settings…" /></p>
              )}
            </div>
          )
        ) : section === 'agents' && !harness ? <p className="note">{agents ? tr("No coding agents available.") : tr("Loading coding agents…")}</p> : harness ? (
          <AgentPane key={`${harness.kind}-${reload}`} harness={harness} settings={agents!.settings} onAgents={next => { setAgents(next); }} onSaved={markSaved} onClose={onClose} />
        ) : (
        <form className="provider-form" onSubmit={save}>
          <div className="panel-head">
            <h2>{stored ? stored.name : tr("Add a provider")}</h2>

          </div>
          {providers.weakKeyStorage && (
            <p className="error">{tr("This system has no keychain, so keys are kept with a fixed secret any program on it could open.")}</p>
          )}

          {!form.id && (
            <fieldset className="presets">
              <legend className="label"><Translated text="Service" /></legend>
              {PRESETS.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  className={`preset${i === preset ? ' selected' : ''}`}
                  aria-pressed={i === preset}
                  onClick={() => {
                    dirty.current = true;
                    setPreset(i);
                    select({ ...fromPreset(p), key: form.key });
                  }}
                >
                  <strong>{tr(p.name)}</strong>
                  <span>{tr(p.note)}</span>
                </button>
              ))}
            </fieldset>
          )}

          <div className="fields">
            <label>
              <Translated text="Name" />
              <input type="text" value={form.name} onChange={(e) => edit({ name: e.target.value })} />
            </label>
            <label>
              <Translated text="Protocol" />
              <Select
                aria-label={t('Protocol')}
                value={form.protocol}
                onValueChange={(protocol) => edit({ protocol: protocol as ProviderInput['protocol'] })}
                options={[
                  { value: 'anthropic', label: 'Anthropic Messages' },
                  { value: 'openai', label: 'OpenAI Chat Completions' },
                ]}
              />
            </label>
            <label className="wide">
              {tr("Address")}{form.protocol === 'openai' ? tr(" (before /chat/completions)") : ''}
              <input type="text" className="mono" value={form.baseUrl} onChange={(e) => edit({ baseUrl: e.target.value })} />
            </label>
            <label className="wide">
              <Translated text="Model" />
              <input type="text" className="mono" value={form.model} placeholder={tr("The model's id at this service")} onChange={(e) => edit({ model: e.target.value })} />
            </label>
            <label className="wide">
              <Translated text="Key" />
              <input
                type="password"
                value={form.key}
                autoComplete="off"
                placeholder={stored?.hasKey ? tr("Stored: leave empty to keep it") : tr("None for a server on this computer")}
                onChange={(e) => edit({ key: e.target.value })}
              />
              <span className="hint">
                <KeyRound size={12} /> {tr('Sealed with this computer’s keychain. The Studio never shows it again.')}
              </span>
            </label>
            <label className="check wide">
              <input type="checkbox" checked={form.images} onChange={(e) => edit({ images: e.target.checked })} />
              <Translated text="The model reads images: the agent sees its stills and your marks as pictures" />
            </label>
          </div>

          {test && test !== 'testing' && (
            <p className={test.ok ? 'test good' : 'test bad'} role="status">
              {test.ok
                ? tr("Connected: {0} answered{1} in {2} s.", {0: form.model, 1: test.calledTool ? tr(" and called a tool") : tr(", but did not call a tool, which the agent needs"), 2: (test.ms / 1000).toFixed(1)})
                : <SystemMessage text={test.error} error />}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              <SystemMessage text={error} error />
            </p>
          )}

          {confirmRemove && stored && (
            <div className="settings-notice" role="alert">
              {tr('Remove {0}?', { 0: stored.name })}
              <button
                type="button"
                className="button"
                onClick={() => {
                  setConfirmRemove(false);
                  void remove(stored.id);
                }}
              >
                {tr('Confirm remove')}
              </button>
              <button type="button" className="quiet" onClick={() => setConfirmRemove(false)}>
                {tr('Cancel')}
              </button>
            </div>
          )}
          <div className="actions">
            {stored && (
              <button type="button" className="quiet" onClick={() => setConfirmRemove(true)}>
                <Translated text="Remove" />
              </button>
            )}
            {stored && stored.id !== providers.active && (
              <button type="button" className="quiet" onClick={() => void run(() => window.studio.activateProvider(stored.id))}>
                <Check size={14} /> <Translated text="Use this one" />
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="button" onClick={testConnection} disabled={test === 'testing'}>
              {test === 'testing' && <Loader size={14} className="spin" />}
              {tr("Test connection")}
            </button>
            <button type="submit" data-action="save" className="button primary">
              <Translated text="Save" />
            </button>
          </div>
        </form>
        )}
        </>}
        </main>
      </div>
    </div>
  );
}
