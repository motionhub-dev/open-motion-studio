# 11. Narration is synthesized per line, and times the captions

> **Status:** Accepted, amended by [0012](0012-a-narration-speaks-through-the-persons-own-voice-provider.md) (no default voice; no Edge) · **Date:** 2026-11-14

Whether the Studio speaks a film's lines, through which voices, where the speech is kept, and how captions are timed.

## Decision

- **A line is what the narration says.** `<Film voice="provider:voice">` names the voice; each `<Line>`'s words are
  spoken (its `text`, where the caption differs, is shown instead). The caption is drawn from the line, never written
  twice: `<Film captions>` turns captions on, `<Caption>` draws them, styled by the motion's `caption.*` tokens.
- **Voices are set up in Models**, beside the model providers: their settings in `settings.json` (`voices`), their keys
  sealed in `keys.json` like a provider's. The default is Microsoft Edge's read-aloud service, which needs no key; Azure
  (official, with a free tier), ElevenLabs, MiniMax and OpenAI are offered beside it.
- **Synthesis is asked for**, by Voice the film or the agent's `voice_lines` tool, and the main process makes each call.
  Each line's clip and its word times are kept in the project's `voice/`, named from the line's words, voice, speed and
  provider, so git keeps them with the film and only a changed line is spoken again.
- **The narration is the clock.** A spoken line lasts as long as its clip; a scene's lines follow one another with a
  lead, a hold and a tail; `check` reports a scene too short for its lines. `useLine(id)` gives a layer when its line is
  spoken, `{start, end, words}`, so a picture can move with its narration.
- **Captions are timed by the words.** Every voice's word times are read into one shape: the provider's own
  timestamps where it gives them, else a transcription of the clip by the same provider, else the line's time shared by
  its characters (and said to be estimated). Export writes them burned in (when `captions` is on), as a soft subtitle
  track and as `.srt`.
- Each synthesis is logged in `usage.jsonl` with its characters and seconds.

This changes [ADR 0006](0006-a-film-is-scenes-of-layers-and-lines.md) where it held that "a line is spoken by nobody
yet" and ruled out word-anchored timing: `useLine` is the way a layer reads when a line is spoken.

## Reason

The developer wants narration and captions in the Studio, with no setup before the first film is heard. A line was
made the scene's script so narration would have a place to land, and speaking it line by line keeps the words, the
voice and the captions one thing: change a line and its speech, its timing and its caption follow. Word times from the
voice itself are what makes captions right; most providers give them, and the rest can be recovered. Keeping the speech
in the project, like media, means a film plays and exports the same on another computer without paying again.

## Cost

Edge's read-aloud service is not offered by Microsoft for other apps: it can change or stop without notice, and whether
its speech may be used in a published film is unclear. Models says so, and a failure points to another voice; the
Studio's Azure option uses the same voices officially. A narration costs money on the other providers, and the
project's `voice/` grows with each spoken version of a line that git keeps. Providers time words differently, so captions
from an estimated line are rougher. The positioning's narration question is closed: the Studio speaks, though it still
generates no image, video or music.
