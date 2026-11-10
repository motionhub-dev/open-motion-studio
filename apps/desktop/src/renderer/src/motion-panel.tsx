// The project's motions, and motionhub.dev's catalogue to take one from.

import { Loader, Search } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import type { CatalogueMotion, ProjectMotion } from '../../shared/api';
import { reason } from './reason';

export function MotionPanel() {
  const [held, setHeld] = useState<ProjectMotion[]>([]);
  const [words, setWords] = useState('');
  const [found, setFound] = useState<CatalogueMotion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => window.studio.projectMotions().then(setHeld, (e) => setError(reason(e)));
  useEffect(() => void refresh(), []);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setBusy('search');
    try {
      setFound(await window.studio.searchMotions(words));
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(null);
    }
  }

  async function use(id: string) {
    setError(null);
    setBusy(id);
    try {
      await window.studio.useMotion(id);
      await refresh();
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(null);
    }
  }

  const holds = new Set(held.map((m) => m.id));

  return (
    <>
      <div className="head">
        <h2>Motions</h2>
      </div>
      <div className="body">
        {held.length === 0 ? (
          <p className="note">None in this project yet. Take one from motionhub, or let the film draw freely.</p>
        ) : (
          <ul className="list">
            {held.map((m) => (
              <li key={m.id}>
                <strong>{m.name}</strong>
                <span className="path mono">
                  {m.id}
                  {m.version ? ` · ${m.version}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        <span className="label">motionhub</span>
        <form className="search" onSubmit={search}>
          <input type="search" value={words} placeholder="Search motions" aria-label="Search motions" onChange={(e) => setWords(e.target.value)} />
          <button type="submit" className="button" aria-label="Search" disabled={busy !== null}>
            {busy === 'search' ? <Loader size={14} className="spin" /> : <Search size={14} />}
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {found && found.length === 0 && <p className="note">No motion has all of those words.</p>}
        <ul className="cards">
          {found?.map((m) => (
            <li key={m.id} className="card">
              {m.poster && <img src={m.poster} alt="" loading="lazy" onError={(e) => (e.currentTarget.hidden = true)} />}
              <div>
                <strong>{m.name}</strong>
                <span className="path mono">
                  {m.id} · {m.version}
                </span>
                <p>{m.line}</p>
                {m.fit && <p className="path">For: {m.fit}</p>}
                <button type="button" className="button" disabled={busy !== null || holds.has(m.id)} onClick={() => use(m.id)}>
                  {holds.has(m.id) ? 'In this project' : busy === m.id ? 'Taking…' : 'Use in this project'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
