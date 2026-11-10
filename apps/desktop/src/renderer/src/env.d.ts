import type { StudioApi } from '../../shared/api';

declare global {
  interface Window {
    /** The preload bridge (src/preload/index.ts). */
    studio: StudioApi;
  }
}
