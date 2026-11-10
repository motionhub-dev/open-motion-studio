// The film's preview: its page in a sandboxed frame on the oms-preview: scheme, driven by
// the preview bridge protocol (src/shared/preview.ts), with a transport under it. A new
// build reloads the frame at the same time.

import { useEffect, useRef, useState } from 'react';
import type { BuildResult } from '../../shared/api';
import type { FilmInfo, FromPreview, ToPreview } from '../../shared/preview';

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export function Preview({ build }: { build: BuildResult | null }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [film, setFilm] = useState<FilmInfo | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resume = useRef(0);
  resume.current = t;

  const tell = (message: ToPreview) => frame.current?.contentWindow?.postMessage(message, '*');

  useEffect(() => {
    const onMessage = (event: MessageEvent<FromPreview>) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = event.data;
      if (message?.type === 'oms:ready') {
        setFilm(message.film);
        setError(null);
        // a rebuilt film opens where the last one was
        tell({ type: 'oms:seek', t: Math.min(resume.current, message.film.seconds) });
      } else if (message?.type === 'oms:time') {
        setT(message.t);
        setPlaying(message.playing);
      } else if (message?.type === 'oms:error') {
        setError(message.message);
      }
    };
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, []);

  useEffect(() => setError(null), [build?.version]);

  const toggle = () => tell(playing ? { type: 'oms:pause' } : { type: 'oms:play' });
  const seek = (to: number) => tell({ type: 'oms:seek', t: to });

  return (
    <div className="preview">
      <div className="stage">
        {build?.ok && (
          <iframe
            key={build.version}
            ref={frame}
            title="Film preview"
            sandbox="allow-scripts"
            src={`oms-preview://film/?v=${build.version}`}
          />
        )}
        {!build && <p className="note">Building the film…</p>}
        {build && !build.ok && (
          <pre className="problem" role="alert">
            {build.errors.join('\n')}
          </pre>
        )}
        {build?.ok && error && (
          <pre className="problem" role="alert">
            {error}
          </pre>
        )}
      </div>
      <div className="transport">
        <button type="button" onClick={toggle} disabled={!film} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          min={0}
          max={film?.seconds ?? 0}
          step={0.01}
          value={t}
          disabled={!film}
          aria-label="Time"
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="time">
          {clock(t)} / {clock(film?.seconds ?? 0)}
        </span>
      </div>
    </div>
  );
}
