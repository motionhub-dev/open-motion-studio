# 13. Each window owns a project

> **Status:** Superseded by [0014](0014-project-sessions-outlive-editor-windows.md) · **Date:** 2026-11-15

How several films can be made at once without sharing their files, previews, agent turns or exports.

## Decision

- One app process can open several editor windows. New window, Ctrl/Cmd+Shift+N, and launching the app again open
  another home window. One project is open in each window; opening a project already owned by another window
  focuses its owner and refuses a second writer.
- `workspace.ts` owns one window's project, bundler, conversation, coding-agent processes, MCP server, approvals,
  working and export controllers, progress and last exported file. `index.ts` routes IPC by the sending window's
  webContents id, accepting only that window's main frame. Events return to that window alone.
- Each editor has its own in-memory Electron session for its UI and film preview, and another for its offscreen
  render windows. Each session's `oms-preview:` handler can serve only that editor's project. Captures and MP4
  export receive that editor's render-session-bound stage opener, never a global current project.
- Closing a window aborts its tasks, ends its agents and MCP server, closes its capture stages and disposes its
  bundler. Its pending file and conversation writes settle before normal last-window exit. Other windows continue.
- Provider settings, sealed keys and recent projects remain app-wide. Saves are serialized and JSON files replaced
  atomically so simultaneous windows cannot overwrite one another's changes. A focused window refreshes providers
  and recents; changed coding-agent settings apply to its next turn.

## Reason

Creating another BrowserWindow with a global current project would serve the wrong film to one preview, route one
agent's events into another conversation and make one export or Stop affect every window. Separate project state
and preview sessions preserve the existing disk and sandbox boundaries while allowing independent work.

## Cost

Each open film has its own bundler and agent processes; concurrent exports share the machine's CPU and GPU. Window
layout is held in that window's in-memory session. This does not add multiple writers or collaboration within one
project, and does not start a separate Chrome installation: all windows use Electron's bundled Chromium.
