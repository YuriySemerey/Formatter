# Changelog

All notable changes to Formatter are documented here.

## 0.3.3 - 2026-11-21

- Verify installers in pull requests before merge; pull-request events cannot publish tags or releases.
- Complete the explicit certificate-free Mac signature in PR builds and strictly verify it before creating installers.
- Added custom brand categories and editable names for built-in/custom categories; stable IDs preserve all brand assignments when names change.
- Persist category definitions in settings/backups and include them in brand JSON exports, while accepting legacy arrays and rejecting missing references before import.
- Verify category creation, duplicate checks, renaming, cancellation, save/reload, formatting switches, backups and installed-platform persistence.
- Added custom brands and editable names for existing brands under Settings -> Brands, with duplicate/alias checks and a draft/save workflow.
- Preserve original names when renaming, use the edited name in formatted output, and include custom brands/renames in storage, imports/exports and backups.
- Keep the built-in catalog intact; allow restoring a base brand or removing a custom draft entry.
- Verify brand creation, rename, native save/reload, old-name recognition and unchanged history through the production UI, including installed-platform CI checks.
- Added HTML alongside exact plain text when copying formatted output, with explicit line breaks and nonempty spacer lines for rich-text editors such as HelpCrunch.
- Applied the same copy format to Copy, history-copy buttons, and keyboard copying of selected output; HTML special characters stay literal text.
- Added real system-clipboard paste checks for Copy and keyboard selection, including installed Windows and native Mac bundles, without contacting HelpCrunch.
- Report failed clipboard writes instead of claiming that copying succeeded.

## 0.3.2 - 2026-11-21

- Fixed invalid macOS bundle signatures that caused installed Apple Silicon builds to appear damaged.
- Ad-hoc sign the application, helpers and frameworks after packaging, with the required Electron entitlements and strict signature verification.
- Verify both architecture DMG/ZIP bundles and launch the native installed copy in Mac CI before allowing publication.
- Mac builds remain certificate-free and are not Apple-notarized; first launch can require explicit approval in Privacy & Security.

## 0.3.1 - 2026-11-10

- Fixed copied Windows cart rows: line breaks and tab-separated cells now keep quantities and subtotals with the correct product.
- Prevented quantity values from becoming numeric section headings or phantom unknown-brand products.
- Preserved explicit quantities, used the second unit/subtotal column when both prices are copied, and supported amounts with cents and nonbreaking-space thousands.
- Added regression coverage from the reported screenshots, a real Format-button check, and installed Windows renderer verification after an update.

## 0.3.0 - 2026-10-14

- Added independent Settings -> Appearance switches for showing brand country and quality category in price-list output.
- Preserved existing metadata visibility by default, including old settings and backups.
- Added on-demand update checks under Settings -> About, with download progress and explicit restart/install on Windows.
- Added architecture-specific Mac DMG downloads for manual updates without an Apple Developer certificate.
- Prepared public GitHub Releases in YuriySemerey/Formatter for macOS arm64/x64 and Windows x64.
- Added tag/version, complete-artifact, and update-checksum validation before publishing a fully uploaded draft release.
- Added automatic release-branch publication with exact-commit tags and verified draft recovery, without requiring a local terminal or a manual workflow launch.
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
