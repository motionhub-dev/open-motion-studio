// The inspector: the element last picked on the picture, as the film's page reported it — its
// place among its ancestors, the moment, where it is drawn in the film's pixels, its words, how
// it looks and its attributes. A region dragged out is shown by its box alone.

import { Crosshair } from 'lucide-react';
import type { Mark } from '../../shared/api';
import type { FilmInfo } from '../../shared/preview';
import { timecode } from './preview';


function Row({ name, value }: { name: string; value: string }) {
  return (
    <>
      <dt>{name}</dt>
      <dd className="mono">
        {name.endsWith('color') && <span className="swatch-dot" style={{ background: value }} />}
        {value}
      </dd>
    </>
  );
}

export function Inspector({ mark, film, onSeek }: { mark: Mark | null; film: FilmInfo | null; onSeek(t: number): void }) {
  if (!mark) {
    return (
      <div className="body inspector">
        <p className="note">
          <Crosshair size={14} /> Pick an element on the picture (<kbd>C</kbd>) to see it here.
        </p>
      </div>
    );
  }
  const px = (fraction: number, size: number | undefined) => (size ? `${Math.round(fraction * size)}` : `${Math.round(fraction * 100)}%`);
  const { box, element } = mark;
  const name = element ? (element.path.split(' > ').pop() ?? element.path) : 'A region';
  return (
    <div className="body inspector">
      <div className="inspected">
        <strong className="mono">{name}</strong>
        {element && element.path !== name && <span className="path mono">{element.path}</span>}
      </div>
      <dl>
        <dt>At</dt>
        <dd>
          <button type="button" className="quiet mono" onClick={() => onSeek(mark.t)} data-tip="Go to this moment">
            {timecode(mark.t)}
          </button>
        </dd>
        <Row name="Position" value={`${px(box.x, film?.width)}, ${px(box.y, film?.height)}`} />
        <Row name="Size" value={`${px(box.w, film?.width)} × ${px(box.h, film?.height)}`} />
        {element?.text && <Row name="Text" value={element.text} />}
      </dl>
      {element && Object.keys(element.styles).length > 0 && (
        <>
          <span className="label">Styles</span>
          <dl>
            {Object.entries(element.styles).map(([k, v]) => (
              <Row key={k} name={k} value={v} />
            ))}
          </dl>
        </>
      )}
      {element && Object.keys(element.attributes).length > 0 && (
        <>
          <span className="label">Attributes</span>
          <dl>
            {Object.entries(element.attributes).map(([k, v]) => (
              <Row key={k} name={k} value={v} />
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
