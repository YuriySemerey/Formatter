# Formatter Release Checklist

## Prepare

1. Update `version` in `package.json` and `package-lock.json`.
2. Add the same version to `CHANGELOG.md`.
3. Use Node.js 22 and run `npm ci`.
4. Run `npm run test`.
5. Run `npm run build`.
6. Run `npm run smoke:electron`.
7. Run `npm run preflight`.

## Build and Publish

The release destination is the public `YuriySemerey/Formatter` repository. Its source and installers will be visible publicly. Prepare and review the changes and test results before the owner confirms the first push or publication.

After confirmation, push the prepared source, then create and push a version tag matching package.json and package-lock.json (first release: `v0.3.0`). Never reuse a published version or overwrite a tag. An ordinary push does not publish a release.

The `Build installers and publish releases` workflow creates:

- `Formatter-X.Y.Z-mac-arm64.dmg` and `.zip`.
- `Formatter-X.Y.Z-mac-x64.dmg` and `.zip`.
- `Formatter-X.Y.Z-win-x64.exe`.
- `.blockmap` files, `latest.yml` and `latest-mac.yml`.

Publication waits for both platform jobs. Windows additionally installs the NSIS EXE and runs the installed application smoke test. It verifies every expected installer, the two Mac ZIP architectures, version metadata, file sizes and SHA-512 checksums. Files are uploaded to a draft release, then the fully uploaded draft becomes the latest stable release. A failure leaves the previous release current; an incomplete draft is not offered by the updater.

The Windows job also builds a temporary 0.2.99 installer and exercises the real update service and preload IPC against a loopback update feed. It verifies explicit downloading, progress, native NSIS replacement with the current production installer, and settings/history/brand edits in the restarted production renderer. CI uses silent installation to automate the installer wizard; production continues to use the user-confirmed installation flow. The feed override and test bootstrap exist only in the temporary installer. The JSON evidence is saved as a separate `Windows-update-test-report` Actions artifact and is excluded from public release assets.

`beforeBuild` applies a narrowly checked NSIS template backport from [electron-builder #9769](https://github.com/electron-userland/electron-builder/pull/9769). This fixes a per-user install path buffer over-read that can crash setup with `0xC0000005`. The agreed electron-builder 26.0.12 and electron-updater 6.6.2 pins remain unchanged. The original dependency template is preserved in an ignored backup, repeated Windows builds are supported, and an unrecognized template fails the build instead of applying an unchecked patch.

A manual workflow run builds downloadable Actions artifacts without publishing. Local commands also never publish. Use a fresh version-specific output directory to keep older local applications:

```bash
npm run dist:mac -- --config.directories.output=release/0.3.0
# On Windows:
npm run dist:win -- --config.directories.output=release/0.3.0
```

To verify one platform locally:

```bash
node scripts/release-assets.mjs release/0.3.0 0.3.0 mac
node scripts/release-assets.mjs release/0.3.0 0.3.0 win
```

Only the tag publication job has `contents: write`; it uses GitHub's workflow token. No account token belongs in the application or committed files.

## Upgrade Test

1. Install the previous version.
2. Configure appearance settings, create two history entries, and edit a brand.
3. Export a full backup from `Settings -> About`.
4. Install the new build over the previous version.
5. Verify settings, history, brand edits, clipboard, always-on-top, logs, and formatting.
6. Verify that restoring the backup does not populate raw input.
7. Toggle country and category independently; verify all four combinations and that history remains unchanged until Format.
8. On Windows, test two installed versions: explicit check, download progress, cancel restart, then restart/install. Test offline and interrupted-download recovery.
9. On macOS, verify that the download button opens the correct architecture's DMG and that replacing the application preserves user data.

Version 0.2.0 cannot discover new releases. The initial 0.3.0 upgrade is manual on both platforms; later Windows builds support in-app installation.

## Signing

This release deliberately uses unsigned macOS builds (`mac.identity: null`) and manual updates. Do not enable native Mac auto-installation without signing and notarization.

Optional Windows repository secrets:

- `WINDOWS_CSC_LINK`
- `WINDOWS_CSC_KEY_PASSWORD`

Unsigned installers may require an operating-system confirmation on first launch. Keep the stable application identity for installer-over-installer upgrades.
