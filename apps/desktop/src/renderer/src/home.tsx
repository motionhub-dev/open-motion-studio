// Home: the person's projects (covers, search, sort, the actions on each), the bundled templates with a preview
// before a copy is made, the tasks still running in the background, and a first-run walk through appearance, the
// workspace and an assistant. A project's name and a template's film are content: they are never translated.

import { type CSSProperties, type FormEvent, type RefObject, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Clapperboard,
  Folder,
  FolderOpen,
  Home as HomeIcon,
  Languages,
  LayoutGrid,
  List,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  Search,
  Settings as SettingsIcon,
  Sun,
} from 'lucide-react';
import { MAX_BRIEF } from '../../shared/api';
import type { Agents, Example, LibraryProject, Project, ProjectTask, Providers, WorkspaceSettings } from '../../shared/api';
import { Logo } from './logo';
import { Select } from './select';
import { SystemMessage, usePreferences } from './preferences';
import { reason } from './reason';
import { timecode } from './preview';

type Page = 'home' | 'projects' | 'templates';
type SettingsTarget = { models?: boolean; workspace?: boolean; agent?: 'codex' | 'claude' };

/**
 * Each template's film as the Studio's own export drew it, and its poster frame (scripts/render-templates.mjs, run by
 * `pnpm templates`); a test keeps them in step with the templates' sources.
 */
