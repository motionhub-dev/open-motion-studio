// The film's voice (ADR 0012), a view of its own across the workspace beside the assistant, in place of the stage, the
// timeline and the project tools. Until it can speak: which provider to speak through, each opening its guide in
// Settings; then the film's voice, which the agent writes (the Studio never edits film.tsx). Then the script read
// straight through, a card for each scene and a row for each line, voiced or waiting, each played in place (the film
// stays loaded out of sight) and each to be pointed at in the next message; and beside it, what the voice still needs,
// or the voice and voicing the lines waiting with its progress line by line. Only lines whose words changed are spoken, and paid for, again. A
// line's words are the film's own and are never translated.

import { SystemMessage, Translated, usePreferences } from './preferences';
import { ArrowLeft, AtSign, Check, Loader, Mic, Play, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Reference, VoicedFilm, VoiceKind, VoiceView as VoiceSetUp } from '../../shared/api';
import type { FilmInfo } from '../../shared/preview';
import { reason } from './reason';

const PROVIDERS: { kind: VoiceKind; name: string; note: string }[] = [
  { kind: 'azure', name: 'Azure', note: 'Hundreds of voices in every language; a free tier' },
  { kind: 'elevenlabs', name: 'ElevenLabs', note: 'The most expressive voices; a free plan' },
  { kind: 'minimax', name: 'MiniMax', note: 'Natural Chinese voices' },
  { kind: 'openai', name: 'OpenAI', note: 'The OpenAI key you already have' },
];

/** A scene's lines that say something, by scene, for the script. */
export function scriptOf(film: FilmInfo) {
  return film.scenes
    .map((scene, index) => ({ scene, index, lines: scene.lines.filter((line) => line.text.trim()) }))
    .filter((entry) => entry.lines.length);
}

export function VoiceView({
  film,
  t,
  playing,
  canGenerate,
  busy,
  onSetUp,
  onGenerate,
  onPlay,
  onReference,
  onClose,
}: {
  film: FilmInfo;
  /** Where the film is, and whether it plays, to light the line being said. */
  t: number;
  playing: boolean;
  /** Whether the project's agent is connected and idle, to apply a voice. */
  canGenerate: boolean;
  /** Something else is changing the film (a turn, an import, a check, an export): voicing waits for it. */
  busy: boolean;
  /** Opens Settings on a voice provider. */
  onSetUp(kind: VoiceKind): void;
  /** Asks the project's agent to apply a voice (or choose one) and synthesize the narration. */
  onGenerate(voice?: string): void;
  /** Plays the film from one moment to another, where a line or a scene is said. */
  onPlay(start: number, end: number): void;
  /** Points at a line in the next message. */
  onReference(ref: Reference): void;
  /** Back to the picture. */
  onClose(): void;
}) {
  const { t: tr } = usePreferences();
  const [voices, setVoices] = useState<VoiceSetUp[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [voiced, setVoiced] = useState<VoicedFilm | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The providers are read again whenever Settings changes, so setting one up shows at once.
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
  // Esc goes back to the picture, unless a dialog or a menu is open over the view.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.dialog, .menu')) onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const script = scriptOf(film);
  const lines = script.flatMap((entry) => entry.lines);
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

  /** What stands between the film and its voice, or null once it can speak. */
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
            {' '}
            {tr("Generating speech may use your provider’s paid allowance.")}
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
          {tr("The film’s voice,")} <code className="mono">{film.voice}</code>
          {tr(", is not one the Studio speaks through: ask the agent to choose an Azure, ElevenLabs, MiniMax or OpenAI voice.")}
        </p>
      );
    }
    if (!ready) {
      return (
        <>
          <p className="note">
            {tr("The film speaks in")} <code className="mono">{film.voice}</code>
            {tr("; set")} {provider.name} {tr("up to voice it.")}
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
    <div className="centre-view centre-wide voice-view">
      <div className="library-head">
        <button type="button" className="button quiet" onClick={onClose} data-tip={tr("Back to the picture")} data-key="Esc">
          <ArrowLeft size={14} />
          {tr("Picture")}
        </button>
        <h2>
          <Translated text="Voice" />
        </h2>
        {lines.length > 0 && (
          <span className="note">{tr("{0} lines · {1} voiced · {2} waiting", {0: lines.length, 1: lines.length - waiting.length, 2: waiting.length})}</span>
        )}
      </div>
      <div className="voice-body">
        {/* The script, read straight through: a card for each scene, a row for each line. */}
        <div className="voice-script">
          {lines.length ? (
            <ol className="voice-scenes">
              {script.map(({ scene, index, lines: said }) => (
                <li key={scene.id} className="voice-scene-card">
                  <div className="voice-scene-head">
                    <span className="eyebrow">{tr("Scene {0}", {0: index + 1})}</span>
                    <span className="mono note">
                      {scene.start.toFixed(1)}–{(scene.start + scene.duration).toFixed(1)} {tr("s")}
                    </span>
                    <span className="spacer" />
                    <button type="button" className="button quiet" onClick={() => onPlay(scene.start, scene.start + scene.duration)}>
                      <Play size={13} />
                      {tr("Play this scene")}
                    </button>
                  </div>
                  <ol>
                    {said.map((line) => {
                      const speech = film.speech[line.id];
                      const now = playing && t >= line.start && t < line.end;
                      return (
                        <li key={line.id} className={`voice-line${speech ? ' voiced' : ' waiting'}${now ? ' now' : ''}`}>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={tr("Play this line in the film")}
                            data-tip={tr("Play this line in the film")}
                            onClick={() => onPlay(line.start, line.end)}
                          >
                            <Play size={14} />
                          </button>
                          <span className="voice-text">{line.text}</span>
                          <span className="voice-state">{speech ? `${speech.seconds.toFixed(1)} ${tr("s")}` : tr("Waiting")}</span>
                          <button
                            type="button"
                            className="icon-button voice-ask"
                            aria-label={tr("Ask about {0}", {0: line.text})}
                            data-tip={tr("Add to your message")}
                            onClick={() => onReference({ kind: 'line', label: line.text, scene: scene.id, line: line.id, time: scene.start })}
                          >
                            <AtSign size={14} />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          ) : (
            <p className="note">{tr("The film has no lines to speak yet: ask the agent to write what each scene says as its <Line>s.")}</p>
          )}
        </div>
        {/* The voice and the voicing beside the script, always in reach; until the film can speak, what it needs. */}
        <aside className="voice-side">
          {blocked ? (
            <section className="voice-card voice-setup">{blocked}</section>
          ) : (
            <>
            <section className="voice-card" aria-label={tr("The film’s voice")}>
              <span className="eyebrow">{tr("The film’s voice")}</span>
              <strong className="mono">{film.voice}</strong>
              <span className="note">
                <Check size={12} /> {provider!.name} ·{' '}
                {tr(film.captions ? (film.captions === 'words' ? 'Captions follow each word' : 'Captions show each line') : 'No captions in the picture')}
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
            <section className="voice-card voice-generate" aria-label={tr("Voice the film")}>
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
              ) : (
                <p className="note">{tr("Every line is voiced")}</p>
              )}
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
            </section>
            </>
          )}
        </aside>
      </div>
      {error && (
        <p className="error" role="alert">
          <SystemMessage text={error} error />
        </p>
      )}
    </div>
  );
}
