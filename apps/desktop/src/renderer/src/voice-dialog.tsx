// Voicing a film (ADR 0012), from the stage: the first time, which provider to speak through, each opening its guide in
// Models; then the film's voice, which the agent writes (the Studio never edits film.tsx); then its lines, how many are
// spoken already, and voicing the rest with its progress. Only lines whose words changed are spoken, and paid for, again.

import { SystemMessage, usePreferences } from './preferences';
import { Loader, Mic, Settings, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { VoicedFilm, VoiceKind, VoiceView } from '../../shared/api';
import type { FilmInfo } from '../../shared/preview';
import { Dialog } from './dialog';
import { reason } from './reason';

const PROVIDERS: { kind: VoiceKind; name: string; note: string }[] = [
  { kind: 'azure', name: 'Azure', note: 'Hundreds of voices in every language; a free tier' },
  { kind: 'elevenlabs', name: 'ElevenLabs', note: 'The most expressive voices; a free plan' },
  { kind: 'minimax', name: 'MiniMax', note: 'Natural Chinese voices' },
  { kind: 'openai', name: 'OpenAI', note: 'The OpenAI key you already have' },
];

export function VoiceDialog({
  film,
  onSetUp,
  onGenerate,
  canGenerate,
  onClose,
}: {
  film: FilmInfo;
  /** Opens Models on a voice provider. */
  onSetUp(kind: VoiceKind): void;
  /** Asks the project's agent to choose a voice and synthesize the narration. */
  onGenerate(voice?: string): void;
  canGenerate: boolean;
  onClose(): void;
}) {
  const { t: tr } = usePreferences();
  const [voices, setVoices] = useState<VoiceView[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [voiced, setVoiced] = useState<VoicedFilm | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    window.studio.voices().then(
      (found) => live && setVoices(found),
      (e) => live && setError(reason(e)),
    );
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => window.studio.onVoiceProgress(setProgress), []);

  const lines = film.scenes.flatMap((scene) => scene.lines).filter((line) => line.text.trim());
  const spoken = lines.filter((line) => film.speech[line.id]).length;
  const kind = film.voice?.split(':')[0] as VoiceKind | undefined;
  const provider = PROVIDERS.find((p) => p.kind === kind);
  const ready = voices?.some((v) => v.kind === kind);
  const selected = voices?.find((v) => v.hasKey && v.voiceId);

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

  return (
    <Dialog label={tr("Voice the film")} onClose={onClose} dismissible={!progress}>
      <div className="panel-head">
        <h2>{tr("Voice the film")}</h2>
        <button type="button" className="icon-button" aria-label={tr("Close")} onClick={onClose} disabled={!!progress}>
          <X size={16} />
        </button>
      </div>
      {!voices ? (
        <p className="note">
          <Loader size={12} className="spin" /> {tr("Looking at your voice providers…")}
        </p>
      ) : !voices.length ? (
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
      ) : !film.voice ? (
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
            <span className="spacer" />
            <button type="button" className="button primary" onClick={() => onGenerate(selected ? `${selected.kind}:${selected.voiceId}` : undefined)} disabled={!canGenerate}>
              <Mic size={14} /> {tr("Generate with agent")}
            </button>
          </div>
        </>
      ) : !provider ? (
        <p className="error">
          {tr("The film’s voice,")} <code className="mono">{film.voice}</code>{tr(", is not one the Studio speaks through: ask the agent to choose an Azure, ElevenLabs, MiniMax or OpenAI voice.")}
        </p>
      ) : !ready ? (
        <>
          <p className="note">
            {tr("The film speaks in")} <code className="mono">{film.voice}</code>{tr("; set")} {provider.name} {tr("up to voice it.")}
          </p>
          <div className="voice-actions">
            <span className="spacer" />
            <button type="button" className="button primary" onClick={() => onSetUp(provider.kind)}>
              {tr("Set up")} {provider.name}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="note">
            {lines.length
              ? tr("{0} line{1} in {2}; {3} spoken already. Only what changed is spoken again, into the project’s voice/.", {0: lines.length, 1: lines.length === 1 ? '' : 's', 2: film.voice, 3: spoken})
              : tr("The film has no lines to speak yet: ask the agent to write what each scene says as its <Line>s.")}
          </p>
          {progress && (
            <p className="note" role="status">
              <Loader size={12} className="spin" /> {tr("Speaking line")} {Math.min(progress.done + 1, progress.of)} {tr("of")} {progress.of}…
            </p>
          )}
          {voiced && (
            <p className="test good" role="status">
              {voiced.spoken
                ? tr("Spoke {0} line{1}: {2} characters, {3} s of speech.", {0: voiced.spoken, 1: voiced.spoken === 1 ? '' : 's', 2: voiced.characters, 3: voiced.seconds.toFixed(1)})
                : tr("Nothing changed: every line was spoken already.")}
              {voiced.kept ? tr(" Kept {0}.", {0: voiced.kept}) : ''} {tr("The film plays with it now.")}
            </p>
          )}
          <div className="voice-actions">
            <span className="spacer" />
            <button type="button" className="button primary" disabled={!!progress || !lines.length} onClick={() => void voice()}>
              {progress ? <Loader size={14} className="spin" /> : <Mic size={14} />}
              {spoken && spoken < lines.length ? tr("Voice what changed") : tr("Voice")}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          <SystemMessage text={error} error />
        </p>
      )}
    </Dialog>
  );
}
