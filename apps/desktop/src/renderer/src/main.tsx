import { PreferencesProvider, Translated } from './preferences';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { Tooltips } from './tooltip';
import './styles.css';

// A Mac draws its window buttons over the top bar, which leaves room for them (styles.css).
if (navigator.userAgent.includes('Macintosh')) document.documentElement.dataset.platform = 'mac';

class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="empty" role="alert">
          <h1><Translated text="The workspace needs a fresh start." /></h1>
          <p className="note"><Translated text="Your files are still on disk. Reload the workspace to continue." /></p>
          <button className="button primary" onClick={() => location.reload()}>
            <Translated text="Reload workspace" />
          </button>
        </main>
      );
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
    <WorkspaceBoundary>
      <App />
    </WorkspaceBoundary>
    <Tooltips />
    </PreferencesProvider>
  </StrictMode>,
);
