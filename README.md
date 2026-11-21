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

## Custom Brands and Names

Settings -> Brands -> **Додати бренд** adds a custom brand with a name, category and country. Category and country may remain unknown. Use **Змінити назву** beside an existing brand to rename it; this also works for brands from the built-in list. Apply the form, then click **Зберегти**. Changes affect the next Format action.

Renaming keeps the original and previous names available for recognizing copied price lists. Duplicate names, including aliases, are rejected. **База** restores a built-in brand; **Видалити** removes a custom brand from the draft. **Скасувати** reverts drafts to the last saved list. Existing output/history is preserved.

Custom brands and renamed entries persist between launches, in brand JSON exports/imports, and in full backups. Old backups remain supported. The built-in Avto.pro data file is kept intact; saved changes are stored separately.

## Custom Categories

Settings -> Brands -> **Категорії** opens the category editor. Enter a name and click **Додати категорію**, or use **Змінити назву** beside an existing category and apply the new name. All five built-in category names and custom category names are editable. Then click the shared **Зберегти** button. The new category appears in the brand form, brand rows and category filter.

Category assignments keep a stable ID when a name changes, so every assigned brand uses the new name at the next Format action. Existing output/history is preserved. **Скасувати** reverts unsaved brand and category changes together. Empty and duplicate category names are rejected.

Category definitions persist in settings and full backups. Brand JSON exports now include category definitions with the brand records in a versioned `formatter-brand-library` file; importing legacy brand arrays remains supported and preserves the current category names. An import with a missing category definition is rejected before saved data is replaced. Older settings and backups automatically keep the original five category names.

## Copying to HelpCrunch and Other Editors

Use **Copy**, a history entry's copy button, or **Cmd+C / Ctrl+C** on selected text in the result field. Formatter provides both unchanged plain text and escaped HTML with explicit line breaks and spacer lines between groups. Rich-text editors can keep the section separation without inheriting Formatter's font or colors. Paste normally with **Cmd+V / Ctrl+V**; pasting as plain text lets the receiving editor control blank-line handling.

`npm run smoke:electron -- --clipboard-smoke-test` checks actual system-clipboard copying and native paste in a local rich-text field. It restores supported clipboard content afterwards and stops before modifying a clipboard containing unsupported custom formats. The test does not open HelpCrunch or send messages.

Add `--brand-smoke-test` to verify creating, saving, reloading and formatting with custom/renamed brands and categories through the production UI using an isolated test profile.

## Updates

Settings -> About contains **Check for updates**. Only this user action starts a network check against public releases in [YuriySemerey/Formatter](https://github.com/YuriySemerey/Formatter).

- Windows: check, explicitly download, then choose **Restart and update**. Download progress is shown. Nothing installs automatically on exit.
- macOS: check, download the matching arm64 or x64 DMG, close Formatter and install the new version over the previous one. Mac builds intentionally have no Apple Developer certificate and use manual installation.
- Mac 0.3.2 and later use verified ad-hoc signatures for the whole app bundle. They are not Apple-notarized: first launch of a downloaded copy can require approval in System Settings -> Privacy & Security -> Open Anyway. Signature integrity and native launch from the actual DMG/ZIP are checked before release.
- Browser/development and smoke-test runs do not enable update network requests.
- Missing releases, offline operation, and failed downloads leave formatting available.

Version 0.2.0 has no updater. Install 0.3.0 manually the first time. User data remains in Electron's platform `userData` directory.

Before an update, `Settings -> About` can export one JSON backup containing settings, the latest two formatted outputs, and brand overrides. Raw input is excluded.

## GitHub Releases

The public repository is [YuriySemerey/Formatter](https://github.com/YuriySemerey/Formatter). Code and release installers are public; downloading release installers requires no GitHub account. Prepare and review a release before the project owner authorizes publication.

`.github/workflows/build-installers.yml` builds macOS and Windows independently. An explicit push to `release/vX.Y.Z` matching package.json publishes after both builds and checks pass, creating the version tag at the exact tested commit. Existing `vX.Y.Z` tag pushes also remain supported. All installers, blockmaps and update metadata are verified in an unpublished draft before it becomes available. Ordinary pushes to `main` and manual workflow runs only build artifacts.

An authorized release can be started through the connected GitHub tools by advancing its release branch; no local terminal, personal access token or manual Actions click is required. Published releases and existing tags at another commit are never replaced. See [Releases](https://github.com/YuriySemerey/Formatter/releases) for the permanent public downloads.

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
