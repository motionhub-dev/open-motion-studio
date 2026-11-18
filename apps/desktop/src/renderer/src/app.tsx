// The launcher (start a film in a new folder, open a folder, reopen a recent project) and the
// open project. Global settings belongs to both: on Home it is one of Home's pages, its sections in Home's sidebar; over
// the open project it is a page of its own, which preserves the editor beneath it.

import { Home } from './home';
import { SystemMessage, Translated, usePreferences } from './preferences';
import { useEffect, useState } from 'react';
import type { Example, HarnessView, Project, ProjectTask, Providers, VoiceKind, WorkspaceSettings } from '../../shared/api';
import { ProjectView } from './project-view';
import { reason } from './reason';
import { Settings } from './settings';

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  /** Models, when open: on the providers, or on one of the person's own coding agents. */
  const [settings, setSettings] = useState<false | { agent?: HarnessView['kind']; voice?: VoiceKind; workspace?: boolean; models?: boolean }>(false);
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);
  /** Counts the times Models closed, so the open project asks again how its agent runs. */
  const [modelsClosed, setModelsClosed] = useState(0);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  useEffect(() => {
    window.studio.currentProject().then(setProject, (e) => setError(reason(e)));
    const stop = window.studio.onTasks(setTasks);
    window.studio.tasks().then(setTasks, (e) => setError(reason(e)));
    return stop;
  }, []);

  useEffect(() => {
    const mac = navigator.platform.startsWith('Mac');
    const shortcut = (event: KeyboardEvent) => {
      const mod = mac ? event.metaKey : event.ctrlKey;
      if (!mod || event.altKey) return;
      const key = event.key.toLowerCase();
      // A new film, a folder to open and Settings, from Home or a project; on a Mac its File menu has Shift+N.
      const action =
        key === 'n' && event.shiftKey
          ? mac
            ? null
            : () => window.studio.newWindow().catch((e) => setError(reason(e)))
          : event.shiftKey
            ? null
            : key === 'n'
              ? () => void run(() => window.studio.createProject())
              : key === 'o'
                ? () => void run(window.studio.openProject)
                : key === ','
                  ? () => setSettings((open) => open || {})
                  : null;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) action();
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
    };
    refresh();
    const stop = window.studio.onSettingsChanged(() => { refresh(); setModelsClosed(n => n + 1); });
    window.addEventListener('focus', refresh);
    return () => { stop(); window.removeEventListener('focus', refresh); };
  }, []);


  /** Runs a Home or shortcut action, showing what went wrong; whether it went. */
  async function run(action: () => Promise<Project | null>): Promise<boolean> {
    setError(null);
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      setError(reason(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const settingsPage = settings && providers && (
    <Settings
      providers={providers}
      agent={settings.agent}
      voice={settings.voice}
      workspace={settings.workspace}
      models={settings.models}
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
        <div style={{ display: settings && providers ? 'none' : 'contents' }}>
        <ProjectView
          settingsOpen={!!settings}
          project={project}
          providers={providers}
          onSettings={(agent) => setSettings(agent ? { agent } : { models: true })}
          onGlobalSettings={() => setSettings({})}
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
        </div>
        {error && (
          <div className="toast bad" role="alert">
            {error}
            <button className="quiet" onClick={() => setError(null)}>
              <Translated text="Dismiss" />
            </button>
          </div>
        )}
        {settingsPage}
      </>
    );
  }

  return (
    <Home
      revision={modelsClosed}
      providers={providers}
      workspace={workspace}
      tasks={tasks}
      examples={examples}
      busy={busy}
      error={error}
      onAction={run}
      settings={settings || null}
      onSettingsShown={() => setSettings(false)}
      onSettingsLeft={() => {
        window.studio.workspace().then(setWorkspace, (e) => setError(reason(e)));
        setModelsClosed((n) => n + 1);
      }}
      onProviders={setProviders}
    />
  );
}
