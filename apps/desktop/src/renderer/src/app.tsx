// The home screen (open or create a project, reopen a recent one) and the open project.

import { useEffect, useState } from 'react';
import type { Project } from '../../shared/api';
import { ProjectView } from './project-view';
import { reason } from './reason';

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [recents, setRecents] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    }
  }

  if (project) {
    return (
      <ProjectView
        project={project}
        onChange={setProject}
        onClose={() => {
          void window.studio.closeProject();
          setProject(null);
        }}
      />
    );
  }

  return (
    <main className="home">
      <h1>Open Motion Studio</h1>
      <div className="actions">
        <button type="button" className="primary" onClick={() => run(window.studio.createProject)}>
          New project
        </button>
        <button type="button" onClick={() => run(window.studio.openProject)}>
          Open folder
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {recents.length > 0 && (
        <section>
          <h2>Recent</h2>
          <ul className="recents">
            {recents.map((recent) => (
              <li key={recent.path}>
                <button type="button" onClick={() => run(() => window.studio.openRecent(recent.path))}>
                  <span>{recent.name}</span>
                  <span className="path">{recent.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
