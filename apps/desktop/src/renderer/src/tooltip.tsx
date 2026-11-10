// The app's tooltips: any element with `data-tip` (and, for a shortcut, `data-key`) shows its
// tip after a short rest, in one layer over everything, so no panel's edge clips it. It sits
// below the element, or above where there is no room below.

import { useEffect, useRef, useState } from 'react';

/** How long the pointer rests on a control before its tip shows. */
const DELAY_MS = 450;

type Shown = { tip: string; key: string | null; x: number; y: number; above: boolean };

export function Tooltips() {
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let current: HTMLElement | null = null;
    const hide = () => {
      clearTimeout(timer.current);
      current = null;
      setShown(null);
    };
    const over = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>('[data-tip]') ?? null;
      if (target === current) return;
      hide();
      if (!target) return;
      current = target;
      timer.current = setTimeout(() => {
        const r = target.getBoundingClientRect();
        const above = r.bottom + 40 > innerHeight;
        setShown({ tip: target.dataset.tip ?? '', key: target.dataset.key ?? null, x: r.left + r.width / 2, y: above ? r.top - 6 : r.bottom + 6, above });
      }, DELAY_MS);
    };
    addEventListener('pointerover', over);
    addEventListener('pointerdown', hide, true);
    addEventListener('keydown', hide, true);
    addEventListener('blur', hide);
    return () => {
      hide();
      removeEventListener('pointerover', over);
      removeEventListener('pointerdown', hide, true);
      removeEventListener('keydown', hide, true);
      removeEventListener('blur', hide);
    };
  }, []);

  if (!shown?.tip) return null;
  return (
    <div className={`tooltip${shown.above ? ' above' : ''}`} role="tooltip" style={{ left: shown.x, top: shown.y }}>
      {shown.tip}
      {shown.key && <kbd>{shown.key}</kbd>}
    </div>
  );
}
