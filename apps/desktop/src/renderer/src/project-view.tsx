// An open project: its film's preview and export. A folder with no film yet is offered one.

import { useEffect, useState } from 'react';
import type { BuildResult, Project, Providers } from '../../shared/api';
import { Assistant } from './assistant';
import { MotionPanel } from './motion-panel';
import { Preview } from './preview';
import { reason } from './reason';
import { Settings } from './settings';

export function ProjectView({ project, onChange, onClose }: { project: Project; onChange(p: Project): void; onClose(): void }) {
  const [build, setBuild] = useState<BuildResult | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [settings, setSettings] = useState(false);

  useEffect(() => void window.studio.providers().then(setProviders), []);
  const active = providers?.providers.find((p) => p.id === providers.active);

  useEffect(() => {
    setBuild(null);
    const stop = window.studio.onBuild(setBuild);
    void window.studio.lastBuild().then((last) => last && setBuild((b) => b ?? last));
    return stop;
  }, [project.path, project.engine]);

  useEffect(() => window.studio.onExportProgress(setProgress), []);

  async function exportFilm() {
    setNotice(null);
    setProgress(0);
    try {
      const file = await window.studio.exportFilm();
      if (file) setNotice({ text: `Exported ${file}`, error: false });
    } catch (e) {
      setNotice({ text: reason(e), error: true });
    } finally {
      setProgress(null);
    }
  }

  async function startFilm() {
    try {
      onChange(await window.studio.startFilm());
    } catch (e) {
      setNotice({ text: reason(e), error: true });
    }
  }

  return (
    <main className="project">
      <header>
        <div>
          <h1>{project.name}</h1>
          <p className="path">{project.path}</p>
        </div>
        <div className="actions">
          <button type="button" onClick={() => setSettings(true)}>
            {active ? `Model: ${active.name}` : 'Set up a model'}
          </button>
          {project.engine &&
            (progress === null ? (
              <button type="button" className="primary" onClick={exportFilm} disabled={!build?.ok}>
                Export MP4
              </button>
            ) : (
              <button type="button" onClick={() => void window.studio.cancelExport()}>
                Exporting {Math.round(progress * 100)}% · Cancel
              </button>
            ))}
          <button type="button" onClick={onClose}>
            Close project
          </button>
        </div>
      </header>
      {notice && (
        <p className={notice.error ? 'banner error' : 'banner'} role={notice.error ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
      {project.engine ? (
        <div className="workspace">
          <Assistant ready={!!active?.hasKey} onSettings={() => setSettings(true)} />
          <Preview build={build} />
          <MotionPanel />
        </div>
      ) : (
        <div className="empty">
          <p>This folder holds no film yet.</p>
          <button type="button" className="primary" onClick={startFilm}>
            Start a native film here
          </button>
        </div>
      )}
      {settings && providers && <Settings providers={providers} onChange={setProviders} onClose={() => setSettings(false)} />}
    </main>
  );
}
