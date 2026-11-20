# Desktop updates

> **Status:** Current · **Updated:** 2026-11-20

How can an installed Studio receive a new version while a creator's films, drafts and background jobs remain safe?

The desktop client checks the latest stable GitHub release and downloads eligible updates in the background. A downloaded update waits for an explicit restart. Installations without an updater use the official downloads page.

## Release scope

Existing clients need one manual upgrade from the Studio website to install a build with the updater. Subsequent updates use assets from the existing GitHub Releases repository.

| Installation | First delivery | Evidence required to enable in-app installation |
| --- | --- | --- |
| macOS, Apple silicon and Intel | Install from DMG. The updater consumes the signed ZIP for the appropriate architecture. | An installed app updates on each CPU, retains its Developer ID identity and passes macOS signature and notarization checks. |
| Linux, x64 and arm64 AppImage | Update the AppImage in a writable location. Offer the official download when replacement is unavailable. | Launch each actual AppImage, update it in place, relaunch from its normal entry point and export a film. |
| Windows x64 NSIS | Check the latest public stable version and link to the official download. The v0.1.0 installer is unsigned. | Enable in-app installation in a subsequent signed client after validating the expected Windows publisher and a signed-to-signed NSIS upgrade. Announce the one-time manual transition to that client. |
| Linux tar archive or source checkout | Offer the release page for manual upgrades. | A tar installation never tries to replace itself. Development runs make no automatic network checks. |

## Client and restart lifecycle

1. The packaged application checks after startup and every six hours. Settings → General offers an automatic-check preference and a manual check. Concurrent checks share one operation. Eligible updates download with `electron-updater` and are checked against the release manifest.
2. When an update is ready, select **Restart to update** or **Later**. A dismissed update stays available in Settings. On macOS, the ZIP is passed to the native updater for signature verification and staging only after the restart request.
3. The restart transition checks all retained workspaces for active tasks and asks every renderer whether it has a draft. It defers when a view is unavailable, a workspace is busy, or a draft remains. New work is gated during the transition. Once approved, Studio disposes idle workspaces and relaunches. Linux prepares and verifies a copy alongside the existing AppImage before atomically replacing it at the same path. [Session lifecycle](../adr/0014-project-sessions-outlive-editor-windows.md)

## Build and publication

Installers use `OpenMotionStudio-<version>-<os>-<arch>.<extension>`. The five native build jobs run with `--publish never` and upload their outputs to CI artifacts. Draft assembly verifies update manifest versions, referenced filenames, sizes and SHA-512 hashes before attaching installers, update manifests and SHA256SUMS to the draft.

Each Mac job has its own manifest in the draft, `latest-arm64-mac.yml` or `latest-x64-mac.yml`. The workflow only includes the manifests from Developer ID signed builds with a valid notarization staple. Linux retains the builder's `latest-linux.yml` and `latest-linux-arm64.yml` feed names. The updater downloads full archives. Windows uses GitHub's latest stable release for version checks and links to the official downloads page.

Publish the complete draft after verifying packaged upgrades for the supported targets, then switch the website's versioned download links and bootstrap instructions to the published assets.

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
