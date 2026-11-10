// motionhub's mark: a ball in flight with its in-betweens, rising up and to the right.
// It always leans that way, and is never recoloured beyond the theme's accent.

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 20) / 26} viewBox="0 0 26 20" role="img" aria-label="motionhub">
      <circle cx="4" cy="16" r="2.5" fill="var(--accent)" opacity=".25" />
      <circle cx="10" cy="11.5" r="3" fill="var(--accent)" opacity=".45" />
      <circle cx="16" cy="8" r="3.5" fill="var(--accent)" opacity=".7" />
      <circle cx="22" cy="5" r="4" fill="var(--accent)" />
    </svg>
  );
}
