# 6. A film is scenes of layers and lines

> **Status:** Accepted · **Date:** 2026-11-10

## Context

A film was one React component drawn by time. The Studio could play it and photograph it, but knew nothing of what it
was made of: the timeline had nothing to show beyond a ruler, a mark could name only a DOM path, and `check` drew three
moments of the whole film. The agent, for its part, had no shape to plan in, which a model weaker than Claude needs most.

The structure that would help is the one an explainer is planned in: scenes in order, each a span of the film that
holds some boxes on the frame and says something. What it does not need is a layer of declared animation over that: the
agent writes code anyway, and draws motion inside a box from time better than it fills in a vocabulary of actions.

## Decision

- **A film draws a `<Film>` of `<Scene id duration>`s**, each holding `<Layer id x y w h z>`s (boxes of the frame, in its
  pixels, drawing React) and `<Line id>`s (what the scene says, its script, which draws nothing). These are
  `@motionhub/runtime`'s (0.5.0), so a motion's reel and a film can be written the same way; the format is specified
  there, in `packages/runtime/README.md` of `motionhub-dev/motions`.
- **Scenes are laid end to end; their durations are the film's length.** `film` keeps the size and rate only, and a
  `film.seconds` is refused, so the length has one source.
- **A layer is on screen for its whole scene, and its content moves itself** from `useTime()`, counted from its scene's
  start. There is no declared animation: no appear, tween or set, nothing anchored to a word.
- **The structure is read at run time, not from the source.** `<Film>` reads it from its own elements and reports it to
  the engine (`onFilm`); the preview core draws the film once, off the page, to learn it. Only the agent edits a film,
  so the Studio never parses or rewrites `film.tsx`.
- **A line is spoken by nobody yet.** Narration is a later step (it needs audio in the export first); a line is the
  scene's script until then.
- **Every film draws a `<Film>`.** A film drawn as one component with `film.seconds`, the earlier format, is refused
  with a message that says how to write one: two formats side by side would make every feature that reads the
  structure handle its absence. A motion's reel, which is one component, plays as a film inside one scene.

## Consequences

- Easier: the timeline shows the scenes; a mark says which scene and layer it is in; `check` draws every scene and
  outlines them for the agent; the agent plans and writes scene by scene; narration has a place to land.
- Harder: what the Studio knows of a film is what it reports when drawn, so it cannot list the scenes of a film that does
  not build, and editing a scene's text or timing from the Studio's own controls would need a parser it does not have.
- Rules out: word-anchored timing between a picture and its narration, unless a later decision adds a way for a layer
  to read when a line is spoken; a declared animation layer over the layers.
