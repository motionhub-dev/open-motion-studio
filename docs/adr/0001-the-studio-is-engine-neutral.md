# 1. The Studio is engine-neutral

> **Status:** Accepted · **Date:** 2026-11-10

## Context

Agents already make motion video in Remotion (React) and HyperFrames (HTML + GSAP), and each has a studio of its own, tied
to it. The motionhub format makes a motion usable in either (`@motionhub/remotion`, `@motionhub/hyperframes`) and in any
engine that provides `@motionhub/runtime`. A Studio for one engine would be a third tied studio; people would have to
change engine to use it. Remotion's licence also requires companies to buy one, so an engine the Studio owns outright is
needed for anyone who cannot.

## Decision

- **A project is written for one of three engines, chosen when it is created**: Remotion, HyperFrames, or native
  (compositions that draw with `@motionhub/runtime` alone, played and exported by the Studio).
- **The Studio talks to an engine through one contract** (`detect`, `create`, `doctor`, `useMotion`, `preview`, `still`,
  `render`, and the engine's skill) and one preview bridge protocol ([architecture](../tech/architecture.md#the-engine-contract)).
  Anything only one engine needs stays in its adapter.
- **Remotion and HyperFrames run from the project's own dependencies.** The Studio bundles neither and pins no version.
- **Motions are read and installed in the motionhub format as specified in `motionhub-dev/motions`**; the Studio defines
  no format of its own.
- Native is built first; the contract is written against it working, then implemented for Remotion and HyperFrames.

## Consequences

- Easier: a person keeps the engine they know; one motion works in all three; the Studio is not exposed to Remotion's
  licence, which stays between the person and Remotion.
- Harder: three adapters to keep working as two upstream projects change; the preview bridge has to be injected into
  three different runtimes; every feature that touches the picture (marks, timeline) is built three times or not at all.
- Rules out: a feature that only one engine can support being shown as a Studio feature; editing a composition through
  an engine-specific visual editor.
