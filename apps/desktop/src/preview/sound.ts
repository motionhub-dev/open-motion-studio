// The preview's sound: a film's <Sound>s played through Web Audio while the preview plays (ADR 0010). Each file is
// fetched from the oms-preview: scheme and decoded once; playing from a time schedules every sound that is heard from
// there, with its volume and fades as gain ramps, and the audio clock becomes the preview's clock, so the picture
// follows what is heard. A file that does not load is said in the console and left silent.

import { type FilmSound, soundFades, soundGain, soundPlace, soundRegion, soundSpan } from '../shared/sound';

export class FilmAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private files = new Map<string, Promise<AudioBuffer | null>>();
  private playing: AudioBufferSourceNode[] = [];
  /** Where the film was when the sounds started, and the audio clock then. */
  private base: { t: number; clock: number } | null = null;
  private muted = false;

  constructor(private readonly sounds: FilmSound[]) {
    for (const sound of sounds) this.file(sound.src);
  }

  get silent(): boolean {
    return this.sounds.length === 0;
  }

  private audio(): { context: AudioContext; master: GainNode } {
    if (!this.context || !this.master) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.context.destination);
    }
    return { context: this.context, master: this.master };
  }

  private file(src: string): Promise<AudioBuffer | null> {
    let loading = this.files.get(src);
    if (!loading) {
      const place = soundPlace(src);
      loading = !place
        ? Promise.resolve(null).then(() => (console.warn(`<Sound src="${src}">: not a file in the project`), null))
        : fetch(`${place.root}/${place.path.split('/').map(encodeURIComponent).join('/')}`)
            .then((response) => {
              if (!response.ok) throw new Error(`${response.status}`);
              return response.arrayBuffer();
            })
            .then((bytes) => this.audio().context.decodeAudioData(bytes))
            .catch((error: unknown) => {
              console.warn(`<Sound src="${src}"> did not load:`, error);
              return null;
            });
      this.files.set(src, loading);
    }
    return loading;
  }

  /** Plays every sound heard from film time `t`; resolves once they are scheduled. */
  async play(t: number): Promise<void> {
    this.stop();
    const { context, master } = this.audio();
    await context.resume();
    const buffers = await Promise.all(this.sounds.map((sound) => this.file(sound.src)));
    // A little ahead, so every sound starts together on the clock.
    const start = context.currentTime + 0.05;
    this.base = { t, clock: start };
    this.sounds.forEach((sound, i) => {
      const buffer = buffers[i];
      if (!buffer) return;
      const span = soundSpan(sound, buffer.duration);
      const into = Math.max(0, t - sound.at);
      if (span <= 0 || into >= span) return;
      const region = soundRegion(sound, buffer.duration);
      const when = start + Math.max(0, sound.at - t);
      const source = context.createBufferSource();
      source.buffer = buffer;
      if (sound.loop) {
        source.loop = true;
        source.loopStart = sound.trim;
        source.loopEnd = sound.trim + region;
      }
      const gain = context.createGain();
      // The gain's ramps from where it is heard to the end of its span: the points where its fades turn.
      const { fadeIn, fadeOut } = soundFades(sound, span);
      const turns = [0, fadeIn, span - fadeOut, span].filter((u) => u > into && u <= span);
      gain.gain.setValueAtTime(soundGain(sound, span, into), when);
      for (const u of turns) gain.gain.linearRampToValueAtTime(soundGain(sound, span, u), when + (u - into));
      source.connect(gain).connect(master);
      const offset = sound.trim + (sound.loop && region > 0 ? into % region : into);
      source.start(when, offset);
      source.stop(when + (span - into));
      this.playing.push(source);
    });
  }

  /** The film's time on the audio clock while it plays, or null. */
  now(): number | null {
    return this.base && this.context ? this.base.t + Math.max(0, this.context.currentTime - this.base.clock) : null;
  }

  stop(): void {
    for (const source of this.playing) source.stop();
    this.playing = [];
    this.base = null;
  }

  mute(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }
}
