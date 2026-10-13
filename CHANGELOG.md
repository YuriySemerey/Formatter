# Changelog

All notable changes to Formatter are documented here.

## 0.3.0 - 2026-10-13

- Added independent Settings -> Appearance switches for showing brand country and quality category in price-list output.
- Preserved existing metadata visibility by default, including old settings and backups.
- Added on-demand update checks under Settings -> About, with download progress and explicit restart/install on Windows.
- Added architecture-specific Mac DMG downloads for manual updates without an Apple Developer certificate.
- Prepared public GitHub Releases in YuriySemerey/Formatter for macOS arm64/x64 and Windows x64.
- Added tag/version, complete-artifact, and update-checksum validation before publishing a fully uploaded draft release.
- Kept local packaging commands non-publishing and preserved the stable application identity and existing user data.

## 0.2.0 - 2026-07-13

- Added offline full backup and restore for settings, the latest two outputs, and brand overrides.
- Added application version and platform details under Settings -> About.
- Added persistent local technical logs with controls under Settings -> Logging.
- Added single-instance handling, navigation restrictions, production CSP, and blocked production network requests.
- Switched brand override writes and backup exports to atomic JSON writes.
- Removed GitHub publishing and draft-release commands from the application build.
- Added private GitHub Actions artifacts for macOS and Windows installers.
- Preserved the stable `com.dw.formatter` application identity for installer-over-installer updates.

## 0.1.0 - 2026-07-13

- Added product price-list formatting for copied Ukrainian product streams.
- Added generic text formatting mode.
- Added Avto.pro-based brand catalog with editable category and country overrides.
- Added history for the last two formatted results.
- Added local settings, dark mode, compact mode, logging panel, and always-on-top control.
- Prepared reproducible desktop packaging for macOS and Windows with release preflight checks.
- Fixed production asset paths and Electron preload IPC for installed builds.
