// An open project: the top bar, and the workspace's panels on the ground: the assistant down
// the left, the stage in the middle, motions on the right, the transport and timeline along
// the bottom. A folder with no film yet is offered one. Keys: Space plays, ← → step a frame
// (Shift, a second), C cycles the marking tools, Esc puts one down.

import { ChevronDown, Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type BuildResult, type EngineId, MAX_MARKS, type Mark, type Project, type Providers } from '../../shared/api';
import { Assistant } from './assistant';
import { LIMITS, Splitter, useLayout } from './layout';
import { Logo } from './logo';
import { MotionPanel } from './motion-panel';
import { Stage, Transport, usePlayer } from './preview';
import { reason } from './reason';

export const ENGINE_NAMES: Record<EngineId, string> = { native: 'Film', remotion: 'Remotion', hyperframes: 'HyperFrames' };

type Toast = { text: string; error: boolean; file?: string };

/** Whether a key press belongs to a field the person is typing in. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

interface Props {
  project: Project;
  providers: Providers | null;
  onSettings(): void;
  onChange(project: Project): void;
  onClose(): void;
}

export function ProjectView({ project, providers, onSettings, onChange, onClose }: Props) {
  const [build, setBuild] = useState<BuildResult | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  /** The places marked on the picture for the next message. */
  const [marks, setMarks] = useState<Mark[]>([]);
  const [layout, setLayout] = useLayout();
  const player = usePlayer(build);
  const active = providers?.providers.find((p) => p.id === providers.active);

  useEffect(() => {
    setBuild(null);
    const stop = window.studio.onBuild(setBuild);
    void window.studio.lastBuild().then((last) => last && setBuild((b) => b ?? last));
    return stop;
  }, [project.path, project.engine]);

  useEffect(() => window.studio.onExportProgress(setProgress), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 12000 : 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === ' ') {
        event.preventDefault();
        player.toggle();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        player.step(direction * (event.shiftKey ? (player.film?.fps ?? 30) : 1));
      } else if (event.key === 'c' || event.key === 'C') {
        if (marks.length < MAX_MARKS) player.setTool(player.tool === null ? 'pick' : player.tool === 'pick' ? 'region' : null);
      } else if (event.key === 'Escape') {
        player.setTool(null);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  async function exportFilm() {
    setToast(null);
    setProgress(0);
    try {
      const file = await window.studio.exportFilm();
      if (file) setToast({ text: `Exported ${file.split(/[/\\]/).pop()}`, error: false, file });
    } catch (e) {
      setToast({ text: reason(e), error: true });
    } finally {
      setProgress(null);
    }
  }

  async function startFilm() {
    try {
      onChange(await window.studio.startFilm());
    } catch (e) {
      setToast({ text: reason(e), error: true });
    }
  }

  const status = !build ? (
    <span className="status busy">Building…</span>
  ) : build.ok ? (
    <span className="status">Built</span>
  ) : (
    <span className="status bad">Does not build</span>
  );

  const bottom = layout.folded ? 46 : layout.bottom;

  return (
    <main className="project">
      <header className="topbar">
        <button type="button" className="icon-button" aria-label="Close the project" title="Close the project" onClick={onClose}>
          <Logo />
        </button>
        <span className="name" title={project.path}>
          {project.name}
        </span>
        {project.engine && <span className="badge">{ENGINE_NAMES[project.engine]}</span>}
        {project.engine && status}
        <span className="spacer" />
        <button type="button" className="button" onClick={onSettings} title="Models">
          {active ? (
            <>
              {active.model}
              <span className="muted">· {active.name}</span>
            </>
          ) : (
            'Set up a model'
          )}
          <ChevronDown size={14} />
        </button>
        {project.engine &&
          (progress === null ? (
            <button type="button" className="button accent" onClick={exportFilm} disabled={!build?.ok}>
              <Download size={15} />
              Export
            </button>
          ) : (
            <button type="button" className="button" onClick={() => void window.studio.cancelExport()} title="Cancel the export">
              <X size={14} />
              Exporting {Math.round(progress * 100)}%
            </button>
          ))}
      </header>

      {project.engine ? (
        <div
          className="workspace"
          style={{ '--left': `${layout.left}px`, '--right': `${layout.right}px`, '--bottom': `${bottom}px` } as React.CSSProperties}
        >
          <section className="sheet assistant" aria-label="Assistant">
            <Assistant
              ready={!!active?.ready}
              engine={project.engine}
              onSettings={onSettings}
              marks={marks}
              onRemoveMark={(i) => setMarks((m) => m.filter((_, j) => j !== i))}
              onSent={() => setMarks([])}
              onSeek={(t) => {
                if (player.playing) player.tell({ type: 'oms:pause' });
                player.seek(t);
              }}
            />
            <Splitter axis="x" value={layout.left} limits={LIMITS.left} onChange={(left) => setLayout({ left })} label="Resize the assistant" style={{ right: -7 }} />
          </section>
          <Stage
            player={player}
            build={build}
            marks={marks}
            onMark={(mark) => setMarks((m) => (m.length < MAX_MARKS ? [...m, mark] : m))}
          />
          <aside className="sheet side" aria-label="Motions">
            <MotionPanel />
            <Splitter axis="x" sign={-1} value={layout.right} limits={LIMITS.right} onChange={(right) => setLayout({ right })} label="Resize the side panel" style={{ left: -7 }} />
          </aside>
          <section className="sheet transport-sheet" aria-label="Transport and timeline">
            {!layout.folded && (
              <Splitter axis="y" sign={-1} value={layout.bottom} limits={LIMITS.bottom} onChange={(value) => setLayout({ bottom: value })} label="Resize the timeline" style={{ top: -7 }} />
            )}
            <Transport player={player} marks={marks} folded={layout.folded} onFold={(folded) => setLayout({ folded })} />
          </section>
        </div>
      ) : (
        <div className="empty">
          <p>This folder holds no film yet.</p>
          <button type="button" className="button primary" onClick={startFilm}>
            Start a film here
          </button>
        </div>
      )}

      {toast && (
        <div className={`toast${toast.error ? ' bad' : ''}`} role={toast.error ? 'alert' : 'status'}>
          <span>{toast.text}</span>
          {toast.file && (
            <button type="button" className="button" onClick={() => void window.studio.showExported()}>
              Show in folder
            </button>
          )}
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setToast(null)} style={{ color: 'inherit' }}>
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  );
}
