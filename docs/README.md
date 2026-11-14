# Documentation

Read [positioning](prd/positioning.md) first, then [the architecture](tech/architecture.md). The visual system is [design](design.md).

## Product

- [Positioning](prd/positioning.md) — what the Studio is, for whom, instead of what, and its non-goals.

## Technical

- [Architecture](tech/architecture.md) — the components, the film, the agent, and the order of work.

- [The creator’s workflow](tech/creator-workflow.md) — examples, structure, references, recovery, assets and checks.
- [The assistant panel](tech/assistant-panel.md) — plan: each turn's tokens and time, turns as blocks, the coding agents' settings, the composer.

## Decisions

- [0001 The Studio is engine-neutral](adr/0001-the-studio-is-engine-neutral.md) — Remotion, HyperFrames or native; superseded by 0005.
- [0002 The Studio is an Electron desktop app](adr/0002-the-studio-is-an-electron-desktop-app.md) — why desktop, and why Electron over Tauri.
- [0003 A built-in agent on the person's own model](adr/0003-a-built-in-agent-on-the-persons-own-model.md) — our own loop, two protocols, the person's key.
- [0004 A film's code runs in a sandboxed frame on its own scheme](adr/0004-a-films-code-runs-in-a-sandboxed-frame-on-its-own-scheme.md) — how agent-written code is isolated from the app.
- [0005 The Studio has one engine, its own](adr/0005-the-studio-has-one-engine-its-own.md) — a film is film.tsx on `@motionhub/runtime`; no adapters.
- [0006 A film is scenes of layers and lines](adr/0006-a-film-is-scenes-of-layers-and-lines.md) — `<Film>` of scenes; no declared animation; read at run time.
- [0007 Local checkpoints track agent source writes](adr/0007-local-checkpoints-track-agent-source-writes.md) — safe, local recovery without Git.
- [0008 The person's own coding agent, through its own headless protocol](adr/0008-the-persons-own-coding-agent.md) — Claude Code or Codex as a second way in, with the person's sign-in.
- [0009 Each turn is logged with its tokens and time](adr/0009-each-turn-is-logged-with-its-tokens-and-time.md) — one line a turn in `.motion-studio/usage.jsonl`, tokens on one footing.
