# Sound, narration and captions

> **Status:** Plan · **Updated:** 2026-11-14

How a film gets sound, a spoken narration and captions, in three slices: music and effects that play and export, captions
drawn from a film's lines, and a narration synthesized line by line whose word times time the captions.

A film exported today is picture only: ffmpeg is given frames and nothing else (`main/film/capture.ts`), Assets take
images and fonts, and `<Line>` is a scene's script that nothing speaks or shows. The decisions are
[ADR 0010](../adr/0010-a-films-sound-is-sound-elements-mixed-on-export.md) (sound) and
[ADR 0011](../adr/0011-narration-is-synthesized-per-line-and-times-the-captions.md) (narration and captions). The
comparison with HyperFrames, VisoTalk and Remotion that led here is the
[sound and captions artifact](https://claude.ai/artifact/2epF46yfcLmf7DUH9koNAC).

## What lands in `@motionhub/runtime` first

A film imports only `@motionhub/runtime`, and the engine supplies what its parts do (`preview/core.tsx`), so the format
changes land in `motionhub-dev/motions` (`packages/runtime`) before the Studio uses them, as CLAUDE.md requires:

- `<Sound src at dur? trim? loop volume fadeIn fadeOut duck?>`: draws nothing; `<Film>` reports it with the scenes.
- `<Line at? dur?>`: an optional place in its scene, in seconds; without it a line's time is the engine's to give.
- `<Film voice? captions?>`: the narration's voice (`provider:voice`), and whether captions are drawn.
- `useLine(id)`: when a line is spoken, `{start, end, words}` in the scene's time, so a layer can move with it.
- `<Caption line?>`: draws a line's words, styled by the motion's `caption.*` tokens.

## Slice A: sound in and out

Music and effects the person brings, heard in the preview and mixed into the MP4.

- **Assets** take `mp3`, `wav`, `m4a` and `ogg` (50 MB each, as now), each with its duration read by the Studio's
  ffmpeg, and its waveform's peaks kept in `.motion-studio/peaks/`.
- **Preview** plays each `<Sound>` on the core's clock through Web Audio: short files as buffers, long ones streamed,
  following seeks, loops and the play range; the stage bar gains mute.
- **Export** mixes every sound with one ffmpeg filter graph (`atrim`, `adelay`, `volume`, `afade`, then
  `amix=normalize=0`), holds it under −1 dBTP with `alimiter`, encodes AAC 192 kbit/s and muxes it beside the
  picture, cut or padded to the film's length. The Remotion export writes each as Remotion's `<Audio>`.
- **Timeline** gains a Sound row: each sound a band with its waveform and fades, selected into the Inspector for its
  volume and fades.
- **Agent**: `film.md` teaches `<Sound>`; `check` reports each sound's span and any that runs past the film or names a
  missing file; the @ picker offers audio assets.
- **Tests**: the filter graph for a set of sounds (times, trims, loops, fades, levels); what Assets accept; `check`'s
  sound report.

## Slice B: captions from lines

Captions without any audio: a line's words, shown while it is said.

- A line's time is its `at` and `dur` where the film gives them, else its scene shared evenly among its lines.
- `<Film captions>` draws the current line with `<Caption>`, burned into the picture.
- **Export** also writes the captions as a soft subtitle track in the MP4 (`-c:s mov_text`) and, beside it, `.srt`;
  the export dialog says which.
- **Timeline** gains a Lines row, each line a band at its time.
- **Tests**: line times with and without `at`; the SRT for a film; the export's arguments with captions.

## Slice C: narration, and captions from its word times

A voice says each line; its words time the captions.

- **Voices in Models**, beside the providers, kept in `settings.json` (`voices`), keys sealed in `keys.json` as a
  provider's are:
  - Microsoft Edge read-aloud, the default, with no key: its WebSocket gives audio and word boundaries. Models says it
    is unofficial and may stop working; when it fails, the card says to set up another voice.
  - Microsoft Azure (official, with a free tier, the same voices), offered first, with how to get its key and region.
  - ElevenLabs (`with-timestamps`), MiniMax (`t2a_v2`, word subtitles) and OpenAI (`/audio/speech`, its words from
    `/audio/transcriptions` with the same key).
  - Each with its voice, speed and model, and a sample to hear.
- **Synthesis** is asked for, never automatic, since it may cost money: Voice the film in the stage bar and the agent's
  `voice_lines` tool. Each line is synthesized once per text, voice, speed and provider, into the project's `voice/`
  (the clip and its words), which git keeps with the film; only changed lines are spoken again.
- **Timing**: a spoken line's length is its clip's; a scene's lines follow one another with a lead, a hold and a tail
  (0.4, 0.4 and 0.8 s by default), and `check` reports a scene too short for what it says. Before a line is spoken, its
  length is estimated (about 2.8 English words or 4.5 Chinese characters a second).
- **Captions** turn on with a narration, timed by its words: a line at a time, or word by word (CJK by character).
- **Mix**: music under a narration is ducked (attack 0.12 s, release 0.5 s); the narration is brought to −16 LUFS.
- **Usage**: each synthesis is logged in `usage.jsonl` with its characters and seconds, and shown with the turn's
  tokens.
- **Tests**: each provider's words read into one shape (fixtures); the clip's name from its inputs; line and scene
  times from clips; ducking in the filter graph; the Edge failure's card.

Later: a narration from the person's own recording, its words from a provider's transcription, through the same
captions.

## Order

A first, since C needs its mix; B is small and can go beside A; then C. Each slice is one or more pull requests, driven
in the app with the run-desktop skill; A and C each end with a real export listened to.

| Slice | Runtime (motions) | Main | Renderer | Docs |
| --- | --- | --- | --- | --- |
| A | `<Sound>` | `assets.ts`, `film/capture.ts`, `film/remotion-export.ts`, `agent/tools.ts`, `film/film.md` | `preview/core.tsx`, `timeline.tsx`, `inspector.tsx` | ADR 0010, `architecture.md`, `design.md`, CHANGELOG |
| B | `<Line at dur>`, `<Film captions>`, `<Caption line>` | `film/capture.ts` | `timeline.tsx`, `export-dialog.tsx` | `design.md`, CHANGELOG |
| C | `<Film voice>`, `useLine` | new `voice.ts`, `providers.ts`, `agent/tools.ts`, `usage.ts` | `settings.tsx`, stage bar | ADR 0011, `architecture.md`, `design.md`, CHANGELOG |

When the slices land, this document is rewritten to describe what was built, or folded into `architecture.md` and
`design.md` and deleted.
