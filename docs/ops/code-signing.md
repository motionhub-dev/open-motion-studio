# Code signing

> **Status:** Current · **Updated:** 2026-11-19

How OpenMotionStudio's installers are signed, who may sign them, and what the signed program sends over the network.

Windows releases are signed through SignPath Foundation, in CI and nowhere else; macOS is signed with an Apple Developer
ID and notarised once its secrets are set (`CLAUDE.md`, "Commands"); Linux packages are not signed.

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by
[SignPath Foundation](https://signpath.org).

- Only what this repository builds is signed: the installer, and the `OpenMotionStudio.exe` inside it, built by
  `.github/workflows/build.yml` on GitHub's runners from a `v*` tag or a run that prepares a draft release. Nothing built
  on a developer's machine is signed.
- Third-party programs the app ships (ffmpeg, esbuild, Electron's own libraries) are not signed with this certificate.
- Every release signing is approved by hand in SignPath before it runs.

### Team roles

- **Committers and reviewers:** the members of the [motionhubdev](https://github.com/orgs/motionhubdev/people)
  organisation with write access to this repository. A change reaches `main` through a reviewed pull request.
- **Approvers:** the owners of the motionhubdev organisation, who approve each signing request in SignPath.

### Privacy

The program sends nothing to other networked systems unless the person using it asks for it, with these exceptions:

- it checks GitHub (`api.github.com`) for a newer release, which can be switched off in General settings;
- it reads motionhub.dev's catalogue of motions and their posters;
- it talks to the model, voice and agent providers the person sets up, with their own keys or sign-in.

It collects no telemetry and sends nothing about the person or their projects to motionhub.

## How CI signs a Windows release

NSIS packs the program into the installer, so there are two signing requests, each to project `open-motion-studio`
with signing policy `release-signing`:

1. `pnpm package` builds `dist/win-unpacked/`; CI uploads it and SignPath signs it with the `app` configuration.
2. CI builds the installer again around the signed program (`electron-builder --win nsis --prepackaged`), uploads it,
   and SignPath signs it with the `installer` configuration.
3. CI stops unless both the installer and `OpenMotionStudio.exe` carry a valid signature.

The uninstaller NSIS writes inside the installer is not signed.

Builds that are not a release (a push to `main`, a pull request) stay unsigned, since every signing waits for an
approver. Without the settings below, a release is unsigned too.

### Settings

| Where | Name | Value |
|---|---|---|
| Repository secret | `SIGNPATH_API_TOKEN` | the API token of a SignPath CI user that may submit to the project |
| Repository variable | `SIGNPATH_ORGANIZATION_ID` | SignPath's organisation id |

`apps/desktop/scripts/check-signing.mjs` stops the build when one is set without the other.

### Artifact configurations

Kept in SignPath, under the project; their slugs are the ones the workflow names.

`app`, the unpacked program (only the app's own executable is signed):

```xml
<?xml version="1.0" encoding="utf-8"?>
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <zip-file>
    <pe-file path="OpenMotionStudio.exe">
      <authenticode-sign />
    </pe-file>
  </zip-file>
</artifact-configuration>
```

`installer`, the NSIS installer:

```xml
<?xml version="1.0" encoding="utf-8"?>
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <zip-file>
    <pe-file path="open-motion-studio-*-win-x64.exe">
      <authenticode-sign />
    </pe-file>
  </zip-file>
</artifact-configuration>
```
