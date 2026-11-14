# 12. A narration speaks through the person's own voice provider

> **Status:** Accepted · **Date:** 2026-11-14

Which voice services the Studio speaks a film's lines through, and what it does before the person has one.

## Decision

This replaces [ADR 0011](0011-narration-is-synthesized-per-line-and-times-the-captions.md)'s default voice; the rest of 0011
stands.

- **There is no default voice.** The first time a film is voiced (Voice the film, or the agent's `voice_lines`), the Studio
  asks the person to set one up in Models, under Voices, and says how for each:
  - **Azure** (Microsoft's Speech service, with a free tier): its key and region. The Studio speaks through the service's
    WebSocket with the key, which gives the audio and each word's boundary.
  - **ElevenLabs**: its key. `with-timestamps` gives the audio and each character's time, read into words.
  - **MiniMax**: its key and group id. `t2a_v2` with word subtitles gives the audio and each word's time.
  - **OpenAI**: its key, which many people already have. `/audio/speech` gives the audio, and one call to
    `/audio/transcriptions` with word timestamps gives its words' times.
- A provider is set up like a model provider: its settings in `settings.json` (`voices`), its key sealed in `keys.json`, a
  sample to hear before saving. A film names its voice as `provider:name` (`azure:zh-CN-XiaoxiaoNeural`), and the Studio
  speaks through the provider it names.
- **Microsoft Edge's read-aloud service is not used.** Its requests carry a signature Microsoft built to keep clients
  other than Edge out (a modified SHA-256 under a changing browser version); speaking through it would mean reproducing
  that signature, which is circumventing an access control, in an app anyone may download.
- **No voice runs inside the Studio.** It ships no speech model and starts no program (CLAUDE.md); a speech server the
  person runs on their own computer, as they run Ollama for a model, can come later as one more provider.

## Reason

The developer wanted narration to work with no setup, through Edge's free service. Its code (the `edge-tts` project's
`drm.py`) showed that the service is guarded against other clients, not merely unofficial, so the Studio does not go
around it. Every remaining voice needs an account, so the honest first step is to ask once, at the moment the person
wants a narration, and make each provider's setup a short guided form. OpenAI comes first in reach (a key the person
may already hold), Azure in price (a free tier with the same Microsoft voices), MiniMax in Chinese voices, ElevenLabs in
quality.

## Cost

A first narration needs an account: Azure's free tier asks for a card to verify the person, and the others charge for
what they speak. Four providers' protocols are four translations into one shape of word times, each tested against a
recorded answer. A film voiced through one provider and opened by a person without it plays its kept speech (in
`voice/`) but cannot be voiced again until they set that provider up or change the film's voice.
