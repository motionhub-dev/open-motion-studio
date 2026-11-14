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
| `tap:<css>` | click it with the mouse, as a person: what needs a gesture (full screen) needs this |
| `hover:<css>` | move the mouse over it, and leave it there for the next steps |
| `wait:<ms>` | wait |
| `size:<w>x<h>` | resize the window (it opens at 1600×960) |
| `eval:<js>` | evaluate an expression in the window, print it as JSON |
| `theme:<scheme>` | `dark`, `light` or `system`: the colour scheme the window draws in |
| `boxes` | print the panels' boxes (assistant, stage, picture, stage bar, frame, side, timeline) as JSON |
| `session:<file>` | put a conversation (built-in agent messages, as `.motion-studio/session.json` holds them) in the project and reopen it |
| `stills:<n>` | the same with a made-up turn that looked at `n` stills of the film, for the assistant panel |
| `agent:<kind>` | make the project talk to `built-in`, `claude` or `codex` (its `agent.json`) and open it again |
| `send:<text>` | send a message and wait for the turn to end: **a real turn**, on the person's own sign-in or key, which spends their tokens; keep it to a one-word reply unless more is needed |
| `file:<path>` | print a file of the open project, such as `.motion-studio/usage.jsonl` (the run's profile, and the project in it, go when it ends) |
| `put:<from>=<to>` | copy a local file into the open project at `<to>`, such as a sound into `media/` or a `film.tsx` to try; a new `film.tsx` is built before the next step |
| `export:<file>` | export the film as an MP4 to `<file>` (the save dialog is answered by the step) and wait for it; then read it with the shipped ffmpeg (`ffmpeg -i`, `astats`) |

To look at the assistant without a model: `stills:9 ss:folded "click:.work-stills .more" ss:open`.

Examples in the launcher: `kinetic`, `product`, `data`.

## Gotchas

- **Build first.** The script runs `apps/desktop/out/`; `pnpm dev` is the human path and does not leave a build.
- **No model is set up** in the throwaway profile, so the assistant cannot send. Layout, playback, marks, the timeline
  and the panels all work; `session:` and `stills:` fill the conversation.
- **The assistant is drawn again once the project's agent is known** (a few seconds after opening), which drops
  anything done in it before. The script waits for "Finding the agent…" to go before it runs the steps.
- **Playwright emulates the light scheme** over the system's, so `nativeTheme.themeSource` in the main process changes
  nothing; `theme:` sets the scheme through `page.emulateMedia`.
- **The app's CSP refuses eval**, so `page.waitForFunction` fails at once; poll `page.evaluate` instead. `eval:` steps
  work, since an expression passed to `page.evaluate` is not run through eval.
- Verified on Windows. On Linux it adds `--no-sandbox`; a headless machine needs `xvfb-run -a node ...`.
