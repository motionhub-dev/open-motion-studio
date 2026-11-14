---
name: run-desktop
description: Build, launch and screenshot the Open Motion Studio desktop app with an example film open. Use when asked to run the app, look at the workspace, or check a UI change in the real app rather than in tests.
---

The Studio is an Electron app. `drive.mjs` launches the built app with a throwaway profile (the person's recent
projects and settings stay untouched), opens an example from the launcher, runs a list of steps (screenshots, keys,
clicks, window sizes) and exits. All commands run from the repository root.

## Once per machine

`playwright-core` is not a dependency of the repository. Install it in a scratch folder and name that folder:

```bash
npm i --prefix <scratch>/pw playwright-core@1.47.2
export OMS_PLAYWRIGHT=<scratch>/pw          # PowerShell: $env:OMS_PLAYWRIGHT = '<scratch>\pw'
```

It drives the Electron that `pnpm install` downloaded; it needs no browser of its own.

## Build, then drive

```bash
pnpm build
node .claude/skills/run-desktop/drive.mjs <shots-dir>                  # kinetic example, ss:workspace + boxes
node .claude/skills/run-desktop/drive.mjs <shots-dir> data ss:open key:Backslash ss:folded click:".topbar .status" ss:checks
```

Then **read the screenshots**. A blank or launcher-only shot means it did not reach the workspace.

| step | does |
| --- | --- |
| `ss:<name>` | screenshot to `<shots-dir>/<name>.png` |
| `key:<key>` | press a key, Playwright names (`Space`, `ArrowRight`, `Backslash`, `BracketLeft`) |
| `click:<css>` | click the first match, through the DOM |
| `wait:<ms>` | wait |
| `size:<w>x<h>` | resize the window (it opens at 1600×960) |
| `boxes` | print the panels' boxes (assistant, stage, picture, stage bar, frame, side, timeline) as JSON |

Examples in the launcher: `kinetic`, `product`, `data`.

## Gotchas

- **Build first.** The script runs `apps/desktop/out/`; `pnpm dev` is the human path and does not leave a build.
- **No model is set up** in the throwaway profile, so the assistant cannot send. Layout, playback, marks, the timeline
  and the panels all work.
- Verified on Windows. On Linux it adds `--no-sandbox`; a headless machine needs `xvfb-run -a node ...`.
