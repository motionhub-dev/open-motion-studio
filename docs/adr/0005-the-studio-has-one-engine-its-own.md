# 5. The Studio has one engine, its own

> **Status:** Accepted · **Date:** 2026-11-10

## Context

[ADR 0001](0001-the-studio-is-engine-neutral.md) made the Studio engine-neutral, and steps 4 and 5 built adapters for
Remotion and HyperFrames beside the native engine. Built, the cost showed where 0001 had predicted it:

- Every feature that touches the picture is built per engine or not at all. The timeline already showed clips for
  HyperFrames only; an inspector that edits, a scene timeline or keyframes would each be three pieces of work, or the
  intersection of three.
- The agent's skill, its usual mistakes and how its work is checked differ per engine, so the work that decides whether a
  non-Claude model makes a usable film is split three ways.
- Two upstreams move under the Studio (HyperFrames before 1.0, Remotion's licence changing in 5.0), and both make the
  person's machine run npm, a Node toolchain and, for Remotion, a downloaded Chrome: the paths most likely to fail on it.
- The first screen asked a person to choose an engine before they had made anything.

The Studio is for people who make video rather than write code ([positioning](../prd/positioning.md)). To them the
engine is plumbing; what they get from the Studio is the agent, motions and pointing at the picture. The benefits of
neutrality (opening an existing Remotion or HyperFrames project, a hedge against one engine changing) belong to
developers, and the hedge is already the native engine, which is motionhub's own `@motionhub/runtime`.

## Decision

- **A film is `film.tsx`, drawn by `@motionhub/runtime`, and nothing else.** The Studio bundles, previews, photographs and
  exports it itself.
- **The Remotion and HyperFrames adapters are deleted, and so is the engine contract**: with one implementation it is a
  seam for a second that does not exist. The film's code lives in `src/main/film/`.
- A folder without `film.tsx` is offered a film; a Remotion or HyperFrames project is neither opened as one nor
  converted.

## Consequences

- Easier: one skill to tune, one preview page, one export path with nothing to install; features that touch the picture
  can go as deep as the runtime allows; the preview's policy no longer allows inline scripts, which only HyperFrames
  pages needed.
- Harder: someone with a Remotion or HyperFrames project cannot bring it; a motion's Remotion and HyperFrames packages
  are not the Studio's concern.
- Rules out: the engine-neutral positioning; an engine chosen per project. Bringing one back means writing the contract
  again against two real implementations, which the git history of steps 4 and 5 shows the shape of.
