# Documentation

Read [positioning](prd/positioning.md) first, then [the architecture](tech/architecture.md). The visual system is [design](design.md).

## Product

- [Positioning](prd/positioning.md) — what the Studio is, for whom, instead of what, and its non-goals.

## Technical

- [Architecture](tech/architecture.md) — the components, the engine contract, the agent, and the order of work.

## Decisions

- [0001 The Studio is engine-neutral](adr/0001-the-studio-is-engine-neutral.md) — Remotion, HyperFrames or native, behind one contract.
- [0002 The Studio is an Electron desktop app](adr/0002-the-studio-is-an-electron-desktop-app.md) — why desktop, and why Electron over Tauri.
- [0003 A built-in agent on the person's own model](adr/0003-a-built-in-agent-on-the-persons-own-model.md) — our own loop, two protocols, the person's key.
- [0004 A film's code runs in a sandboxed frame on its own scheme](adr/0004-a-films-code-runs-in-a-sandboxed-frame-on-its-own-scheme.md) — how agent-written code is isolated from the app.
