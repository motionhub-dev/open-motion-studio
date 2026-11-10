// The launcher (start a film in a new folder, open a folder, reopen a recent project) and the
// open project. The models dialog belongs to both, so it lives here.

import { Folder, Info, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Project, Providers } from '../../shared/api';
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
  const [settings, setSettings] = useState(false);

  useEffect(() => void window.studio.providers().then(setProviders), []);

  useEffect(() => {
    if (project) return;
    window.studio.recentProjects().then(setRecents, (e) => setError(reason(e)));
  }, [project]);

  async function run(action: () => Promise<Project | null>) {
    setError(null);
    setBusy(true);
    try {
      const opened = await action();
      if (opened) setProject(opened);
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(false);
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
          <button type="button" className="button" disabled={busy} onClick={() => run(window.studio.openProject)}>
            <Folder size={16} />
            Open folder
          </button>
          <button type="button" className="button primary" disabled={busy} onClick={() => run(window.studio.createProject)}>
            <Plus size={16} />
            New film
          </button>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {recents.length > 0 && (
          <section aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="label">
              Recent
            </h2>
            <div className="recents">
              {recents.map((recent) => (
                <button key={recent.path} type="button" className="recent" disabled={busy} onClick={() => run(() => window.studio.openRecent(recent.path))}>
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
