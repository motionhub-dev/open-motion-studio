# Desktop updates

> **Status:** Plan · **Updated:** 2026-11-18

How can an installed Studio receive a new version while a creator's films, drafts and background jobs remain safe?

The desktop source now implements stable-version checks, an automatic-check preference, a dismissible reminder and a link to the official downloads. The install and relaunch behavior below is planned.

## Release scope

v0.1.1 introduces checks and download reminders. A v0.1.0 installation needs one manual upgrade from the Studio website. Automatic installation will require a later bootstrap client that includes an installer updater. Use the existing GitHub Releases repository for distribution. The proposed experience is a background check and download, followed by an explicit restart when Studio is idle.

| Installation | First delivery | Evidence required to enable in-app installation |
| --- | --- | --- |
| macOS, Apple silicon and Intel | Install from DMG. The updater consumes the signed ZIP for the appropriate architecture. | An installed app updates on each CPU, retains its Developer ID identity and passes macOS signature and notarization checks. |
| Linux, x64 and arm64 AppImage | Update the AppImage in a writable location. Offer the official download when replacement is unavailable. | Launch each actual AppImage, update it in place, relaunch from its normal entry point and export a film. |
| Windows x64 NSIS | Check the latest public stable version and link to the official download. The v0.1.0 installer is unsigned. | Enable in-app installation in a subsequent signed client after validating the expected Windows publisher and a signed-to-signed NSIS upgrade. Announce the one-time manual transition to that client. |
| Linux tar archive or source checkout | Offer the release page for manual upgrades. | A tar installation never tries to replace itself. Development runs make no automatic network checks. |

## Client and restart lifecycle

1. Pin a compatible `electron-updater` runtime dependency alongside the existing electron-builder 26 toolchain. In the main process, start one updater after app readiness for the packaged application. Proposed defaults are a check after startup and every six hours while running. Coalesce manual checks, timer events and repeated clicks into one operation. Compare semantic versions and accept newer stable releases only.
2. Put **Check for updates**, the running version, last result and background-check preference in Settings → General. With background checks disabled, a manual check still works. Report checking, current, downloading, ready, manual download and recoverable errors through the existing typed preload API. Home and editor windows subscribe to the same state and read its current snapshot on attachment. Provide English and Chinese labels. The main process owns all URLs and opens the fixed downloads page for manual installations.
3. Show **Restart to update** and **Later** when a verified download is ready. Closing the main window still hides it to the tray. Selecting Later dismisses the prompt for this session. Keep the ordinary quit and install paths explicit. Disable automatic install-on-quit where supported. Confirm macOS native staging behavior with the pinned updater. If native staging would apply on a later quit without consent, delay handing the ZIP to the native updater until the user accepts.
4. On restart request, acquire a main-process transition lock before checking every retained workspace, including Home and detached editor views. Reuse `workspace.busy()` for agent turns, pending approvals, exports, narration and tracked tasks. Ask each live UI surface about unsaved settings, edits and composer drafts. A missing response defers restart. Identify the project or view that needs attention and allow the user to return there. Release the lock on deferral. Becoming idle re-enables the button and leaves the restart decision with the user.
5. During the final check and shutdown, prevent new tasks, edits and project opens from racing the install. Flush pending saves, distinguish update-driven closure from hide-to-tray, then invoke the updater's install/relaunch path once. Explicit Quit currently aborts active tasks. Calling it as a shortcut would cancel the work this feature must preserve. Test the app's actual event order, including updater-initiated window closure. [Session lifecycle](../adr/0014-project-sessions-outlive-editor-windows.md)

Implementation surfaces are `apps/desktop/src/main/index.ts` and `workspace.ts` for lifecycle and task ownership, `src/shared/api.ts` and the preload bridge for commands and events, and the renderer's Settings, preferences and translations for the UI. Record version, platform, architecture, transition and error category in existing diagnostics. Keep provider keys, signed download URLs and project content out of logs.

## Build and publication

