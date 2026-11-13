// motionhub's mark (brand/logo/mark.svg in motionhub-dev/motions): a ball in flight with its in-betweens, flat
// discs stepping up in size and strength, rising up and to the right. It is drawn in `--mark` alone, and is
// changed in the brand first.

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 56) / 96} viewBox="0 0 96 56" role="img" aria-label="motionhub">
      <circle cx="10" cy="40" r="5" fill="var(--mark)" fillOpacity=".2" />
      <circle cx="27" cy="31" r="7" fill="var(--mark)" fillOpacity=".38" />
      <circle cx="47" cy="24" r="9" fill="var(--mark)" fillOpacity=".62" />
      <circle cx="72" cy="21" r="14" fill="var(--mark)" />
    </svg>
  );
}
