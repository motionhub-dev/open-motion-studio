import type { StudioUpdate } from '../shared/api';

const releaseApi = 'https://api.github.com/repos/motionhub-dev/open-motion-studio/releases/latest';
export const downloads = 'https://openmotion.studio/#get';

// Public Studio release tags are vMAJOR.MINOR.PATCH. Ignore draft and prerelease metadata.
function newerStableVersion(installed: string, release: unknown): string | null {
  if (!release || typeof release !== 'object' || !('tag_name' in release)) throw new Error('Invalid Studio release');
  if (('draft' in release && release.draft) || ('prerelease' in release && release.prerelease)) return null;
  const stable = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  const next = typeof release.tag_name === 'string' && stable.exec(release.tag_name);
  const current = stable.exec('v' + installed.split(/[+-]/, 1)[0]);
  if (!next || !current) throw new Error('Invalid Studio release version');
  for (let i = 1; i <= 3; i++) {
    const diff = BigInt(next[i]!) - BigInt(current[i]!);
    if (diff !== 0n) return diff > 0n ? next[0].slice(1) : null;
  }
  return installed.split('+', 1)[0]!.includes('-') ? next[0].slice(1) : null;
}

type ReleaseRequest = (url: string, options: {
  headers: Record<string, string>;
  credentials: 'omit';
  signal: AbortSignal;
}) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export class StudioUpdates {
  state: StudioUpdate;
  private pending?: Promise<void>;

  constructor(installed: string, private request: ReleaseRequest, private notify: (state: StudioUpdate) => void) {
    this.state = { installed, status: 'idle', available: null, dismissed: null };
  }

  private set(change: Partial<StudioUpdate>) {
    this.state = { ...this.state, ...change };
    this.notify(this.state);
  }

  dismiss(version: string) {
    if (version === this.state.available) this.set({ dismissed: version });
  }

  check(): Promise<void> {
    if (!this.pending) this.pending = this.refresh().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async refresh() {
    this.set({ status: 'checking' });
    try {
      const response = await this.request(releaseApi, {
        headers: { Accept: 'application/vnd.github+json' },
        credentials: 'omit',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Release service unavailable');
      const available = newerStableVersion(this.state.installed, await response.json());
      this.set({ status: 'checked', available });
    } catch {
      this.set({ status: 'error' });
    }
  }
}
