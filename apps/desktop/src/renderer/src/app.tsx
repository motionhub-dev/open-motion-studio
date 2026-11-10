// Step 1 of the order of work (docs/tech/architecture.md): open or create a project
// folder, and reopen a recent one. The project view is a placeholder until the
// native engine and the agent arrive.

import { useEffect, useState } from 'react';
import type { Project } from '../../shared/api';

/** Electron prefixes an error thrown in a handler with where it came from; the person needs only the reason. */
function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

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
      <main className="project">
        <header>
          <div>
            <h1>{project.name}</h1>
            <p className="path">{project.path}</p>
          </div>
          <button type="button" onClick={() => setProject(null)}>
            Close project
          </button>
        </header>
      </main>
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
