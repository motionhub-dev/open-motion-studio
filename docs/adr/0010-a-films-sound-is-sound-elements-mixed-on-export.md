# 10. A film's sound is `<Sound>` elements, mixed on export

> **Status:** Accepted · **Date:** 2026-11-14

How a film says what it plays, and how the Studio plays it and puts it in the MP4.

## Decision

A film's music and effects are `<Sound>` elements from `@motionhub/runtime`, written where they belong: one in a
scene plays in that scene's time, one directly in `<Film>` in the film's.

```tsx
<Film>
  <Sound src="media/bed.mp3" at={0} loop volume={-12} fadeIn={1} fadeOut={2} />
  <Scene id="intro" duration={4}>
    <Sound src="media/whoosh.wav" at={0.4} volume={-6} />
    …
  </Scene>
</Film>
```

- `src` is a file in the project; `at` and `dur` are seconds (no `dur`: the file's length, or with `loop` to the end
  of where it sits); `trim` is where in the file it starts; `volume` is in dB (0 is the file as it is); `fadeIn` and
  `fadeOut` are seconds; `duck` (dB) is how far it drops under a narration (ADR 0011).
- A `<Sound>` draws nothing. `<Film>` reports the sounds with the scenes, read at run time as ADR 0006 reads the rest.
- The preview plays them on the core's clock through Web Audio. Export mixes them with the Studio's own ffmpeg in one
  filter graph (`atrim`, `adelay`, `volume`, `afade`, then `amix=normalize=0`), held under −1 dBTP by `alimiter`,
  encoded AAC 192 kbit/s and muxed beside the picture, cut or padded to the film's length.
- Assets accept `mp3`, `wav`, `m4a` and `ogg`. A film with no `<Sound>` exports as before, picture only.

## Reason

A film is scenes, and a sound mostly belongs to one (a whoosh as a title lands) or to all of them (a bed): placing it in
the tree says so without a separate track list to keep in step. Decibels and seconds are how a person or an agent says
"the music 12 dB down, fading over two seconds"; a 0–1 gain is not. Mixing on export with ffmpeg adds nothing to ship,
and summing without normalising keeps each level what the film says, with a limiter only against clipping. VisoTalk
places sounds the same way; HyperFrames mixes with the same ffmpeg chain.

## Cost

The format lands in `motionhub-dev/motions` first, and every engine that plays a film has to play its sounds. No
effects beyond level and fades, no automation lanes and no buses: the Studio is not an audio editor (positioning).
A sound's level is the file's own; loudness is evened only for a narration (ADR 0011). The preview's Web Audio and the
export's ffmpeg are two mixers, which a test of the filter graph and a listen to an export keep in agreement.
