# 15. New projects live in a default workspace

> **Status:** Accepted · **Date:** 2026-11-15

Where a new film or template copy is created, and how the person changes that location.

## Decision

The default workspace is `OpenMotionStudio` under Electron's operating-system Documents path. The main process
creates it lazily when creating a project. Settings → Workspace opens a native directory chooser, creates the
chosen directory if needed, resolves its real path and saves it as the optional absolute `workspace` string in
userData's `settings.json`. All windows use the same settings store and serialized atomic writes.

New film reserves `Untitled film` inside the workspace and initializes a normal project and starter film. A template
click reserves the template's display name and copies its bundled source into that new project. Each action always
creates a new directory; existing directories, files and links are skipped with numeric suffixes (` 2`, ` 3`, …).
Exclusive directory creation prevents two concurrent requests from claiming the same name. No renderer can supply
a workspace path; only the main process's native chooser can change it.

Open folder and Recent keep opening existing projects in place. Changing the workspace does not move projects or
modify their contents. Existing template projects under userData's `Examples/` remain accessible through Recent or
Open folder; clicking a template now makes a new copy in the workspace.

## Reason

Choosing an empty directory for every new film interrupts creation. Reusing a template project turns a template
click into an ambiguous reopen action. One visible, configurable location and fresh copies make both actions
predictable while keeping every project an ordinary folder the person owns.

## Cost

Repeated creation accumulates project folders. Names use simple numeric suffixes; rename and cleanup remain ordinary
filesystem operations. An unavailable workspace reports its filesystem error, and the person can choose another
location in Settings. Initialization failures may leave a partial new directory; the app does not delete it or
touch an existing project to recover.