const RENDERED = import.meta.glob('./templates/*.{mp4,jpg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const rendered = (id: string, kind: 'mp4' | 'jpg'): string | undefined => RENDERED[`./templates/${id}.${kind}`];

/** The moment a template's poster is taken, where its card's video rests (render-templates.mjs takes the same). */
const POSTER_AT = 2.4;

/** Whether the person asked the system for less motion: nothing then plays by itself. */
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Starts a template's video. It is muted and local, so playing fails only when a pause or a seek interrupts it, which
 * is the person's own doing and needs no word.
 */
const play = (video: HTMLVideoElement | null) => void video?.play().catch(() => undefined);

/** A template's film on the stage, as the editor plays a film: on ink, with play, a seek and the time. */
function TemplatePlayer({ example }: { example: Example }) {
  const { t } = usePreferences();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(example.seconds);
  useEffect(() => {
    if (!reducedMotion()) play(video.current);
  }, []);
  // The time follows each frame while it plays; the element itself reports it only a few times a second.
  useEffect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(function tick() {
      setTime(video.current?.currentTime ?? 0);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  return (
    <div className="stage template-stage" role="group" aria-label={t('Template preview')}>
      <div className="template-picture">
        <video
          ref={video}
          src={rendered(example.id, 'mp4')}
          poster={rendered(example.id, 'jpg')}
          muted
          loop
          playsInline
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onSeeked={(event) => setTime(event.currentTarget.currentTime)}
        />
      </div>
      <div className="stage-bar">
        <button
          type="button"
          className="play"
          aria-label={t(playing ? 'Pause' : 'Play')}
          onClick={() => (video.current?.paused ? play(video.current) : video.current?.pause())}
        >
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <input
          type="range"
          className="stage-seek"
          aria-label={t('Seek the film')}
          min={0}
          max={duration}
          step={0.01}
          value={time}
          style={{ '--progress': `${(time / duration) * 100}%` } as CSSProperties}
          onChange={(event) => {
            const element = video.current;
            if (!element) return;
            element.pause();
            element.currentTime = Number(event.target.value);
            setTime(element.currentTime);
          }}
        />
        <span className="timecode mono">
          {timecode(time)} <span>/ {timecode(duration)}</span>
        </span>
      </div>
    </div>
  );
}

/** A template's card: its film's poster frame, played from its start while the pointer or focus is on it. */
function TemplateCard({ example, onOpen }: { example: Example; onOpen(): void }) {
  const { t } = usePreferences();
  const video = useRef<HTMLVideoElement>(null);
  const start = () => {
    if (!video.current || reducedMotion()) return;
    video.current.currentTime = 0;
    play(video.current);
  };
  const stop = () => {
    if (!video.current) return;
    video.current.pause();
    video.current.currentTime = POSTER_AT;
  };
  return (
    <button
      className="home-template"
      onClick={onOpen}
      onPointerEnter={start}
      onPointerLeave={stop}
      onFocus={start}
      onBlur={stop}
    >
      <div className="template-art">
        <video
          ref={video}
          src={rendered(example.id, 'mp4')}
          poster={rendered(example.id, 'jpg')}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = POSTER_AT;
          }}
        />
        <span className="template-play" aria-hidden="true">
          <Play size={14} fill="currentColor" />
        </span>
      </div>
      <strong>{t(example.name)}</strong>
      <span className="note">{t(example.line)}</span>
      <small>{t('{0} seconds', { 0: example.seconds })}</small>
    </button>
  );
}

/** The first run: appearance, where films are saved, and how the person creates; templates are always a way out. */
function Onboarding({ workspace, agents, available, disabled, work, onSettings, onFinish }: {
  workspace: WorkspaceSettings | null;
  agents: Agents | null;
  available: boolean;
  disabled: boolean;
  work(action: () => Promise<unknown>): Promise<void>;
  onSettings(target: SettingsTarget): void;
  onFinish(destination: Page): Promise<void>;
}) {
  const { t, preferences, save } = usePreferences();
  const [step, setStep] = useState(0);
  const steps = ['Appearance', 'Project location', 'Creative assistant'];
  return (
    <section className="onboarding">
      <span className="eyebrow">
        {t('Welcome to')} <span className="verbatim">OpenMotionStudio</span>
      </span>
      <h1>{t('Make room for your first film.')}</h1>
      <p className="note">{t('A few preferences, a place to save, and your creative assistant. You can also explore templates first.')}</p>
      <ol className="setup-steps">
        {steps.map((label, index) => (
          <li key={label} className={step === index ? 'selected' : ''}>
            <button onClick={() => setStep(index)}>
              <span>{index < step ? <Check size={13} /> : index + 1}</span>
              {t(label)}
            </button>
          </li>
        ))}
      </ol>
      <div className="setup-panel">
        {step === 0 && (
          <>
            <h2>{t('Make OpenMotionStudio yours')}</h2>
            <label className="preference-row">
              <span>{t('Language')}</span>
              <Select
                aria-label={t('Language')}
                value={preferences.language}
                disabled={disabled}
                onValueChange={(language) => void work(() => save({ language: language as typeof preferences.language }))}
                options={[
                  { value: 'system', label: t('Follow system') },
                  { value: 'zh-CN', label: '简体中文' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </label>
            <label className="preference-row">
              <span>{t('Theme')}</span>
              <Select
                aria-label={t('Theme')}
                value={preferences.theme}
                disabled={disabled}
                onValueChange={(theme) => void work(() => save({ theme: theme as typeof preferences.theme }))}
                options={[
                  { value: 'system', label: t('Follow system') },
                  { value: 'light', label: t('Light') },
                  { value: 'dark', label: t('Dark') },
                ]}
              />
            </label>
          </>
        )}
        {step === 1 && (
          <>
            <h2>{t('Where your films live')}</h2>
            <p className="workspace-path mono">{workspace?.path}</p>
            <p className="note">{t('New projects are saved here. Existing projects stay where they are.')}</p>
            <button className="button" disabled={disabled} onClick={() => void work(() => window.studio.chooseWorkspace())}>
              {t('Change folder')}
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <h2>{t('Choose how you create')}</h2>
            <p className="note">
              {t('Connect a model service or an installed coding agent. Templates and existing projects work without one.')}
            </p>
            <div className="setup-options">
              <button className="button" onClick={() => onSettings({ models: true })}>
                {t('Model Providers')}
                <ArrowRight size={15} />
              </button>
              {(['codex', 'claude'] as const).map((kind) => (
                <button key={kind} className="button" onClick={() => onSettings({ agent: kind })}>
                  {kind === 'codex' ? 'Codex' : 'Claude Code'}
                  <span className="badge">{t(agents?.harnesses.find((a) => a.kind === kind)?.state === 'ready' ? 'Ready' : 'Set up')}</span>
                </button>
              ))}
            </div>
            <p className="note">{t(available ? 'A creative assistant is configured.' : 'You can configure an assistant later.')}</p>
          </>
        )}
      </div>
      <div className="setup-actions">
        <button className="quiet" disabled={disabled} onClick={() => void work(() => onFinish('templates'))}>
          {t('Explore templates first')}
        </button>
        <span className="spacer" />
        {step > 0 && (
          <button className="button" onClick={() => setStep(step - 1)}>
            {t('Back')}
          </button>
        )}
        <button
          className="button primary"
          disabled={disabled}
          onClick={() =>
            void work(async () => {
              if (step === 1) await window.studio.validateWorkspace();
              if (step < steps.length - 1) setStep(step + 1);
              else await onFinish('home');
            })
          }
        >
          {t(step < steps.length - 1 ? 'Continue' : 'Start creating')}
          <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

/**
 * A project's card: its cover, name and when it was last opened, and the actions that never touch its files. The
 * featured one, the project opened last, is drawn large with a way back into it.
 */
function ProjectCard({ project, task, featured = false, menuOpen, disabled, work, onOpen, onMenu }: {
  project: LibraryProject;
  task: ProjectTask | undefined;
  featured?: boolean;
  menuOpen: boolean;
  disabled: boolean;
  work(action: () => Promise<unknown>): Promise<void>;
  onOpen(): void;
  onMenu(open: boolean): void;
}) {
  const { t, chinese } = usePreferences();
  const opened = project.lastOpened
    ? t('Last opened {0}', {
        0: new Date(project.lastOpened).toLocaleString(chinese ? 'zh-CN' : 'en', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      })
    : t('Previously opened');
  const locate = () => void work(() => window.studio.libraryAction(project.path, 'locate'));
  return (
    <article className={`home-project${featured ? ' featured' : ''}`}>
      <button className="project-open" disabled={disabled || project.missing} onClick={onOpen}>
        <div className="project-art">
          {project.cover ? <img src={project.cover} alt="" decoding="async" /> : <span>{project.name.slice(0, 2).toUpperCase()}</span>}
          {task && <TaskBadge task={task} />}
          {task?.status === 'running' && task.progress !== undefined && (
            <span className="task-progress" style={{ width: `${Math.round(task.progress * 100)}%` }} aria-hidden="true" />
          )}
        </div>
        <div className="project-caption">
          <strong>{project.name}</strong>
          <small>{project.missing ? t('Project folder not found') : opened}</small>
          {featured && !project.missing && (
            <span className="project-continue">
              {t('Continue editing')}
              <ArrowRight size={15} />
            </span>
          )}
        </div>
      </button>
      <div className="project-more">
        <button
          className="icon-button"
          aria-label={t('Project actions')}
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation();
            onMenu(!menuOpen);
          }}
        >
          <MoreHorizontal size={18} />
        </button>
        {menuOpen && (
          <div className="home-menu" role="menu">
            {project.missing ? (
              <button role="menuitem" disabled={disabled} onClick={locate}>
                {t('Locate project folder')}
              </button>
            ) : (
              <>
                <button role="menuitem" disabled={disabled} onClick={() => void work(() => window.studio.openTask(project.path, true))}>
                  {t('Open in editor window')}
                </button>
                <button role="menuitem" disabled={disabled} onClick={() => void work(() => window.studio.libraryAction(project.path, 'show'))}>
                  {t('Show in folder')}
                </button>
              </>
            )}
            <button role="menuitem" disabled={disabled} onClick={() => void work(() => window.studio.libraryAction(project.path, 'remove'))}>
              {t('Remove from list')}
            </button>
            <small>{t('Files on disk are kept.')}</small>
          </div>
        )}
      </div>
      {project.missing && (
        <button className="quiet" disabled={disabled} onClick={locate}>
          {t('Locate project folder')}
        </button>
      )}
    </article>
  );
}

/**
 * Where a project's task stands, over its cover: a ring filling with its progress (turning while it has none) while
 * it runs, a dot when it needs the person.
 */
function TaskBadge({ task }: { task: ProjectTask }) {
  const { t } = usePreferences();
  const waiting = task.status === 'waiting';
  const progress = task.progress;
  return (
    <span className={`badge task-badge ${task.status}`}>
      {waiting ? (
        <span className="task-dot" aria-hidden="true" />
      ) : (
        <svg className={`task-ring${progress === undefined ? ' turning' : ''}`} viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6" pathLength="100" />
          <circle cx="8" cy="8" r="6" pathLength="100" strokeDasharray={`${progress === undefined ? 30 : Math.round(progress * 100)} 100`} />
        </svg>
      )}
      {t(waiting ? 'Needs you' : 'Working')}
      {!waiting && progress !== undefined && <span className="mono">{Math.round(progress * 100)}%</span>}
    </span>
  );
}

/** Ways to begin a brief, each a start the person finishes in their own words. */
const STARTERS = ['A 15-second launch teaser for ', 'A 30-second explainer on how ', 'Kinetic type for the line “'];

/**
 * What the person wants to make, in their words: a new project named from it, opened, with the words as the agent's
 * first message. Without an assistant they wait in the project's composer.
 */
function Prompt({ field, available, disabled, onCreate, onSetUp }: {
  field: RefObject<HTMLTextAreaElement | null>;
  available: boolean;
  disabled: boolean;
  /** Creates the project; the words stay in the field until it has. */
  onCreate(brief: string): Promise<boolean>;
  onSetUp(): void;
}) {
  const { t } = usePreferences();
  const [brief, setBrief] = useState('');
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (brief.trim() && !disabled) void onCreate(brief.trim()).then((created) => created && setBrief(''));
  };
  return (
    <form className="home-prompt" onSubmit={submit}>
      <textarea
        ref={field}
        rows={3}
        maxLength={MAX_BRIEF}
        value={brief}
        aria-label={t('Describe the film you want to make')}
        placeholder={t('Describe the film you want to make…')}
        onChange={(event) => setBrief(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
        }}
      />
      <div className="home-prompt-foot">
        <div className="home-starters">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              className="chip"
              onClick={() => {
                const text = t(starter);
                setBrief(text);
                field.current?.focus();
                requestAnimationFrame(() => field.current?.setSelectionRange(text.length, text.length));
              }}
            >
              {t(starter).replace(/[\s“：:]+$/, '')}…
            </button>
          ))}
        </div>
        <button className="button primary" type="submit" disabled={disabled || !brief.trim()}>
          {t('Start creating')}
          <ArrowRight size={15} />
        </button>
      </div>
      {!available && (
        <p className="note home-prompt-note">
          {t('No assistant is connected yet: your description will wait in the new project.')}{' '}
          <button type="button" className="quiet" onClick={onSetUp}>
            {t('Connect an assistant')}
          </button>
        </p>
      )}
    </form>
  );
}

/** Whether a key press is someone typing, which a shortcut leaves alone. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function Home({ providers, workspace, tasks, examples, busy, error, revision, onAction, onSettings }: {
  providers: Providers | null;
  workspace: WorkspaceSettings | null;
  tasks: ProjectTask[];
  examples: Example[];
  /** Changes whenever Settings closes or changes elsewhere, so the library and agents are read again. */
  revision: number;
  busy: boolean;
  error: string | null;
  /** Runs an action that may open a project; whether it went. */
  onAction(action: () => Promise<Project | null>): Promise<boolean>;
  onSettings(target?: SettingsTarget): void;
}) {
  const { t, chinese, preferences, ready, save } = usePreferences();
  /** The theme on screen, Follow system resolved, which the header's switch turns over. */
  const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const [page, setPage] = useState<Page>('home');
  const [library, setLibrary] = useState<LibraryProject[] | null>(null);
  const [agents, setAgents] = useState<Agents | null>(null);
  const [problem, setProblem] = useState('');
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('opened');
  const [view, setView] = useState('grid');
  const [menu, setMenu] = useState<string | null>(null);
  const [preview, setPreview] = useState<Example | null>(null);
  const [showTasks, setShowTasks] = useState(false);
  const [help, setHelp] = useState(false);
  const prompt = useRef<HTMLTextAreaElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const refresh = () => {
    window.studio.projectLibrary().then(setLibrary, (e) => setProblem(reason(e)));
    window.studio.agents().then(setAgents, (e) => setProblem(reason(e)));
  };
  useEffect(() => {
    refresh();
    const stop = window.studio.onSettingsChanged(refresh);
    window.addEventListener('focus', refresh);
    return () => {
      stop();
      window.removeEventListener('focus', refresh);
    };
  }, [revision]);
  useEffect(() => window.studio.onViewVisibility((visible) => visible && refresh()), []);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);
  // Someone with projects already has nothing to be walked through.
  useEffect(() => {
    if (ready && library?.length && !preferences.onboardingComplete) {
      save({ onboardingComplete: true }).catch((e) => setProblem(reason(e)));
    }
  }, [ready, library, preferences.onboardingComplete]);
  // / goes to what the page is for: the search on My projects, the description on Home.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== '/' || typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('.studio-settings, dialog[open], [role=dialog]')) return;
      const field = page === 'projects' ? search.current : page === 'home' && !preview ? prompt.current : null;
      if (!field) return;
      event.preventDefault();
      field.focus();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [page, preview]);

  const firstRun = ready && library !== null && !preferences.onboardingComplete && library.length === 0;
  const available = !!providers?.providers.some((p) => p.ready) || !!agents?.harnesses.some((a) => a.state === 'ready');
  const active = tasks
    .filter((task) => task.status === 'waiting' || task.status === 'running')
    .sort((a, b) => Number(b.status === 'waiting') - Number(a.status === 'waiting'));
  const disabled = pending || busy;

  async function work(action: () => Promise<unknown>) {
    setPending(true);
    setProblem('');
    try {
      await action();
      refresh();
    } catch (e) {
      setProblem(reason(e));
    } finally {
      setPending(false);
    }
  }
  async function finish(destination: Page) {
    await window.studio.validateWorkspace();
    await save({ onboardingComplete: true });
    setPage(destination);
  }
  function visit(next: Page) {
    setPage(next);
    setPreview(null);
    setQuery('');
    setMenu(null);
  }

  const recent = [...(library ?? [])].sort((a, b) => b.lastOpened - a.lastOpened);
  const found = recent
    .filter((p) => p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'modified' ? b.modified - a.modified : 0));
  const card = (project: LibraryProject, featured = false) => (
    <ProjectCard
      key={project.path}
      project={project}
      featured={featured}
      task={active.find((task) => task.project.path === project.path)}
      menuOpen={menu === project.path}
      disabled={disabled}
      work={work}
      onOpen={() => void onAction(() => window.studio.openRecent(project.path))}
      onMenu={(open) => setMenu(open ? project.path : null)}
    />
  );

  function tasksSummary() {
    return (
      <section className="task-summary">
        <button onClick={() => setShowTasks(!showTasks)}>
          <span className={`state-dot ${active.some((task) => task.status === 'waiting') ? 'waiting' : 'ready'}`} />
          {t('{0} need attention · {1} running', {
            0: active.filter((task) => task.status === 'waiting').length,
            1: active.filter((task) => task.status === 'running').length,
          })}
          <span className="spacer" />
          {t(showTasks ? 'Fewer' : 'View tasks')}
        </button>
        {showTasks &&
          active.map((task) => (
            <button key={task.project.path} onClick={() => void work(() => window.studio.openTask(task.project.path))}>
              <strong>{task.project.name}</strong>
              <SystemMessage text={task.activity} />
              <ArrowRight size={15} />
            </button>
          ))}
      </section>
    );
  }

  function templates(heading: boolean) {
    return (
      <section>
        {heading && (
          <div className="section-heading">
            <div>
              <h2>{t('Start from a template')}</h2>
              <p className="note">{t('Preview first. Create your own copy when you are ready.')}</p>
            </div>
            <button className="quiet" onClick={() => visit('templates')}>
              {t('All templates')} →
            </button>
          </div>
        )}
        <div className="home-templates">
          {examples.map((example) => (
            <TemplateCard key={example.id} example={example} onOpen={() => setPreview(example)} />
          ))}
        </div>
      </section>
    );
  }

  function body() {
    if (library === null || !ready) {
      // The page's shape while the library is read, so nothing jumps when it arrives.
      return (
        <div className="home-skeleton" role="status" aria-label={t('Loading…')}>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-prompt" />
          <div className="home-projects grid recent">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="skeleton skeleton-card" />
            ))}
          </div>
        </div>
      );
    }
    if (preview) {
      return (
        <section className="template-detail">
          <button className="quiet template-back" onClick={() => setPreview(null)}>
            <ArrowLeft size={14} />
            {t('Back')}
          </button>
          <TemplatePlayer key={preview.id} example={preview} />
          <div className="template-description">
            <h1>{t(preview.name)}</h1>
            <p>{t(preview.line)}</p>
            <p className="note">
              {t('{0} seconds', { 0: preview.seconds })} · 16:9 · {t('No model required')}
            </p>
            <p className="note">{t('Using a template creates a separate project in your workspace.')}</p>
            <button className="button primary" disabled={disabled} onClick={() => void onAction(() => window.studio.openExample(preview.id))}>
              {t('Use this template')}
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      );
    }
    if (firstRun && page === 'home') {
      return (
        <Onboarding
          workspace={workspace}
          agents={agents}
          available={available}
          disabled={disabled}
          work={work}
          onSettings={onSettings}
          onFinish={finish}
        />
      );
    }
    if (page === 'home') {
      return (
        <>
          <section className="home-hero">
            <h1>{t(library.length ? 'What do you want to make next?' : 'What do you want to make?')}</h1>
            <Prompt
              field={prompt}
              available={available}
              disabled={disabled}
              onCreate={(brief) => onAction(() => window.studio.createProject(brief))}
              onSetUp={() => onSettings({ models: true })}
            />
          </section>
          {active.length > 0 && tasksSummary()}
          {library.length > 0 && (
            <section>
              <div className="section-heading">
                <h2>{t('Continue creating')}</h2>
                <button className="quiet" onClick={() => visit('projects')}>
                  {t('All projects')} →
                </button>
              </div>
              {card(recent[0]!, true)}
              {recent.length > 1 && <div className="home-projects grid recent">{recent.slice(1, 5).map((project) => card(project))}</div>}
            </section>
          )}
          {templates(true)}
        </>
      );
    }
    return (
      <>
        <h1 className="home-title">{t(page === 'projects' ? 'My projects' : 'Templates')}</h1>
        {page === 'templates' && templates(false)}
        {page === 'projects' && (
          <>
            <div className="library-toolbar">
              <label className="project-search">
                <Search size={16} />
                <input
                  ref={search}
                  type="search"
                  aria-label={t('Search projects')}
                  placeholder={t('Search projects')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <kbd aria-hidden="true">/</kbd>
              </label>
              <Select
                aria-label={t('Sort projects')}
                value={sort}
                onValueChange={setSort}
                options={[
                  { value: 'opened', label: t('Recently opened') },
                  { value: 'modified', label: t('Recently modified') },
                  { value: 'name', label: t('Name') },
                ]}
              />
              <button className="icon-button" aria-label={t('Grid view')} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
                <LayoutGrid size={17} />
              </button>
              <button className="icon-button" aria-label={t('List view')} aria-pressed={view === 'list'} onClick={() => setView('list')}>
                <List size={17} />
              </button>
            </div>
            {library.length ? (
              <div className={`home-projects ${view}`}>{found.map((project) => card(project))}</div>
            ) : (
              <p className="home-empty">{t('Projects you create or open appear here.')}</p>
            )}
            {library.length > 0 && !found.length && <p className="home-empty">{t('No projects match your search.')}</p>}
          </>
        )}
      </>
    );
  }

  const pages = [
    ['home', 'Home', HomeIcon],
    ['projects', 'My projects', FolderOpen],
    ['templates', 'Templates', Clapperboard],
  ] as const;

  return (
    <main className="studio-home">
      <header className="home-header">
        <div className="home-brand">
          <Logo size={30} />
          <strong>OpenMotionStudio</strong>
        </div>
        <span className="spacer" />
        <button className="button" disabled={disabled} onClick={() => void onAction(window.studio.openProject)}>
          <Folder size={15} />
          {t('Open project')}
        </button>
        {/* The look and the language, one click each; Follow system stays in Settings. */}
        <button
          className="icon-button"
          aria-label={dark ? t('Switch to the light theme') : t('Switch to the dark theme')}
          data-tip={dark ? t('Switch to the light theme') : t('Switch to the dark theme')}
          disabled={!ready}
          onClick={() => void save({ theme: dark ? 'light' : 'dark' }).catch((e) => console.error('Saving the theme failed:', e))}
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button
          className="button quiet home-language"
          aria-label={t('Switch the language to {0}', {0: chinese ? 'English' : '简体中文'})}
          data-tip={t('Switch the language to {0}', {0: chinese ? 'English' : '简体中文'})}
          disabled={!ready}
          onClick={() => void save({ language: chinese ? 'en' : 'zh-CN' }).catch((e) => console.error('Saving the language failed:', e))}
        >
          <Languages size={16} />
          {chinese ? '中文' : 'EN'}
        </button>
        <button className="icon-button" aria-label={t('OpenMotionStudio settings')} data-tip={t('OpenMotionStudio settings')} onClick={() => onSettings()}>
          <SettingsIcon size={18} />
        </button>
      </header>
      <aside className="home-nav">
        <nav aria-label={t('Main navigation')}>
          {pages.map(([id, label, Icon]) => (
            <button key={id} aria-current={page === id ? 'page' : undefined} onClick={() => visit(id)}>
              <Icon size={17} aria-hidden="true" />
              {t(label)}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <div className="home-nav-foot">
          <button className="workspace-shortcut" title={workspace?.path} onClick={() => onSettings({ workspace: true })}>
            <Folder size={17} aria-hidden="true" />
            <span>
              {t('Workspace')}
              <small>{workspace?.path.split(/[/\\]/).filter(Boolean).at(-1) ?? t('Loading…')}</small>
            </span>
          </button>
          <button aria-expanded={help} onClick={() => setHelp(!help)}>
            <CircleHelp size={17} aria-hidden="true" />
            {t('Help')}
          </button>
        </div>
      </aside>
      <div className="home-content">
        <div className="home-content-inner">
          {(error || problem) && (
            <div className="callout" role="alert">
              <SystemMessage text={problem || error!} error />
              <button
                className="quiet"
                onClick={() => {
                  setProblem('');
                  refresh();
                }}
              >
                {t('Retry')}
              </button>
            </div>
          )}
          {help && (
            <section className="home-help">
              <strong>{t('A few things to know')}</strong>
              <p>{t('Projects are folders on your computer. Templates create a new copy. Closing a window keeps active tasks running in the tray.')}</p>
              <p className="note">
                {t('Keyboard shortcuts')}: <kbd>{MOD}</kbd> <kbd>{'N'}</kbd> {t('New film')} · <kbd>{MOD}</kbd> <kbd>{'O'}</kbd> {t('Open project')} ·{' '}
                <kbd>{MOD}</kbd> <kbd>,</kbd> {t('Settings')} · <kbd>/</kbd> {t('Search projects')}
              </p>
              <button className="quiet" onClick={() => setHelp(false)}>
                {t('Close')}
              </button>
            </section>
          )}
          {/* Each page, and a template opened, comes in with a short rise. */}
          <div className="home-page" key={preview ? `template:${preview.id}` : page}>
            {body()}
          </div>
        </div>
      </div>
    </main>
  );
}

/** The modifier the app's shortcuts are held with on this computer. */
const MOD = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl';
