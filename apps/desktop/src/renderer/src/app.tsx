// The launcher (start a film in a new folder, open a folder, reopen a recent project) and the
// open project. The models dialog belongs to both, so it lives here.

import { Folder, Info, Plus, ArrowUpRight, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Project, Providers, Example } from '../../shared/api';
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
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    window.studio.examples().then(setExamples, (e) => setError(reason(e)));
  }, []);
  useEffect(() => void window.studio.providers().then(setProviders, (e) => setError(reason(e))), []);

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
            window.studio.closeProject().then(
              () => setProject(null),
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
        <div className="launcher-head">
          <Logo size={64} />
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
                    <span className="eyebrow">OPEN MOTION STUDIO / {example.id}</span>
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
