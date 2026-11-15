# 14. Project sessions outlive editor windows

> **Status:** Accepted · **Date:** 2026-11-15

How the main window, dedicated editors and background agents share a project's live session without restarting it.

## Decision

This supersedes [ADR 0013](0013-each-window-owns-a-project.md)'s window-owned lifecycle. Its independent project
state, preview boundaries and serialized shared settings remain.

- There is one main BrowserWindow. Closing it hides it to the tray. Opening the app again or using the tray brings
  it back; an explicit Quit from the tray or app menu ends background work and the app.
- A project owns one workspace, agent session, conversation, approvals, task status, editor WebContentsView and
  separate UI/preview and offscreen-render sessions. The main process retains them for this app run.
- The main window switches between Home and any retained project. An editor view can move into a dedicated
  BaseWindow for that project, or back into the main window. A project has only one editable view at a time;
  moving it preserves its renderer, pending IPC requests, composer, conversation and running turn.
- Closing a dedicated window detaches its view without disposing the project. Switching projects and returning
  Home do the same. Preview playback is paused when a view is hidden; agents, voice generation and exports continue.
- Home lists open projects, running/completed/failed/stopped tasks, approval or question waits, and available
  progress. Open here attaches a session to the main window; Open in editor window attaches it to its dedicated
  window. Progress represents actual render frames or voiced lines; model reasoning has phases and elapsed time.
- On explicit Quit, the app aborts project tasks, closes agents and MCP servers, waits for pending task writes,
  destroys the editor views and exits. It does not run as a system service or resume an interrupted task after exit.

## Reason

A native window is a way to see a film, not the owner of its work. Destroying its session on close prevented using
Home as a task overview and made switching projects stop the very agent the person wanted to leave working.
Moving one WebContentsView preserves live UI state without duplicate editors or replaying a running turn.

## Cost

Retained editor renderers, bundlers and agent processes consume memory until the app quits. Hiding a view pauses
playback but does not cancel intentional background work. One project can be shown in the main window or in a
dedicated editor, not both simultaneously. The shared main process and machine resources remain common boundaries.
