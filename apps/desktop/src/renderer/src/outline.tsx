import { Layers, MessageSquare, Play, ScrollText } from 'lucide-react';
import type { Reference } from '../../shared/api';
import type { FilmInfo, SceneInfo } from '../../shared/preview';
import { timecode } from './preview';
import { changeKey } from './activity';

export const sceneTitle = (scene: SceneInfo): string => scene.lines[0]?.text || scene.id.replace(/[-_]/g, ' ');
export const sameSelection = (a: Reference | null, b: Reference): boolean =>
  !!a && a.kind === b.kind && a.scene === b.scene && a.layer === b.layer && a.line === b.line;
export function Outline({
  film,
  selected,
  fresh,
  onSelect,
  onReference,
  onPlay,
}: {
  film: FilmInfo | null;
  selected: Reference | null;
  /** What the agent's last turn changed (changeKey), lit for a moment. */
  fresh: Set<string>;
  onSelect(ref: Reference): void;
  onReference(ref: Reference): void;
  onPlay(start: number, end: number): void;
}) {
  if (!film)
    return (
      <div className="body">
        <p className="note">Your film’s scenes and layers will appear here once the preview is ready.</p>
      </div>
    );
  const row = (ref: Reference, secondary: string, icon: React.ReactNode) => (
    <div className={`outline-row${sameSelection(selected, ref) ? ' selected' : ''}${fresh.has(changeKey(ref)) ? ' fresh' : ''}`}>
      <button className="outline-pick" aria-pressed={sameSelection(selected, ref)} onClick={() => onSelect(ref)}>
        {icon}
        <span>
          <strong>{ref.label}</strong>
          <small>{secondary}</small>
        </span>
      </button>
      <button
        className="icon-button row-action"
        aria-label={`Ask about ${ref.label}`}
        data-tip="Add to your message"
        onClick={() => {
          onSelect(ref);
          onReference(ref);
        }}
      >
        <MessageSquare size={13} />
      </button>
    </div>
  );
  return (
    <div className="body outline-panel">
      <div className="panel-intro">
        <span className="eyebrow">The shape of your film</span>
        <p>Find a scene, inspect a layer, or bring it into the conversation.</p>
      </div>
      {film.layers.length > 0 && (
        <section>
          <h3 className="label">Across the film</h3>
          {film.layers.map((layer) => (
            <div key={layer.id}>
              {row({ kind: 'layer', label: layer.id, layer: layer.id, time: 0 }, 'Global layer', <Layers size={14} />)}
            </div>
          ))}
        </section>
      )}
      {film.scenes.map((scene, index) => (
        <section key={scene.id} className="outline-scene">
          <div className="outline-scene-head">
            <span className="eyebrow">Scene {String(index + 1).padStart(2, '0')}</span>
            <button
              className="icon-button"
              aria-label={`Play ${sceneTitle(scene)}`}
              data-tip="Play this scene"
              onClick={() => onPlay(scene.start, scene.start + scene.duration)}
            >
              <Play size={13} />
            </button>
          </div>
          {row(
            { kind: 'scene', label: sceneTitle(scene), scene: scene.id, time: scene.start },
            `${timecode(scene.start)} · ${scene.duration.toFixed(1)} s`,
            <span className="outline-number">{index + 1}</span>,
          )}
          <div className="outline-children">
            {scene.layers.map((layer) => (
              <div key={layer.id}>
                {row(
                  {
                    kind: 'layer',
                    label: layer.id.replace(/[-_]/g, ' '),
                    scene: scene.id,
                    layer: layer.id,
                    time: scene.start + Math.min(0.5, scene.duration / 2),
                  },
                  `${layer.w} × ${layer.h}`,
                  <Layers size={13} />,
                )}
              </div>
            ))}
            {scene.lines.map((line) => (
              <div key={line.id}>
                {row(
                  { kind: 'line', label: line.text, scene: scene.id, line: line.id, time: scene.start },
                  'Script · read only',
                  <ScrollText size={13} />,
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
