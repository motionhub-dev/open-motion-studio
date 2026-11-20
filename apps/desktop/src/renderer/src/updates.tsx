import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { StudioUpdate } from '../../shared/api';
import { usePreferences } from './preferences';

const UpdateContext = createContext<StudioUpdate | null>(null);

export function InstalledVersion() {
  const version = useContext(UpdateContext)?.installed;
  // A version is an identifier, never translated: one string, not a "v" the translation check reads as a label.
  return version ? <small className="installed-version">{`v${version}`}</small> : null;
}

function DownloadUpdate() {
  const { t } = usePreferences();
  const [failed, setFailed] = useState(false);
  return <>
    <button className="button" onClick={() => {
      setFailed(false);
      void window.studio.openUpdateDownload().catch(() => setFailed(true));
    }}>{t('Download update')}</button>
    {failed && <small role="alert">{t('Open openmotion.studio in your browser to download the update.')}</small>}
  </>;
}

function UpdateAction({ state }: { state: StudioUpdate }) {
  const { t } = usePreferences();
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (state.status === 'downloading') return <span>{t('Downloading update…')}</span>;
  if (state.status === 'installing') return <span>{t('Preparing to restart…')}</span>;
  if (state.status !== 'ready') return <DownloadUpdate />;
  return <>
    <button className="button" disabled={pending} onClick={async () => {
      setPending(true);
      setBlocked(null);
      setFailed(false);
      try { setBlocked(await window.studio.installUpdate()); }
      catch { setFailed(true); }
      finally { setPending(false); }
    }}>{t('Restart to update')}</button>
    {blocked && <small role="status">{t('Finish active work and save or discard drafts in {name}, then try again.', { name: blocked })}</small>}
    {failed && <small role="alert">{t('Could not prepare the update. Check for updates to try again.')}</small>}
  </>;
}

declare global {
  interface Window {
    studioUpdateLock?: (locked: boolean) => boolean;
  }
}

export function StudioUpdateProvider({ children }: { children: ReactNode }) {
  const { t } = usePreferences();
  useEffect(() => {
    window.studioUpdateLock = locked => {
      if (locked && document.querySelector('[data-update-draft="true"]')) return false;
      document.body.inert = locked;
      return true;
    };
    return () => {
      delete window.studioUpdateLock;
      document.body.inert = false;
    };
  }, []);
  const [state, setState] = useState<StudioUpdate | null>(null);
  useEffect(() => {
    let acceptSnapshot = true;
    const stop = window.studio.onUpdateChanged(next => {
      acceptSnapshot = false;
      setState(next);
    });
    void window.studio.updateStatus().then(next => { if (acceptSnapshot) setState(next); }).catch(() => {});
    return () => { acceptSnapshot = false; stop(); };
  }, []);
  const version = state?.available;
  return <UpdateContext.Provider value={state}>
    {children}
    {version && version !== state.dismissed && <aside className="toast update-notice" aria-label={t('Studio updates')}>
      <span role="status">{t('OpenMotionStudio {version} is available.', { version })}</span>
      <UpdateAction state={state} />
      {state.status === 'download-error' && <small role="status">{t('Could not prepare the update. Check for updates to try again.')}</small>}
      <button className="button" onClick={() => void window.studio.dismissUpdate(version)}>{t('Later')}</button>
    </aside>}
  </UpdateContext.Provider>;
}

export function UpdateSettings() {
  const { t, preferences, ready, save } = usePreferences();
  const state = useContext(UpdateContext);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  return <section className="provider-form general-settings" aria-labelledby="updates-heading">
    <h2 id="updates-heading">{t('Studio updates')}</h2>
    {state && <p className="note">{t('Installed version: {version}', { version: state.installed })}</p>}
    <label className="preference-row">
      <span><strong>{t('Automatically check for updates')}</strong></span>
      <input type="checkbox" checked={preferences.checkUpdatesAutomatically !== false} disabled={!ready || saving}
        onChange={async event => {
          const enabled = event.target.checked;
          setFailed(false);
          setSaving(true);
          try { await save({ checkUpdatesAutomatically: enabled }); }
          catch { setFailed(true); }
          finally { setSaving(false); }
        }} />
    </label>
    <div className="update-actions">
      <button className="button" disabled={state?.status === 'checking' || state?.status === 'downloading' || state?.status === 'installing'} onClick={() => {
        setFailed(false);
        void window.studio.checkForUpdates().catch(() => setFailed(true));
      }}>{state?.status === 'checking' ? t('Checking for updates…') : t('Check for updates')}</button>
      {state?.available && <UpdateAction state={state} />}
    </div>
    <div role="status">
      {state?.available && <p>{t('OpenMotionStudio {version} is available.', { version: state.available })}</p>}
      {state?.status === 'checked' && !state.available && <p>{t('You have the latest version.')}</p>}
      {state?.status === 'download-error' && <p>{t('Could not prepare the update. Check for updates to try again.')}</p>}
      {state?.status === 'error' && <p>{t('Could not check for updates. Try again later.')}</p>}
      {failed && <p>{t('Could not complete this action. Please try again.')}</p>}
    </div>
  </section>;
}
