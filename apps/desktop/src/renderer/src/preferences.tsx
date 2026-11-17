// The app-wide preferences in every window: the theme on <html>, the interface language, and `t` to translate the
// Studio's own words with. Project content, model replies and identifiers are never passed through `t`. A change made
// in one window reaches the others through the main process.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { StudioPreferences } from '../../shared/api';
import { translate, translateSystem, type MessageValues } from '../../shared/i18n';
import { reason } from './reason';

const defaults: StudioPreferences = { theme: 'system', language: 'system' };

interface Preferences {
  /** Whether the interface is in Chinese, after following the system's language. */
  chinese: boolean;
  preferences: StudioPreferences;
  /** The saved preferences have been read; before that, `preferences` holds the defaults. */
  ready: boolean;
  /** One of the Studio's messages, in the interface language, with its `{name}` fields filled. */
  t(text: string, values?: MessageValues): string;
  /** A message the Studio generated (an activity, an error); anything it does not know is kept verbatim. */
  system(text: string): string;
  save(input: Partial<StudioPreferences>): Promise<void>;
}

const PreferencesContext = createContext<Preferences>({
  chinese: false,
  preferences: defaults,
  ready: false,
  t: (text, values) => translate(text, false, values),
  system: (text) => text,
  save: async () => {},
});

export const usePreferences = (): Preferences => useContext(PreferencesContext);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [systemLanguage, setSystemLanguage] = useState(navigator.language);

  function load() {
    return window.studio.preferences().then(
      (next) => {
        setPreferences(next);
        setReady(true);
        setError('');
      },
      (e) => setError(reason(e)),
    );
  }

  useEffect(() => {
    let live = true;
    const refresh = () => live && void load();
    refresh();
    const stop = window.studio.onPreferencesChanged(refresh);
    const language = () => setSystemLanguage(navigator.language);
    window.addEventListener('languagechange', language);
    return () => {
      live = false;
      stop();
      window.removeEventListener('languagechange', language);
    };
  }, []);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = preferences.theme === 'system' ? (media.matches ? 'dark' : 'light') : preferences.theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preferences.theme]);

  const chinese = (preferences.language === 'system' ? systemLanguage : preferences.language).toLowerCase().startsWith('zh');
  useEffect(() => {
    document.documentElement.lang = chinese ? 'zh-CN' : 'en';
  }, [chinese]);

  const t = (text: string, values?: MessageValues) => translate(text, chinese, values);
  async function save(input: Partial<StudioPreferences>) {
    setPreferences(await window.studio.savePreferences(input));
  }

  return (
    <PreferencesContext.Provider value={{ chinese, preferences, ready, t, system: (text) => translateSystem(text, chinese), save }}>
      {children}
      {error && (
        <div className="toast bad" role="alert">
          {t('Unable to load preferences')}: {error}
          <button className="quiet" onClick={() => void load()}>
            {t('Retry')}
          </button>
        </div>
      )}
    </PreferencesContext.Provider>
  );
}

/** A Studio message as a component, for a label in markup that is not inside a component using `t`. */
export function Translated({ text }: { text: string }) {
  return <>{usePreferences().t(text)}</>;
}

/**
 * A message the Studio generated. In Chinese, an English error the Studio has no translation for (one from the
 * system, a provider or a tool) is summarized, with its exact text a click away for a bug report.
 */
export function SystemMessage({ text, error = false }: { text: string; error?: boolean }) {
  const { t, system, chinese } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const localized = system(text);
  const untranslatedEnglish = localized === text && /[A-Za-z]{3}/.test(text) && !/[㐀-鿿]/.test(text);
  if (!chinese || !error || !untranslatedEnglish) return <>{localized}</>;
  return (
    <span className="system-message">
      {t('Operation could not be completed.')}{' '}
      <button type="button" className="quiet" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {t(expanded ? 'Hide details' : 'Technical details')}
      </button>
      {expanded && <span className="system-message-detail mono">{text}</span>}
    </span>
  );
}
