# Sound, narration and captions

> **Status:** Plan, slices A, B and C built but usage · **Updated:** 2026-11-14

How a film gets sound, a spoken narration and captions, in three slices: music and effects that play and export, captions
drawn from a film's lines, and a narration synthesized line by line whose word times time the captions.

A film exported today is picture only: ffmpeg is given frames and nothing else (`main/film/capture.ts`), Assets take
images and fonts, and `<Line>` is a scene's script that nothing speaks or shows. The decisions are
[ADR 0010](../adr/0010-a-films-sound-is-sound-elements-mixed-on-export.md) (sound) and
[ADR 0011](../adr/0011-narration-is-synthesized-per-line-and-times-the-captions.md) (narration and captions) with
[ADR 0012](../adr/0012-a-narration-speaks-through-the-persons-own-voice-provider.md) (which voices). The
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

*Built*, as below (`@motionhub/runtime` 0.7.0 gives `<Sound>`), with three differences:
- The Inspector does not show a sound: a click on its band seeks to it, and hovering shows its level, loop and fades.
- The Remotion export has no sound yet, and a film that imports `<Sound>` does not render there: `@motionhub/remotion` 0.4
  takes runtime 0.6 only, so the export pins it. A binding that takes 0.7, and then plays `<Sound>`, comes next.
- Overlapping sounds take rows of their own on the timeline, and the waveform is drawn on a decibel scale.

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

*Built*, as below (`@motionhub/runtime` 0.7.0). The runtime times the lines and draws the captions, so the preview and
the export agree. A line that overlaps the one before it, or that is left no time, is an error. Every export carries
the lines as subtitles, whether or not the picture shows captions.

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
  provider's are ([ADR 0012](../adr/0012-a-narration-speaks-through-the-persons-own-voice-provider.md)). There is no
  default: the first narration asks the person to set one up, with a guide for each:
  - Azure (Microsoft's Speech service, with a free tier): key and region; its WebSocket gives audio and word boundaries.
  - ElevenLabs (`with-timestamps`, each character's time, read into words).
  - MiniMax (`t2a_v2` with word subtitles): key and group id.
  - OpenAI (`/audio/speech`, its words from one `/audio/transcriptions` call with word timestamps): a key many already
    have.
  - Each with its model, its voices listed to search, and a sentence to hear in one.
- **Synthesis** is asked for, never automatic, since it may cost money: Voice the film in the stage bar and the agent's
  `voice_lines` tool. Each line is synthesized once per text, voice, speed and provider, into the project's `voice/`
  (the clip and its words), which git keeps with the film; only changed lines are spoken again.
- **Timing**: the runtime gives a voiced line its speech's length, after a lead and with a hold of 0.4 s; speech that
  runs into the next line or past its scene is cut there, and `check` says by how much. A line not yet spoken keeps its
  written or even share.
- **Captions**: `<Film captions>` a line at a time, `captions="words"` lighting each word of a voiced line as it is
  said.
- **Mix**: music under a narration is ducked (attack 0.12 s, release 0.5 s); the narration is brought to −16 LUFS.
- **Usage** (not built yet): each synthesis logged in `usage.jsonl` with its characters and seconds, and shown with the
  turn's tokens. Voicing says what it spoke now.
- **Tests**: each provider's request and words read into one shape (fixtures); the clip's key, what voicing keeps and
  removes; ducking measured in the mix; the agent's `list_voices`, `voice_lines` and `check` notes.

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
