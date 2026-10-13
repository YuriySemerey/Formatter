# Formatter

Electron application for formatting copied Ukrainian product price lists and general text. Formatting works offline. Raw pasted input is never persisted.

## Development

Use Node.js 22 (see `.nvmrc`) and install the exact dependency tree from `package-lock.json`:

```bash
nvm use
npm ci
npm run test
npm run electron:dev
```

Production verification:

```bash
npm run build
npm run smoke:electron
npm run preflight
```

## Installers

- macOS: `npm run dist:mac` creates `.dmg` and `.zip` for `arm64` and `x64`.
- Windows: run `npm ci && npm run dist:win` on Windows to create the x64 NSIS `.exe`.
- `npm run pack` creates an unpacked application for local inspection.
- Build outputs are written to the ignored `release/` directory.

The stable identity is `com.dw.formatter` / `Formatter`. Do not change either value between versions: installed updates then reuse the same settings, history, logs, and brand-override storage.

## Country and Category

Settings -> Appearance contains independent **Show country** and **Show category** switches. Both start enabled, including when upgrading old settings or importing old backups. They affect the next Format action; saved history and the current editable output are preserved.

Country uses the existing brand-country field and user overrides. It is not verified manufacturing-country data for each individual product.

## Updates

Settings -> About contains **Check for updates**. Only this user action starts a network check against public releases in [YuriySemerey/Formatter](https://github.com/YuriySemerey/Formatter).

- Windows: check, explicitly download, then choose **Restart and update**. Download progress is shown. Nothing installs automatically on exit.
- macOS: check, download the matching arm64 or x64 DMG, close Formatter and install the new version over the previous one. Mac builds intentionally have no Apple Developer certificate and use manual installation.
- Browser/development and smoke-test runs do not enable update network requests.
- Missing releases, offline operation, and failed downloads leave formatting available.

Version 0.2.0 has no updater. Install 0.3.0 manually the first time. User data remains in Electron's platform `userData` directory.

Before an update, `Settings -> About` can export one JSON backup containing settings, the latest two formatted outputs, and brand overrides. Raw input is excluded.

## GitHub Releases

The intended public repository is `YuriySemerey/Formatter`. Code and release installers are public; downloading release installers requires no GitHub account. Repository creation and the first push/release require the project owner's confirmation.

`.github/workflows/build-installers.yml` builds macOS and Windows independently. A `vX.Y.Z` tag matching package.json creates a release only after both builds and checks pass. All installers, blockmaps and update metadata are uploaded to a draft before it is made available. An ordinary push does not publish; a manual workflow run builds artifacts without publishing.

Local packaging always uses `--publish never`. To preserve older local unpacked applications, use a version-specific output directory:

```bash
npm run dist:mac -- --config.directories.output=release/0.3.0
```

The release workflow and optional Windows signing secrets are documented in [RELEASE.md](RELEASE.md).

## Persisted Data

- Versioned application settings and the latest two outputs are stored in renderer local storage.
- Brand edits are stored atomically as `avto-pro-brand-overrides.json` in Electron `userData`.
- Technical startup and critical-error logs are stored locally and can be opened from `Settings -> Logging`.
- Pasted input text is not persisted or included in backups.
