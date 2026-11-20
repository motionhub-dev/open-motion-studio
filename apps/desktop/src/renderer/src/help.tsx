import { useState } from 'react';
import { Folder } from 'lucide-react';
import { SystemMessage, usePreferences } from './preferences';
import { reason } from './reason';

const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl';
const shortcuts = [
  ['New film', [mod, 'N']],
  ['Open project', [mod, 'O']],
  ['Settings', [mod, ',']],
  ['Search projects', ['/']],
  ['Play or pause', ['Space']],
  ['Show editor shortcuts', ['?']],
] as const;

export function HelpPage() {
  const { t } = usePreferences();
  const [error, setError] = useState('');

  return (
    <div className="home-help">
      <h1 className="home-title">{t('Help')}</h1>
      <section aria-labelledby="help-start">
        <h2 id="help-start">{t('Getting started')}</h2>
        <ol>
          <li>{t('Start with a template or describe a new film on Home. Templates create independent copies in your default workspace, which you can change under Settings → General.')}</li>
          <li>{t('In the editor, use the outline and timeline to find a scene. Select a layer or mark an area in the preview to show the assistant what to change.')}</li>
          <li>{t('Play the film and review any findings before exporting. Use History to restore an earlier version of source files changed by the assistant.')}</li>
        </ol>
        <p>{t('Projects are stored in folders on your computer. Active tasks can keep running in the tray after you close a project window.')}</p>
      </section>
      <section aria-labelledby="help-troubleshooting">
        <h2 id="help-troubleshooting">{t('Troubleshooting')}</h2>
        <details>
          <summary>{t('The assistant cannot connect')}</summary>
          <p>{t('For the built-in assistant, go to Model Providers and test the active provider. Check the endpoint, model name and API key. If you use Codex or Claude Code, check its installation and sign-in status under Local Agents.')}</p>
        </details>
        <details>
          <summary>{t('The preview or export fails')}</summary>
          <p>{t('Read the error shown in the preview or export review. If the editor offers to send the issue to the assistant, use that action to include the error in your request. Run the check again after the next successful build.')}</p>
        </details>
      </section>
      <section aria-labelledby="help-shortcuts">
        <h2 id="help-shortcuts">{t('Keyboard shortcuts')}</h2>
        <dl>
          {shortcuts.map(([label, keys]) => (
            <div key={label}>
              <dt>{t(label)}</dt>
              <dd>{keys.map(key => <kbd key={key}>{key}</kbd>)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="help-diagnostics">
        <h2 id="help-diagnostics">{t('Diagnostics')}</h2>
        <p>{t('Local runtime logs help diagnose startup, build and export failures.')}</p>
        <button className="button" onClick={() => {
          setError('');
          void window.studio.showLogs().catch(e => setError(reason(e)));
        }}>
          <Folder size={16} aria-hidden="true" /> {t('Open logs folder')}
        </button>
        {error && <p className="error" role="alert"><SystemMessage text={error} error /></p>}
      </section>
    </div>
  );
}