Keep all five native build jobs and the existing draft release workflow. Configure the GitHub provider in the packaged client and use the matching builder to generate update manifests and block maps. Inspect a packaged app for its embedded provider configuration. Confirm manifest generation under the actual packaging command, which currently passes `--publish never`. If a separate generation mode is needed, keep runner uploads confined to CI artifacts and give only the draft assembly job release-write access. [Builder v26 update guide](https://www.electron.build/v26/docs/features/auto-update/)

Collect each runner's output under a separate directory. Today's workflow flattens artifacts and uploads only installers and a checksum list. Both native Mac jobs can emit `latest-mac.yml`. Assemble one Mac manifest from both same-version file lists before uploading and exercise the pinned client's ZIP selection on each CPU. Preserve builder-generated Linux architecture-specific manifest names. Include generated block maps needed for supported downloads. Windows manual notifications can read the public latest stable release without an installation manifest or client credentials.

Before exposing a release, resolve every manifest entry against the draft attachments, recompute its SHA-512 and size, confirm the version matches the tag and embedded app version, and verify signed Mac builds and both ZIPs. Reject missing architectures, duplicate filenames with differing contents and incomplete uploads. Keep SHA256SUMS for manual downloads. Publish the complete draft, check the public feed anonymously, then switch the versioned download links and bootstrap instructions on the Studio website.

## Verification plan

Build two increasing **packaged** versions, A and B, with the production packaging recipe and an isolated test release repository. Point only the test builds at that repository. Publish B there as a stable release so the test exercises real release discovery, redirects, downloads, install and relaunch. Also retain the public v0.1.0 packages for the manual bootstrap test. Record OS, CPU, package type, installed versions, build commit, digest, observed result and sanitized diagnostics for each run.

| Test | Procedure | Pass condition |
| --- | --- | --- |
| First manual upgrade | Install public v0.1.0, create a project, save a preference and install A over it using the normal platform instructions. | Same project and preferences open in A. A exposes the expected update action for this installation type. |
| A → B on four automatic targets | On both Mac CPUs and both Linux AppImages, select Later once, return via tray, accept restart, and reopen the sample project. | Correct binary and version relaunch once. Preferences, recent projects and saved film/media hashes survive. Preview plays and an MP4 exports. Checking again reports current. |
| Background work and unsaved input | Export in one detached project, leave an agent awaiting approval in another, and edit a setting or compose a message in a hidden view. Request restart from Home. Repeat while work starts at the instant of approval. | Each blocker defers install. Work and unsaved input survive. Once blockers clear, a fresh explicit restart succeeds. |
| Notifications and installation policy | Exercise Windows NSIS, Linux tar, a read-only AppImage and a source checkout. Check English/Chinese labels, background-check opt-out, manual checks and repeated clicks. | Each installation offers its supported action. A manual-download path opens the official page. Duplicate checks or clicks start at most one transfer or restart. |
| Feed and network failures | Test offline startup, missing manifest, partial download, disk full, wrong hash, incompatible architecture and incorrect Mac signature. Restore the feed or free space and retry. | No invalid install or forced quit. The running app stays usable, reports a useful result, and a later valid update succeeds. |
| Release selection and assembly | Introduce same-name Mac manifests, a missing block map where required, missing architecture, old version, draft and prerelease. Test an interrupted draft upload and retry. | Incomplete drafts stay private. Every promoted file matches its digest. Stable clients select only a newer stable version. |
| Recovery | After updating to B in the test repository, publish a higher patch that reverts the faulty app change. Also try a fresh install from the official installers. | Existing clients can move forward to the repair. A user with a client that cannot launch can reinstall manually and open the existing project. |

## Acceptance and rollout

First validate the packaging and version-selection path with A and B. Then integrate restart coordination and run the lifecycle tests against tray, Home and separate editor windows. Run the repository typecheck, unit, build and UI gates. Record results per platform, including the manual paths. Enable each automatic target after its packaged upgrade and recovery tests pass. A signing, integrity, data-preservation or wrong-architecture failure keeps the affected target on manual downloads.

For the bootstrap release, put the one-time v0.1.0 upgrade instruction on the website and in the release notes. At the first public automatic update, verify discovery from the actual bootstrap client and perform one post-publication install on each enabled target. If a bad update escapes, stop further distribution of the affected release, retain a known-good manual installer, and publish a higher patch for clients that already installed it. Use the existing diagnostics to triage failures.
