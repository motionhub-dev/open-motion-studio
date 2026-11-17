// The film's voice (ADR 0012), in the project tools beside the stage. Until it can speak: which provider to speak
// through, each opening its guide in Settings; then the film's voice, which the agent writes (the Studio never edits
// film.tsx). Then the voice and its provider, every line by scene, voiced or waiting, each played in place in the
// film, and voicing those waiting with its progress line by line. Only lines whose words changed are spoken, and paid
// for, again. A line's words are the film's own and are never translated.

import { SystemMessage, usePreferences } from './preferences';
import { Check, Loader, Mic, Play, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { VoicedFilm, VoiceKind, VoiceView } from '../../shared/api';
import type { FilmInfo } from '../../shared/preview';
import { reason } from './reason';

const PROVIDERS: { kind: VoiceKind; name: string; note: string }[] = [
  { kind: 'azure', name: 'Azure', note: 'Hundreds of voices in every language; a free tier' },
  { kind: 'elevenlabs', name: 'ElevenLabs', note: 'The most expressive voices; a free plan' },
  { kind: 'minimax', name: 'MiniMax', note: 'Natural Chinese voices' },
  { kind: 'openai', name: 'OpenAI', note: 'The OpenAI key you already have' },
];

export function VoicePanel({
  film,
  canGenerate,
  busy,
  onSetUp,
  onGenerate,
  onPlay,
}: {
  film: FilmInfo;
  /** Whether the project's agent is connected and idle, to apply a voice. */
  canGenerate: boolean;
  /** Something else is changing the film (a turn, an import, a check, an export): voicing waits for it. */
  busy: boolean;
  /** Opens Settings on a voice provider. */
  onSetUp(kind: VoiceKind): void;
  /** Asks the project's agent to apply a voice (or choose one) and synthesize the narration. */
  onGenerate(voice?: string): void;
  /** Plays the film from one moment to another, where a line is said. */
  onPlay(start: number, end: number): void;
}) {
  const { t: tr } = usePreferences();
  const [voices, setVoices] = useState<VoiceView[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [voiced, setVoiced] = useState<VoicedFilm | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The providers are read again whenever Settings changes, so setting one up here shows at once.
  useEffect(() => {
    let live = true;
    const read = () =>
      window.studio.voices().then(
        (found) => live && setVoices(found),
        (e) => live && setError(reason(e)),
      );
    void read();
    const stop = window.studio.onSettingsChanged(() => void read());
    return () => {
      live = false;
      stop();
    };
  }, []);
  useEffect(() => window.studio.onVoiceProgress(setProgress), []);

  const scenes = film.scenes
    .map((scene, index) => ({ index, lines: scene.lines.filter((line) => line.text.trim()) }))
    .filter((scene) => scene.lines.length);
  const lines = scenes.flatMap((scene) => scene.lines);
  const waiting = lines.filter((line) => !film.speech[line.id]);
  const characters = waiting.reduce((sum, line) => sum + line.text.length, 0);
  const kind = film.voice?.split(':')[0] as VoiceKind | undefined;
  const provider = PROVIDERS.find((p) => p.kind === kind);
  const ready = voices?.some((v) => v.kind === kind);
  const selected = voices?.find((v) => v.hasKey && v.voiceId);
  const selectedVoice = selected ? `${selected.kind}:${selected.voiceId}` : undefined;

  async function voice() {
    setError(null);
    setVoiced(null);
    setProgress({ done: 0, of: lines.length });
    try {
      setVoiced(await window.studio.voiceFilm());
    } catch (e) {
      setError(reason(e));
    } finally {
      setProgress(null);
    }
  }

  function setup() {
    if (!voices) {
      return (
        <p className="note">
          <Loader size={12} className="spin" /> {tr("Looking at your voice providers…")}
        </p>
      );
    }
    if (!voices.length) {
      return (
        <>
          <p className="note">{tr("Choose a provider to speak the film’s lines. Models shows how to get its key; it stays in this computer’s keychain.")}</p>
          <div className="presets voice-providers">
            {PROVIDERS.map((p) => (
              <button key={p.kind} type="button" className="preset" onClick={() => onSetUp(p.kind)}>
                <strong>{p.name}</strong>
                <span>{tr(p.note)}</span>
              </button>
            ))}
          </div>
        </>
      );
    }
    if (!film.voice) {
      return (
        <>
          <p className="note">
            {selected
              ? tr("Your selected voice is {0}:{1}. The agent will apply it to this film and generate the narration.", {0: selected.kind, 1: selected.voiceId})
              : tr("No narration voice is selected for this film. Choose one in Voice settings, or let the agent choose a voice that suits the script.")}
            {' '}{tr("Generating speech may use your provider’s paid allowance.")}
          </p>
          {!canGenerate && <p className="note">{tr("The agent must be connected and idle to generate narration.")}</p>}
          <div className="voice-actions">
            <button type="button" className="button" onClick={() => onSetUp(selected?.kind ?? voices[0]!.kind)}>
              <Settings size={14} /> {tr("Voice settings")}
            </button>
            <button type="button" className="button primary" onClick={() => onGenerate(selectedVoice)} disabled={!canGenerate}>
              <Mic size={14} /> {tr("Generate with agent")}
            </button>
          </div>
        </>
      );
    }
    if (!provider) {
      return (
        <p className="error">
          {tr("The film’s voice,")} <code className="mono">{film.voice}</code>{tr(", is not one the Studio speaks through: ask the agent to choose an Azure, ElevenLabs, MiniMax or OpenAI voice.")}
        </p>
      );
    }
    if (!ready) {
      return (
        <>
          <p className="note">
            {tr("The film speaks in")} <code className="mono">{film.voice}</code>{tr("; set")} {provider.name} {tr("up to voice it.")}
          </p>
          <div className="voice-actions">
            <button type="button" className="button primary" onClick={() => onSetUp(provider.kind)}>
              {tr("Set up")} {provider.name}
            </button>
          </div>
        </>
      );
    }
    return null;
  }

  const blocked = setup();
  return (
    <div className="body voice-panel">
      {blocked ?? (
        <>
          <section className="voice-card" aria-label={tr("The film’s voice")}>
            <span className="eyebrow">{tr("The film’s voice")}</span>
            <strong className="mono">{film.voice}</strong>
            <span className="note">
              <Check size={12} /> {provider!.name} · {tr(film.captions ? (film.captions === 'words' ? 'Captions follow each word' : 'Captions show each line') : 'No captions in the picture')}
            </span>
            <div className="voice-actions">
              <button type="button" className="button" onClick={() => onSetUp(provider!.kind)}>
                <Settings size={14} /> {tr("Voice settings")}
              </button>
              {selectedVoice && selectedVoice !== film.voice && (
                <button
                  type="button"
                  className="button"
                  disabled={!canGenerate}
                  data-tip={tr("The agent changes the film’s voice and speaks its lines again")}
                  onClick={() => onGenerate(selectedVoice)}
                >
                  {tr("Use {0} instead", {0: selectedVoice})}
                </button>
              )}
            </div>
          </section>

          {lines.length ? (
            <>
              <p className="voice-summary">
                {tr("{0} lines · {1} voiced · {2} waiting", {0: lines.length, 1: lines.length - waiting.length, 2: waiting.length})}
              </p>
              <ol className="voice-lines">
                {scenes.map((scene) => (
                  <li key={scene.index} className="voice-scene">
                    <span className="eyebrow">{tr("Scene {0}", {0: scene.index + 1})}</span>
                    <ol>
                      {scene.lines.map((line) => {
                        const speech = film.speech[line.id];
                        return (
                          <li key={line.id} className={`voice-line${speech ? ' voiced' : ' waiting'}`}>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={tr("Play this line in the film")}
                              data-tip={tr("Play this line in the film")}
                              onClick={() => onPlay(line.start, line.end)}
                            >
                              <Play size={13} />
                            </button>
                            <span className="voice-text">{line.text}</span>
                            <span className="voice-state">
                              {speech ? `${speech.seconds.toFixed(1)} ${tr("s")}` : tr("Waiting")}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="note">{tr("The film has no lines to speak yet: ask the agent to write what each scene says as its <Line>s.")}</p>
          )}

          <footer className="voice-footer">
            {progress ? (
              <p className="note" role="status">
                <Loader size={12} className="spin" /> {tr("Speaking line")} {Math.min(progress.done + 1, progress.of)} {tr("of")} {progress.of}…
              </p>
            ) : voiced ? (
              <p className="test good" role="status">
                {voiced.spoken
                  ? tr("Spoke {0} line{1}: {2} characters, {3} s of speech.", {0: voiced.spoken, 1: voiced.spoken === 1 ? '' : 's', 2: voiced.characters, 3: voiced.seconds.toFixed(1)})
                  : tr("Nothing changed: every line was spoken already.")}
                {voiced.kept ? tr(" Kept {0}.", {0: voiced.kept}) : ''} {tr("The film plays with it now.")}
              </p>
            ) : waiting.length ? (
              <p className="note">{tr("About {0} characters; your provider may charge for them.", {0: characters})}</p>
            ) : null}
            <button
              type="button"
              className="button primary"
              disabled={!!progress || busy || !waiting.length}
              data-tip={busy ? tr("Voice the film when the agent has finished its turn") : undefined}
              onClick={() => void voice()}
            >
              {progress ? <Loader size={14} className="spin" /> : <Mic size={14} />}
              {waiting.length ? tr("Voice {0} lines", {0: waiting.length}) : tr("Every line is voiced")}
            </button>
          </footer>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          <SystemMessage text={error} error />
        </p>
      )}
    </div>
  );
}
