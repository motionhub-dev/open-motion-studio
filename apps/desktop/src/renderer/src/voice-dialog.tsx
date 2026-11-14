// Voicing a film (ADR 0012), from the stage: the first time, which provider to speak through, each opening its guide in
// Models; then the film's voice, which the agent writes (the Studio never edits film.tsx); then its lines, how many are
// spoken already, and voicing the rest with its progress. Only lines whose words changed are spoken, and paid for, again.

import { Loader, Mic, X } from 'lucide-react';
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
  onClose,
}: {
  film: FilmInfo;
  /** Opens Models on a voice provider. */
  onSetUp(kind: VoiceKind): void;
  onClose(): void;
}) {
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
    <Dialog label="Voice the film" onClose={onClose} dismissible={!progress}>
      <div className="panel-head">
        <h2>Voice the film</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose} disabled={!!progress}>
          <X size={16} />
        </button>
      </div>
      {!voices ? (
        <p className="note">
          <Loader size={12} className="spin" /> Looking at your voice providers…
        </p>
      ) : !voices.length ? (
        <>
          <p className="note">Choose a provider to speak the film’s lines. Models shows how to get its key; it stays in this computer’s keychain.</p>
          <div className="presets voice-providers">
            {PROVIDERS.map((p) => (
              <button key={p.kind} type="button" className="preset" onClick={() => onSetUp(p.kind)}>
                <strong>{p.name}</strong>
                <span>{p.note}</span>
              </button>
            ))}
          </div>
        </>
      ) : !film.voice ? (
        <p className="note">
          The film names no voice yet. Ask the agent to give it one, as “Narrate the film in a warm Mandarin voice”: it writes{' '}
          <code className="mono">&lt;Film voice="{voices[0]!.kind}:…"&gt;</code> from the voices {PROVIDERS.find((p) => p.kind === voices[0]!.kind)?.name}{' '}
          offers.
        </p>
      ) : !provider ? (
        <p className="error">
          The film’s voice, <code className="mono">{film.voice}</code>, is not one the Studio speaks through: ask the agent to choose an Azure, ElevenLabs,
          MiniMax or OpenAI voice.
        </p>
      ) : !ready ? (
        <>
          <p className="note">
            The film speaks in <code className="mono">{film.voice}</code>; set {provider.name} up to voice it.
          </p>
          <div className="actions">
            <span className="spacer" />
            <button type="button" className="button primary" onClick={() => onSetUp(provider.kind)}>
              Set up {provider.name}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="note">
            {lines.length
              ? `${lines.length} line${lines.length === 1 ? '' : 's'} in ${film.voice}; ${spoken} spoken already. Only what changed is spoken again, into the project’s voice/.`
              : 'The film has no lines to speak yet: ask the agent to write what each scene says as its <Line>s.'}
          </p>
          {progress && (
            <p className="note" role="status">
              <Loader size={12} className="spin" /> Speaking line {Math.min(progress.done + 1, progress.of)} of {progress.of}…
            </p>
          )}
          {voiced && (
            <p className="test good" role="status">
              {voiced.spoken
                ? `Spoke ${voiced.spoken} line${voiced.spoken === 1 ? '' : 's'}: ${voiced.characters} characters, ${voiced.seconds.toFixed(1)} s of speech.`
                : 'Nothing changed: every line was spoken already.'}
              {voiced.kept ? ` Kept ${voiced.kept}.` : ''} The film plays with it now.
            </p>
          )}
          <div className="actions">
            <span className="spacer" />
            <button type="button" className="button primary" disabled={!!progress || !lines.length} onClick={() => void voice()}>
              {progress ? <Loader size={14} className="spin" /> : <Mic size={14} />}
              {spoken && spoken < lines.length ? 'Voice what changed' : 'Voice'}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
