import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { Tooltips } from './tooltip';
import './styles.css';

// A Mac draws its window buttons over the top bar, which leaves room for them (styles.css).
if (navigator.userAgent.includes('Macintosh')) document.documentElement.dataset.platform = 'mac';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Tooltips />
  </StrictMode>,
);
