// The launcher (start a film in a new folder, open a folder, reopen a recent project) and the
// open project. The models dialog belongs to both, so it lives here.

import { AppWindow, Folder, Info, Plus, ArrowUpRight, Play, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Example, HarnessView, Project, ProjectTask, Providers, VoiceKind, WorkspaceSettings } from '../../shared/api';
import { Logo } from './logo';
import { ProjectView } from './project-view';
import { reason } from './reason';
import { Settings } from './settings';

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [recents, setRecents] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  /** Models, when open: on the providers, or on one of the person's own coding agents. */
  const [settings, setSettings] = useState<false | { agent?: HarnessView['kind']; voice?: VoiceKind; workspace?: boolean }>(false);
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);
  /** Counts the times Models closed, so the open project asks again how its agent runs. */
  const [modelsClosed, setModelsClosed] = useState(0);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    window.studio.currentProject().then(setProject, (e) => setError(reason(e)));
    const stop = window.studio.onTasks(setTasks);
    window.studio.tasks().then(setTasks, (e) => setError(reason(e)));
    return stop;
  }, []);
  useEffect(() => {
    if (project || !tasks.some((t) => t.status === 'running' || t.status === 'waiting')) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [project, tasks]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      // macOS handles Command shortcuts through its native File menu.
      if (event.metaKey && navigator.platform.startsWith('Mac')) return;
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) window.studio.newWindow().catch((e) => setError(reason(e)));
      }
    };
    window.addEventListener('keydown', shortcut, true);
    return () => window.removeEventListener('keydown', shortcut, true);
  }, []);

  useEffect(() => {
    window.studio.examples().then(setExamples, (e) => setError(reason(e)));
  }, []);
  useEffect(() => {
    const refresh = () => {
      window.studio.providers().then(setProviders, (e) => setError(reason(e)));
      window.studio.workspace().then(setWorkspace, (e) => setError(reason(e)));
      window.studio.recentProjects().then(setRecents, (e) => setError(reason(e)));
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  useEffect(() => {
    if (project) return;
    window.studio.recentProjects().then(setRecents, (e) => setError(reason(e)));
  }, [project]);

  async function run(action: () => Promise<Project | null>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(false);
    }
  }

  const dialog = settings && providers && (
    <Settings
      providers={providers}
      agent={settings.agent}
      voice={settings.voice}
      workspace={settings.workspace}
      onChange={setProviders}
      onClose={() => {
        setSettings(false);
        window.studio.workspace().then(setWorkspace, (e) => setError(reason(e)));
        setModelsClosed((n) => n + 1);
      }}
    />
  );

  if (project) {
    return (
      <>
        <ProjectView
          project={project}
          providers={providers}
          onSettings={(agent) => setSettings(agent ? { agent } : {})}
          onVoiceSettings={(voice) => setSettings({ voice })}
          modelsClosed={modelsClosed}
          onChange={setProject}
          onClose={() => {
            window.studio.closeProject().then(
              () => {},
              (e) => setError(reason(e)),
            );
          }}
        />
        {error && (
          <div className="toast bad" role="alert">
            {error}
            <button className="quiet" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {dialog}
      </>
    );
  }

  return (
    <main className="launcher">
      <div className="launcher-inner">
        <header>
          <div className="launcher-head">
            <Logo size={64} />
            <div>
              <h1>OpenMotionStudio</h1>
              <p className="muted">Make motion video with an agent, in a motion from motionhub.</p>
            </div>
            <span style={{ flex: 1 }} />
            <button type="button" className="button" disabled={busy} onClick={() => run(window.studio.openProject)}>
              <Folder size={16} />
              Open folder
            </button>
            <button type="button" className="button primary" disabled={busy} onClick={() => run(window.studio.createProject)}>
              <Plus size={16} />
              New film
            </button>
          </div>
          <button type="button" className="workspace-location quiet" onClick={() => setSettings({ workspace: true })} title={workspace?.path}>
            <SettingsIcon size={15} /> Workspace <span className="mono">{workspace?.path ?? 'Settings'}</span>
          </button>
        </header>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <p className="note">Close this window to keep working in the background. Open or quit OpenMotionStudio from its tray icon.</p>

        {tasks.length > 0 && (
          <section aria-labelledby="projects-heading">
            <h2 id="projects-heading" className="label">Your projects · {tasks.length}</h2>
            <div className="project-tasks">
              {tasks.map((task) => (
                <article key={task.project.path} className="project-task">
                  <div className="task-heading">
                    <strong title={task.project.path}>{task.project.name}</strong>
                    <span className={`task-state ${task.status}`}>
                      {{ idle: 'Ready', running: 'Working', waiting: 'Needs you', done: 'Done', failed: 'Failed', stopped: 'Stopped' }[task.status]}
                    </span>
                  </div>
                  <p className="task-title">{task.title}</p>
                  <p className="note">{task.activity}{task.background ? ' · Background' : ' · Open'}
                    {(task.status === 'running' || task.status === 'waiting') && ` · ${Math.max(0, Math.floor((now - task.startedAt) / 1000))}s`}
                  </p>
                  {task.progress !== undefined && task.status === 'running' && (
                    <progress max={1} value={task.progress} aria-label={`${task.project.name} progress`} />
                  )}
                  <div className="task-actions">
                    <button type="button" className="button primary" onClick={() => window.studio.openTask(task.project.path).catch((e) => setError(reason(e)))}>Open here</button>
                    <button type="button" className="button" onClick={() => window.studio.openTask(task.project.path, true).catch((e) => setError(reason(e)))}>
                      <AppWindow size={15} /> Open in editor window
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {examples.length > 0 && (
          <section className="starting-points" aria-labelledby="starting-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">A little inspiration</span>
                <h2 id="starting-title">Start with something moving.</h2>
              </div>
              <p>Play, inspect, export. No model needed.</p>
            </div>
            <div className="example-grid">
              {examples.map((example) => (
                <button
                  className={`example-card example-${example.id}`}
                  disabled={busy}
                  key={example.id}
                  onClick={() => run(() => window.studio.openExample(example.id))}
                >
                  <div className="example-poster">
                    <span className="eyebrow">OpenMotionStudio / {example.id}</span>
                    {example.id === 'data' && (
                      <div className="example-bars" aria-hidden="true">
                        {[1, 2, 3, 4].map((n) => (
                          <i key={n} style={{ '--bar': n } as React.CSSProperties} />
                        ))}
                      </div>
                    )}
                    <strong>{example.title}</strong>
                    <span className="example-play">
                      <Play size={12} fill="currentColor" />
                      {example.seconds} s
                    </span>
                  </div>
                  <div className="example-caption">
                    <div>
                      <strong>{example.name}</strong>
                      <p>{example.line}</p>
                    </div>
                    <ArrowUpRight size={16} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {recents.length > 0 && (
          <section aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="label">
              Recent
            </h2>
            <div className="recents">
              {recents.map((recent) => (
                <button
                  key={recent.path}
                  type="button"
                  className="recent"
                  disabled={busy}
                  onClick={() => run(() => window.studio.openRecent(recent.path))}
                >
                  <span className="tile" aria-hidden="true">
                    {recent.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="meta">
                    <span>{recent.name}</span>
                    <span className="path" title={recent.path}>
                      {recent.display}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {providers && providers.providers.length === 0 && (
          <div className="banner">
            <Info size={18} />
            <p>
              No model is set up yet. The agent runs on yours: any Anthropic Messages or OpenAI Chat Completions server, or one on this
              computer.
            </p>
            <button type="button" className="button primary" onClick={() => setSettings({})}>
              Set up a model
            </button>
          </div>
        )}
      </div>
      {dialog}
    </main>
  );
}
