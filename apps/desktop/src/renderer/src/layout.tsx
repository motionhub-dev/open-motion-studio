// The workspace's sizes: the assistant's width, the side panel's and the timeline's height,
// changed by dragging the splitters between panels and kept in this browser's storage (the
// app's own state, in its userData) for the next time. Nothing here is a project's.

import { type PointerEvent, useEffect, useRef, useState } from 'react';

export interface Layout {
  left: number;
  assistant: boolean;
  side: boolean;
  right: number;
  bottom: number;
  /** The timeline folded to its head. */
  folded: boolean;
}

const KEY = 'oms.layout';
const DEFAULT: Layout = { left: 360, right: 320, bottom: 240, folded: false, assistant: true, side: true };
/** The right panel is never narrower than its four tabs. The timeline's height is the least it has: it takes what the stage leaves. */
export const LIMITS = { left: [280, 560], right: [280, 480], bottom: [120, 420] } as const;

function stored(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Layout>;
    const size = (key: 'left' | 'right' | 'bottom') =>
      typeof raw?.[key] === 'number' && Number.isFinite(raw[key])
        ? Math.max(LIMITS[key][0], Math.min(LIMITS[key][1], raw[key]))
        : DEFAULT[key];
    return {
      left: size('left'),
      right: size('right'),
      bottom: size('bottom'),
      folded: typeof raw?.folded === 'boolean' ? raw.folded : DEFAULT.folded,
      assistant: typeof raw?.assistant === 'boolean' ? raw.assistant : true,
      side: typeof raw?.side === 'boolean' ? raw.side : true,
    };
  } catch {
    return DEFAULT;
  }
}

export function useLayout(): [Layout, (change: Partial<Layout>) => void] {
  const [layout, setLayout] = useState(stored);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(layout));
    } catch {
      // Storage refused: the layout still works for this session.
    }
  }, [layout]);
  return [layout, (change) => setLayout((current) => ({ ...current, ...change }))];
}

const clamp = (value: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, value));

/**
 * A handle between two panels. Dragging it moves `value` by the pointer's travel along its
 * axis (`sign` -1 where growing the panel means moving left or up), within `limits`.
 */
export function Splitter({
  axis,
  value,
  limits,
  sign = 1,
  onChange,
  label,
  style,
}: {
  axis: 'x' | 'y';
  value: number;
  limits: readonly [number, number];
  sign?: 1 | -1;
  onChange(value: number): void;
  label: string;
  style: React.CSSProperties;
}) {
  const start = useRef<{ at: number; value: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const position = (event: PointerEvent) => (axis === 'x' ? event.clientX : event.clientY);

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={limits[0]}
      aria-valuemax={limits[1]}
      tabIndex={0}
      className={`splitter ${axis === 'x' ? 'vertical' : 'horizontal'}${dragging ? ' dragging' : ''}`}
      style={style}
      onPointerDown={(event) => {
        (event.target as Element).setPointerCapture(event.pointerId);
        start.current = { at: position(event), value };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        onChange(clamp(start.current.value + sign * (position(event) - start.current.at), limits));
      }}
      onPointerUp={() => {
        start.current = null;
        setDragging(false);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 40 : 10;
        const grow: Record<string, number> = axis === 'x' ? { ArrowRight: sign, ArrowLeft: -sign } : { ArrowDown: sign, ArrowUp: -sign };
        const direction = grow[event.key];
        if (direction) {
          event.preventDefault();
          onChange(clamp(value + direction * step, limits));
        }
      }}
    />
  );
}
