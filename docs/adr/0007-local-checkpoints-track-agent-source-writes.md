# Local checkpoints track agent source writes

> **Status:** Accepted · **Date:** 2026-11-10

Why recovery records agent source changes rather than copying the whole project or requiring Git.

## Decision

Store source checkpoints in `.motion-studio/history.json`, containing each turn's id, request label, timestamp, and
project-relative paths with original/resulting bytes encoded as base64. Record recovery information before an atomic
source replacement. History is local project state, excluded from the preview's project-file surface.

Restore reverses the selected turn and subsequent recorded changes. Preflight every affected path and byte sequence;
refuse external edits, discontinuous histories and symbolic links. Keep unrelated files, imported media and installed
Motion libraries. Record an inverse entry so the restoration can itself be undone. Do not silently prune history.

## Reason

Creators need to explore without losing their previous work. A whole-folder snapshot would copy large media and risk
removing material added outside the agent. Git is useful but cannot be a prerequisite for the desktop workflow.
Tracking the agent's write boundary provides a small, explicit recovery scope.

## Cost

History can consume disk space and does not preserve full visual previews. Multi-file restoration is not a cross-crash
filesystem transaction; source writes are atomic individually, and restoration rolls back completed writes on ordinary
failures when no concurrent writer intervenes. Conflicts are explained and retained recovery copies are not discarded.

See [the creator's workflow](../tech/creator-workflow.md) for user-facing behavior and limitations.
