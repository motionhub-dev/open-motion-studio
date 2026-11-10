// The launcher (make a project for an engine, open a folder, reopen a recent project) and the
// open project. The models dialog belongs to both, so it lives here.

import { Folder, Info, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { EngineId, Project, Providers } from '../../shared/api';
import { Logo } from './logo';
import { ENGINE_NAMES, ProjectView } from './project-view';
import { reason } from './reason';
import { Settings } from './settings';

const ENGINES: { id: EngineId; glyph: React.ReactNode; line: string; needs: React.ReactNode }[] = [
  {
    id: 'native',
    glyph: <Play size={17} />,
    line: 'React drawn by time with @motionhub/runtime. The Studio plays and exports it.',
    needs: <small className="good">Nothing to install</small>,
  },
  {
    id: 'remotion',
    glyph: 'R',
    line: 'A Remotion 4 project, previewed in its Player and rendered by its own CLI.',
    needs: <small>Needs Node.js · Remotion’s licence: free for individuals and teams of up to three, paid beyond</small>,
  },
  {
    id: 'hyperframes',
    glyph: 'HF',
    line: 'HTML compositions animated by GSAP, rendered by HyperFrames.',
    needs: <small>Needs Node.js · Apache-2.0 · its telemetry off</small>,
  },
];

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [recents, setRecents] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [settings, setSettings] = useState(false);

  useEffect(() => window.studio.onCreateProgress(setBusy), []);
  useEffect(() => void window.studio.providers().then(setProviders), []);

  useEffect(() => {
    if (project) return;
    window.studio.recentProjects().then(setRecents, (e) => setError(reason(e)));
  }, [project]);

  async function run(action: () => Promise<Project | null>) {
    setError(null);
    try {
      const opened = await action();
      if (opened) setProject(opened);
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(null);
    }
  }

  const dialog = settings && providers && <Settings providers={providers} onChange={setProviders} onClose={() => setSettings(false)} />;

  if (project) {
    return (
      <>
        <ProjectView
          project={project}
          providers={providers}
          onSettings={() => setSettings(true)}
          onChange={setProject}
          onClose={() => {
            void window.studio.closeProject();
            setProject(null);
          }}
        />
        {dialog}
      </>
    );
  }

  return (
    <main className="launcher">
      <div className="launcher-inner">
        <div className="launcher-head">
          <Logo size={44} />
          <div>
            <h1>Open Motion Studio</h1>
            <p className="muted">Make motion video with an agent, in a motion from motionhub.</p>
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" className="button" disabled={busy !== null} onClick={() => run(window.studio.openProject)}>
            <Folder size={16} />
            Open folder
          </button>
        </div>

        <section aria-labelledby="new-heading">
          <h2 id="new-heading" className="label">
            New project
          </h2>
          <div className="engines">
            {ENGINES.map((engine, i) => (
              <button
                key={engine.id}
                type="button"
                className={`engine-card${i === 0 ? ' first' : ''}`}
                disabled={busy !== null}
                onClick={() => run(() => window.studio.createProject(engine.id))}
              >
                <span className="glyph">{engine.glyph}</span>
                <strong>{ENGINE_NAMES[engine.id]}</strong>
                <p>{engine.line}</p>
                {engine.needs}
              </button>
            ))}
          </div>
          {busy && (
            <p className="note" role="status">
              {busy}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>

        {recents.length > 0 && (
          <section aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="label">
              Recent
            </h2>
            <div className="recents">
              {recents.map((recent) => (
                <button key={recent.path} type="button" className="recent" disabled={busy !== null} onClick={() => run(() => window.studio.openRecent(recent.path))}>
                  <span className="tile" aria-hidden="true">
                    {recent.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="meta">
                    <span>
                      {recent.name}
                      {recent.engine && <span className="badge">{ENGINE_NAMES[recent.engine]}</span>}
                    </span>
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
            <p>No model is set up yet. The agent runs on yours: any Anthropic Messages or OpenAI Chat Completions server, or one on this computer.</p>
            <button type="button" className="button primary" onClick={() => setSettings(true)}>
              Set up a model
            </button>
          </div>
        )}
      </div>
      {dialog}
    </main>
  );
}
