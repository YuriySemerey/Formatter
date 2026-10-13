import {
  Clipboard,
  Code2,
  Copy,
  Download,
  Eraser,
  FileText,
  History,
  Info,
  ListChecks,
  Pin,
  Play,
  RotateCcw,
  Save,
  Search,
  Settings as SettingsIcon,
  Tags,
  Trash2,
  Undo2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BRAND_CATEGORY_LABELS,
  getBrandCatalog,
  normalizeBrandKey,
  sanitizeBrandOverrides,
  type BrandCatalogEntry,
  type BrandOverride,
  type BrandQualityCategory
} from "../formatter/brandRegistry";
import { createFormatterBackup, normalizeFormatterBackup } from "../formatter/backup";
import { formatGenericText } from "../formatter/genericText";
import { formatProductPriceList } from "../formatter/productPriceList";
import {
  addHistoryItem,
  DEFAULT_GENERIC_OPTIONS,
  loadHistory,
  loadSettings,
  saveHistory,
  saveSettings
} from "../formatter/settings";
import type { AppSettings, Encoding, FormatterMode, HistoryItem } from "../formatter/types";
import { loadBrowserBrandOverrides, saveBrowserBrandOverrides, serializeBrandOverrides } from "./brandOverrideStorage";
import { UpdatePanel } from "./UpdatePanel";

const ENCODINGS: Encoding[] = ["UTF-8", "UTF-16LE", "Windows-1251", "ISO-8859-1", "ASCII"];
const BRAND_CATEGORIES = Object.keys(BRAND_CATEGORY_LABELS) as BrandQualityCategory[];
const UNKNOWN_COUNTRY_LABEL = "країна не визначена";
type BrandStorageMode = "electron" | "browser";
type BrandIssueFilter = "all" | "missingCountry" | "missingCategory";
type SettingsSection = "appearance" | "logging" | "brands" | "about";
type LogLevel = "info" | "warning" | "error";

interface LogEntry {
  id: string;
  createdAt: string;
  level: LogLevel;
  message: string;
}

export function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("Готово");
  const [activeView, setActiveView] = useState<"formatter" | "settings">("formatter");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [logsWindowOpen, setLogsWindowOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [brandOverrides, setBrandOverrides] = useState<BrandOverride[]>([]);
  const [brandDraftOverrides, setBrandDraftOverrides] = useState<BrandOverride[]>([]);
  const [brandStorageMode, setBrandStorageMode] = useState<BrandStorageMode>(window.formatterApp?.loadBrandOverrides ? "electron" : "browser");
  const [appInfo, setAppInfo] = useState<FormatterAppInfo>({ name: "Formatter", version: "Browser/dev", platform: "browser", arch: "" });

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    window.formatterApp
      ?.getAppInfo?.()
      .then(setAppInfo)
      .catch(() => updateStatus("Не вдалося отримати версію програми", "warning"));
  }, []);

  useEffect(() => {
    if (!window.formatterApp?.loadBrandOverrides) {
      const loadedOverrides = loadBrowserBrandOverrides();
      setBrandOverrides(loadedOverrides);
      setBrandDraftOverrides(loadedOverrides);
      setBrandStorageMode("browser");
      updateStatus("Редактор брендів: Browser localStorage", "info", { log: false });
      return;
    }

    setBrandStorageMode("electron");
    window.formatterApp
      .loadBrandOverrides()
      .then((loadedOverrides) => {
        const sanitized = sanitizeBrandOverrides(loadedOverrides);
        setBrandOverrides(sanitized);
        setBrandDraftOverrides(sanitized);
        updateStatus("Редактор брендів: Electron", "info", { log: false });
      })
      .catch(() => {
        updateStatus("Не вдалося завантажити правки брендів", "error");
      });
  }, []);

  useEffect(() => {
    if (!window.formatterApp?.setAlwaysOnTop) {
      if (settings.alwaysOnTop) {
        updateStatus("Режим поверх вікон недоступний: застосунок запущено не через Electron", "warning");
      }
      return;
    }

    window.formatterApp
      .setAlwaysOnTop(settings.alwaysOnTop)
      .then((pinState) => {
        if (pinState.requested && pinState.applied) {
          updateStatus("Вікно закріплено поверх інших");
          return;
        }

        if (pinState.requested && !pinState.applied) {
          updateStatus(pinState.error ? `Не вдалося закріпити вікно: ${pinState.error}` : "Не вдалося закріпити вікно поверх інших", "warning");
          return;
        }

        if (!pinState.requested && pinState.applied) {
          updateStatus("Звичайний режим вікна");
        }
      })
      .catch(() => {
        updateStatus("Не вдалося змінити режим вікна", "error");
      });
  }, [settings.alwaysOnTop]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    if (settings.formatterMode !== "product-price-list") {
      setHistoryDrawerOpen(false);
    }
  }, [settings.formatterMode]);

  const previewStats = useMemo(() => {
    return {
      inputChars: input.length,
      outputChars: output.length,
      historyCount: history.length,
      brandOverridesCount: brandOverrides.length,
      logCount: logs.length
    };
  }, [brandOverrides.length, history.length, input.length, output.length, logs.length]);

  const isProductPriceListMode = settings.formatterMode === "product-price-list";
  const isCompact = settings.appearanceDensity === "compact";

  function updateSettings(partial: Partial<AppSettings>) {
    setSettings((current) => ({
      ...current,
      ...partial
    }));

    if (partial.formatterMode) {
      updateStatus(partial.formatterMode === "product-price-list" ? "Режим змінено: Прайс-лист товарів" : "Режим змінено: Загальний текст");
    }

    if (partial.actionButtonsPlacement) {
      updateStatus(
        partial.actionButtonsPlacement === "aboveInput"
          ? "Кнопки Format / Copy / Clear переміщено над вхідний текст"
          : "Кнопки Format / Copy / Clear переміщено над результат"
      );
    }

    if (typeof partial.loggingEnabled === "boolean") {
      updateStatus(partial.loggingEnabled ? "Логування увімкнено" : "Логування вимкнено", "info", { forceLog: partial.loggingEnabled });
    }
  }

  function addLog(level: LogLevel, message: string, force = false) {
    if (!force && !settings.loggingEnabled) {
      return;
    }

    setLogs((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: new Date().toISOString(),
        level,
        message
      },
      ...current
    ].slice(0, 200));

    void window.formatterApp?.appendTechnicalLog?.(level, message).catch(() => undefined);
  }

  function updateStatus(message: string, level: LogLevel = "info", options: { log?: boolean; forceLog?: boolean } = {}) {
    setStatus(message);
    if (options.log === false) {
      return;
    }

    addLog(level, message, Boolean(options.forceLog));
  }

  function formatText() {
    const formatted =
      settings.formatterMode === "product-price-list"
        ? formatProductPriceList(input, brandOverrides, settings)
        : formatGenericText(input, settings.genericOptions);

    setOutput(formatted);
    if (formatted.trim()) {
      setHistory((current) => addHistoryItem(current, formatted));
      updateStatus("Сформатовано і додано в історію");
    } else {
      updateStatus("Немає даних для форматування", "warning");
    }
  }

  async function copyText(value: string) {
    if (!value.trim()) {
      updateStatus("Немає тексту для копіювання", "warning");
      return;
    }

    if (window.formatterApp?.writeClipboard) {
      await window.formatterApp.writeClipboard(value);
    } else {
      await navigator.clipboard.writeText(value);
    }

    updateStatus("Скопійовано");
  }

  function clearText() {
    setInput("");
    setOutput("");
    updateStatus("Текст очищено");
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      formatText();
    }
  }

  function deleteHistoryItem(id: string) {
    setHistory((current) => current.filter((item) => item.id !== id));
    updateStatus("Запис історії видалено");
  }

  async function saveBrandDrafts(nextDrafts = brandDraftOverrides) {
    if (!window.formatterApp?.saveBrandOverrides) {
      const saved = saveBrowserBrandOverrides(nextDrafts);
      setBrandOverrides(saved);
      setBrandDraftOverrides(saved);
      setBrandStorageMode("browser");
      updateStatus(`Правки збережено локально в browser-режимі: ${saved.length}`);
      return true;
    }

    try {
      const sanitized = sanitizeBrandOverrides(nextDrafts);
      const saved = sanitizeBrandOverrides(await window.formatterApp.saveBrandOverrides(sanitized as BrandOverridePayload[]));
      setBrandOverrides(saved);
      setBrandDraftOverrides(saved);
      updateStatus(`Збережено правки брендів: ${saved.length}`);
      return true;
    } catch {
      updateStatus("Не вдалося зберегти правки брендів", "error");
      return false;
    }
  }

  async function exportBrandDrafts() {
    if (!window.formatterApp?.exportBrandOverrides) {
      exportBrandOverridesFromBrowser(brandDraftOverrides);
      updateStatus("Правки брендів експортовано з browser-режиму");
      return;
    }

    try {
      const sanitized = sanitizeBrandOverrides(brandDraftOverrides);
      const result = await window.formatterApp.exportBrandOverrides(sanitized as BrandOverridePayload[]);
      updateStatus(result.canceled ? "Експорт скасовано" : "Правки брендів експортовано", result.canceled ? "warning" : "info");
    } catch {
      updateStatus("Не вдалося експортувати правки брендів", "error");
    }
  }

  async function importBrandDrafts() {
    if (!window.formatterApp?.importBrandOverrides) {
      try {
        const imported = await importBrandOverridesFromBrowserFile();
        const saved = saveBrowserBrandOverrides(imported);
        setBrandOverrides(saved);
        setBrandDraftOverrides(saved);
        setBrandStorageMode("browser");
        updateStatus(`Імпортовано правки брендів у browser-режимі: ${saved.length}`);
      } catch (error) {
        updateStatus(
          error instanceof Error && error.message === "browser-import-canceled" ? "Імпорт скасовано" : "Не вдалося імпортувати файл правок брендів",
          error instanceof Error && error.message === "browser-import-canceled" ? "warning" : "error"
        );
      }
      return;
    }

    try {
      const result = await window.formatterApp.importBrandOverrides();
      if (result.canceled) {
        updateStatus("Імпорт скасовано", "warning");
        return;
      }

      const imported = sanitizeBrandOverrides(result.overrides);
      setBrandOverrides(imported);
      setBrandDraftOverrides(imported);
      updateStatus(`Імпортовано правки брендів: ${imported.length}`);
    } catch {
      updateStatus("Не вдалося імпортувати файл правок брендів", "error");
    }
  }

  async function copyLogs() {
    const value = logs
      .slice()
      .reverse()
      .map((entry) => `${formatLogTime(entry.createdAt)} ${entry.level} ${entry.message}`)
      .join("\n");

    if (!value.trim()) {
      updateStatus("Немає логів для копіювання", "warning");
      return;
    }

    if (window.formatterApp?.writeClipboard) {
      await window.formatterApp.writeClipboard(value);
    } else {
      await navigator.clipboard.writeText(value);
    }

    updateStatus("Логи скопійовано");
  }

  function clearLogs() {
    setLogs([]);
    setStatus("Логи очищено");
  }

  async function exportBackup() {
    const backupInput = {
      settings,
      history,
      brandOverrides: sanitizeBrandOverrides(brandOverrides)
    };

    try {
      if (window.formatterApp?.exportBackup) {
        const result = await window.formatterApp.exportBackup(backupInput);
        updateStatus(result.canceled ? "Експорт резервної копії скасовано" : "Резервну копію експортовано", result.canceled ? "warning" : "info");
        return;
      }

      downloadJsonFile("formatter-backup.json", createFormatterBackup(backupInput, appInfo.version));
      updateStatus("Резервну копію експортовано в browser-режимі");
    } catch {
      updateStatus("Не вдалося експортувати резервну копію", "error");
    }
  }

  async function importBackup() {
    try {
      const backupCandidate = window.formatterApp?.importBackup
        ? (await window.formatterApp.importBackup()).backup
        : await importBrowserBackupFile();

      if (!backupCandidate) {
        updateStatus("Імпорт резервної копії скасовано", "warning");
        return;
      }

      const backup = normalizeFormatterBackup(backupCandidate);
      setSettings(backup.settings);
      setHistory(backup.history);
      if (!(await saveBrandDrafts(backup.brandOverrides))) {
        return;
      }
      updateStatus("Резервну копію імпортовано");
    } catch (error) {
      const canceled = error instanceof Error && error.message === "browser-import-canceled";
      updateStatus(canceled ? "Імпорт резервної копії скасовано" : "Не вдалося імпортувати резервну копію", canceled ? "warning" : "error");
    }
  }

  async function openTechnicalLog() {
    if (!window.formatterApp?.openTechnicalLog) {
      updateStatus("Технічний лог доступний у встановленій Electron-версії", "warning");
      return;
    }

    try {
      const result = await window.formatterApp.openTechnicalLog();
      updateStatus(result.error ? "Файл логу показано у файловому менеджері" : "Технічний лог відкрито", result.error ? "warning" : "info");
    } catch {
      updateStatus("Не вдалося відкрити технічний лог", "error");
    }
  }

  async function clearTechnicalLog() {
    if (!window.formatterApp?.clearTechnicalLog) {
      updateStatus("Технічний лог доступний у встановленій Electron-версії", "warning");
      return;
    }

    try {
      await window.formatterApp.clearTechnicalLog();
      updateStatus("Технічний лог очищено", "info", { log: false });
    } catch {
      updateStatus("Не вдалося очистити технічний лог", "error");
    }
  }

  return (
    <main className={`app-shell ${settings.darkMode ? "theme-dark" : ""} density-${settings.appearanceDensity}`}>
      <header className="topbar">
        <div className="utility-controls" aria-label="Швидкі налаштування">
          <label className={`utility-select mode-select ${isCompact ? "icon-select" : ""}`} title="Режим">
            {isCompact ? <FileText className="utility-select-icon" size={18} aria-hidden="true" /> : <span>Режим</span>}
            <select
              aria-label="Режим"
              value={settings.formatterMode}
              onChange={(event) => updateSettings({ formatterMode: event.target.value as FormatterMode })}
            >
              <option value="product-price-list">Прайс-лист товарів</option>
              <option value="generic-text">Загальний текст</option>
            </select>
          </label>

          <label className={`switch-field utility-switch ${isCompact ? "icon-only-control" : ""}`} title="Поверх всіх вікон">
            {isCompact ? <Pin size={18} aria-hidden="true" /> : <span>Поверх всіх вікон</span>}
            <input
              type="checkbox"
              role="switch"
              aria-label="Поверх всіх вікон"
              checked={settings.alwaysOnTop}
              onChange={(event) => {
                updateSettings({ alwaysOnTop: event.target.checked });
                updateStatus(event.target.checked ? "Вмикаю режим поверх всіх вікон..." : "Вимикаю режим поверх всіх вікон...");
              }}
            />
            <span className="switch-slider" aria-hidden="true" />
          </label>

          <button
            type="button"
            className={`utility-button ${activeView === "formatter" ? "active" : ""} ${isCompact ? "icon-only-control" : ""}`}
            title="Форматер"
            aria-label="Форматер"
            onClick={() => setActiveView("formatter")}
          >
            <Play size={18} />
            {!isCompact && "Форматер"}
          </button>

          <label className={`utility-select encoding-select ${isCompact ? "icon-select" : ""}`} title="Кодування">
            {isCompact ? <Code2 className="utility-select-icon" size={18} aria-hidden="true" /> : <span>Кодування</span>}
            <select aria-label="Кодування" value={settings.encoding} onChange={(event) => updateSettings({ encoding: event.target.value as Encoding })}>
              {ENCODINGS.map((encoding) => (
                <option key={encoding} value={encoding}>
                  {encoding}
                </option>
              ))}
            </select>
          </label>

          {isProductPriceListMode && (
            <button
              type="button"
              className={`utility-button ${historyDrawerOpen && activeView === "formatter" ? "active" : ""} ${isCompact ? "icon-only-control" : ""}`}
              title={`Історія: ${previewStats.historyCount}/2`}
              aria-label={`Історія: ${previewStats.historyCount}/2`}
              onClick={() => {
                setActiveView("formatter");
                setHistoryDrawerOpen((current) => !current);
              }}
            >
              <History size={18} />
              {!isCompact && (
                <>
                  Історія
                  <span>{previewStats.historyCount}/2</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            className={`utility-button ${activeView === "settings" ? "active" : ""} ${isCompact ? "icon-only-control" : ""}`}
            title="Налаштування"
            aria-label="Налаштування"
            onClick={() => {
              setActiveView("settings");
              setSettingsSection("appearance");
            }}
          >
            <SettingsIcon size={18} />
            {!isCompact && "Налаштування"}
          </button>
        </div>

        <div className="sr-only" aria-live="polite">
          {status}
        </div>
      </header>

      {activeView === "formatter" ? (
        <>
          {settings.formatterMode === "generic-text" && (
            <GenericOptions settings={settings} onChange={(genericOptions) => updateSettings({ genericOptions })} />
          )}

          <section className={`workspace ${isProductPriceListMode ? "product-workspace" : ""}`}>
            <div className="editor-column">
              {settings.actionButtonsPlacement === "aboveInput" && (
                <ActionButtons onFormat={formatText} onCopy={() => copyText(output)} onClear={clearText} />
              )}
              <div className="editor-panel">
                <div className="panel-header">
                  <h2>Вхідний текст</h2>
                  <span>{previewStats.inputChars} символів</span>
                </div>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  spellCheck={false}
                  placeholder="Вставте скопійований прайс-лист..."
                />
              </div>
            </div>

            <div className="editor-column">
              {settings.actionButtonsPlacement === "aboveOutput" && (
                <ActionButtons onFormat={formatText} onCopy={() => copyText(output)} onClear={clearText} />
              )}
              <div className="editor-panel">
                <div className="panel-header">
                  <h2>Результат</h2>
                  <span>{previewStats.outputChars} символів</span>
                </div>
                <textarea
                  value={output}
                  onChange={(event) => setOutput(event.target.value)}
                  spellCheck={false}
                  placeholder="Сформатований текст з'явиться тут..."
                />
              </div>
            </div>

            {isProductPriceListMode ? (
              historyDrawerOpen && (
                <HistoryPanel
                  history={history}
                  historyCount={previewStats.historyCount}
                  drawer
                  onClose={() => setHistoryDrawerOpen(false)}
                  onInsert={setOutput}
                  onCopy={copyText}
                  onDelete={deleteHistoryItem}
                />
              )
            ) : (
              <HistoryPanel
                history={history}
                historyCount={previewStats.historyCount}
                onInsert={setOutput}
                onCopy={copyText}
                onDelete={deleteHistoryItem}
              />
            )}
          </section>
        </>
      ) : (
        <SettingsPanel
          settings={settings}
          section={settingsSection}
          brandOverridesCount={previewStats.brandOverridesCount}
          brandDrafts={brandDraftOverrides}
          brandSaved={brandOverrides}
          brandStorageMode={brandStorageMode}
          appInfo={appInfo}
          logCount={previewStats.logCount}
          onChange={updateSettings}
          onSectionChange={setSettingsSection}
          onOpenLogs={() => setLogsWindowOpen(true)}
          onClearLogs={clearLogs}
          onOpenTechnicalLog={openTechnicalLog}
          onClearTechnicalLog={clearTechnicalLog}
          onExportBackup={exportBackup}
          onImportBackup={importBackup}
          onBrandChange={setBrandDraftOverrides}
          onBrandSave={() => saveBrandDrafts()}
          onBrandRevert={() => {
            setBrandDraftOverrides(brandOverrides);
            updateStatus("Незбережені зміни брендів скасовано", "warning");
          }}
          onBrandExport={exportBrandDrafts}
          onBrandImport={importBrandDrafts}
        />
      )}

      {logsWindowOpen && (
        <LogsWindow logs={logs} onClose={() => setLogsWindowOpen(false)} onClear={clearLogs} onCopy={copyLogs} />
      )}
    </main>
  );
}

function HistoryPanel({
  history,
  historyCount,
  drawer = false,
  onClose,
  onInsert,
  onCopy,
  onDelete
}: {
  history: HistoryItem[];
  historyCount: number;
  drawer?: boolean;
  onClose?: () => void;
  onInsert: (output: string) => void;
  onCopy: (output: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className={`history-panel ${drawer ? "history-drawer" : ""}`} aria-label="Історія">
      <div className="panel-header">
        <h2>
          <History size={18} />
          Історія
        </h2>
        <div className="panel-header-actions">
          <span>{historyCount}/2</span>
          {onClose && (
            <button type="button" title="Закрити історію" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <div className="empty-history">
          <ListChecks size={22} />
          <span>Останні результати з'являться після форматування.</span>
        </div>
      ) : (
        <div className="history-list">
          {history.map((item) => (
            <article className="history-item" key={item.id}>
              <time>{formatTimestamp(item.createdAt)}</time>
              <p>{preview(item.output)}</p>
              <div className="history-actions">
                <button type="button" title="Вставити в результат" onClick={() => onInsert(item.output)}>
                  <Clipboard size={16} />
                  Insert
                </button>
                <button type="button" title="Скопіювати" onClick={() => onCopy(item.output)}>
                  <Copy size={16} />
                  Copy
                </button>
                <button type="button" title="Видалити" onClick={() => onDelete(item.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}

function ActionButtons({
  onFormat,
  onCopy,
  onClear
}: {
  onFormat: () => void;
  onCopy: () => void;
  onClear: () => void;
}) {
  return (
    <div className="panel-actions" aria-label="Команди форматування">
      <button type="button" className="primary" onClick={onFormat}>
        <Play size={18} />
        Format
      </button>
      <button type="button" onClick={onCopy}>
        <Copy size={18} />
        Copy
      </button>
      <button type="button" onClick={onClear}>
        <Eraser size={18} />
        Clear
      </button>
    </div>
  );
}

function LogsWindow({
  logs,
  onClose,
  onClear,
  onCopy
}: {
  logs: LogEntry[];
  onClose: () => void;
  onClear: () => void;
  onCopy: () => void;
}) {
  const [levelFilter, setLevelFilter] = useState<LogLevel | "all">("all");
  const visibleLogs = levelFilter === "all" ? logs : logs.filter((entry) => entry.level === levelFilter);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="logs-window" role="dialog" aria-modal="true" aria-label="Логи">
        <div className="logs-window-header">
          <h2>
            <FileText size={20} />
            Логи
          </h2>
          <button type="button" title="Закрити" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="logs-toolbar">
          <label>
            <span>Рівень</span>
            <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as LogLevel | "all")}>
              <option value="all">Усі</option>
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="error">error</option>
            </select>
          </label>
          <div className="logs-toolbar-actions">
            <button type="button" onClick={onCopy}>
              <Copy size={18} />
              Copy
            </button>
            <button type="button" onClick={onClear}>
              <Trash2 size={18} />
              Очистити
            </button>
          </div>
        </div>

        {visibleLogs.length === 0 ? (
          <div className="empty-history">
            <ListChecks size={22} />
            <span>Логів для показу немає.</span>
          </div>
        ) : (
          <div className="logs-list">
            {visibleLogs.map((entry) => (
              <article className={`log-entry ${entry.level}`} key={entry.id}>
                <time>{formatLogTime(entry.createdAt)}</time>
                <span className={`log-level ${entry.level}`}>{entry.level}</span>
                <p>{entry.message}</p>
              </article>
            ))}
          </div>
        )}

        <div className="logs-window-footer">
          <span>Логи зберігаються тільки для поточної сесії.</span>
          <button type="button" onClick={onClose}>
            Закрити
          </button>
        </div>
      </section>
    </div>
  );
}

function SettingsPanel({
  settings,
  section,
  brandOverridesCount,
  brandDrafts,
  brandSaved,
  brandStorageMode,
  appInfo,
  logCount,
  onChange,
  onSectionChange,
  onOpenLogs,
  onClearLogs,
  onOpenTechnicalLog,
  onClearTechnicalLog,
  onExportBackup,
  onImportBackup,
  onBrandChange,
  onBrandSave,
  onBrandRevert,
  onBrandExport,
  onBrandImport
}: {
  settings: AppSettings;
  section: SettingsSection;
  brandOverridesCount: number;
  brandDrafts: BrandOverride[];
  brandSaved: BrandOverride[];
  brandStorageMode: BrandStorageMode;
  appInfo: FormatterAppInfo;
  logCount: number;
  onChange: (partial: Partial<AppSettings>) => void;
  onSectionChange: (section: SettingsSection) => void;
  onOpenLogs: () => void;
  onClearLogs: () => void;
  onOpenTechnicalLog: () => void;
  onClearTechnicalLog: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onBrandChange: (overrides: BrandOverride[]) => void;
  onBrandSave: () => void;
  onBrandRevert: () => void;
  onBrandExport: () => void;
  onBrandImport: () => void;
}) {
  return (
    <section className="settings-panel" aria-label="Налаштування">
      <div className="panel-header settings-panel-header">
        <h2>
          <SettingsIcon size={18} />
          Налаштування
        </h2>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Розділи налаштувань">
        <button type="button" className={section === "appearance" ? "active" : ""} onClick={() => onSectionChange("appearance")}>
          <SettingsIcon size={18} />
          Вигляд
        </button>
        <button type="button" className={section === "logging" ? "active" : ""} onClick={() => onSectionChange("logging")}>
          <FileText size={18} />
          Логування
          <span>{logCount}</span>
        </button>
        <button type="button" className={section === "brands" ? "active" : ""} onClick={() => onSectionChange("brands")}>
          <Tags size={18} />
          Бренди
          <span>{brandOverridesCount}</span>
        </button>
        <button type="button" className={section === "about" ? "active" : ""} onClick={() => onSectionChange("about")}>
          <Info size={18} />
          Про програму
        </button>
      </div>

      {section === "appearance" ? (
        <section className="settings-card" aria-label="Вигляд">
            <div>
              <h3>Вигляд</h3>
              <p>Зміни застосовуються одразу і автоматично зберігаються між запусками.</p>
            </div>
            <div className="settings-switches">
              <label className="switch-field">
                <span>Показувати країну</span>
                <input type="checkbox" role="switch" checked={settings.showBrandCountry}
                  onChange={(event) => onChange({ showBrandCountry: event.target.checked })} />
                <span className="switch-slider" aria-hidden="true" />
              </label>
              <label className="switch-field">
                <span>Показувати категорію</span>
                <input type="checkbox" role="switch" checked={settings.showBrandCategory}
                  onChange={(event) => onChange({ showBrandCategory: event.target.checked })} />
                <span className="switch-slider" aria-hidden="true" />
              </label>
              <p>Поля додаються до прайс-листа після натискання Format. Країна — наявне поле бренду або ваша ручна правка.</p>
              <label className="switch-field">
                <span>Dark Mode</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.darkMode}
                  onChange={(event) => onChange({ darkMode: event.target.checked })}
                />
                <span className="switch-slider" aria-hidden="true" />
              </label>

              <div className="density-setting">
                <span>Щільність інтерфейсу</span>
                <div className="segmented-control" role="group" aria-label="Щільність інтерфейсу">
                  <button
                    type="button"
                    className={settings.appearanceDensity === "standard" ? "active" : ""}
                    onClick={() => onChange({ appearanceDensity: "standard" })}
                  >
                    Стандарт
                  </button>
                  <button
                    type="button"
                    className={settings.appearanceDensity === "compact" ? "active" : ""}
                    onClick={() => onChange({ appearanceDensity: "compact" })}
                  >
                    Компакт
                  </button>
                </div>
              </div>

              <div className="density-setting">
                <span>Кнопки Format / Copy / Clear</span>
                <div className="segmented-control" role="group" aria-label="Розташування кнопок Format Copy Clear">
                  <button
                    type="button"
                    className={settings.actionButtonsPlacement === "aboveInput" ? "active" : ""}
                    onClick={() => onChange({ actionButtonsPlacement: "aboveInput" })}
                  >
                    Над Вхідний текст
                  </button>
                  <button
                    type="button"
                    className={settings.actionButtonsPlacement === "aboveOutput" ? "active" : ""}
                    onClick={() => onChange({ actionButtonsPlacement: "aboveOutput" })}
                  >
                    Над Результат
                  </button>
                </div>
              </div>
            </div>
        </section>
      ) : section === "logging" ? (
        <section className="settings-card" aria-label="Логування">
          <div>
            <h3>Логування</h3>
            <p>Журнал дій доступний у поточній сесії. Окремий технічний файл зберігає запуск і критичні помилки локально на комп'ютері.</p>
          </div>
          <div className="settings-switches">
            <label className="switch-field">
              <span>Увімкнути логування</span>
              <input
                type="checkbox"
                role="switch"
                checked={settings.loggingEnabled}
                onChange={(event) => onChange({ loggingEnabled: event.target.checked })}
              />
              <span className="switch-slider" aria-hidden="true" />
            </label>

            <div className="settings-actions-row">
              <button type="button" onClick={onOpenLogs}>
                <FileText size={18} />
                Відкрити логи
                <span>{logCount}</span>
              </button>
              <button type="button" onClick={onClearLogs}>
                <Trash2 size={18} />
                Очистити логи
              </button>
              <button type="button" onClick={onOpenTechnicalLog}>
                <FileText size={18} />
                Відкрити технічний лог
              </button>
              <button type="button" onClick={onClearTechnicalLog}>
                <Trash2 size={18} />
                Очистити технічний лог
              </button>
            </div>
          </div>
        </section>
      ) : section === "brands" ? (
        <BrandEditor
          drafts={brandDrafts}
          saved={brandSaved}
          onChange={onBrandChange}
          onSave={onBrandSave}
          onRevert={onBrandRevert}
          onExport={onBrandExport}
          onImport={onBrandImport}
          storageMode={brandStorageMode}
        />
      ) : (
        <>
          <section className="settings-card app-info-card" aria-label="Про програму">
            <div className="settings-card-title">
              <Info size={22} />
              <div>
                <h3>Formatter</h3>
                <p>Прайс-листи товарів, історія на 2 результати, локальні налаштування.</p>
              </div>
            </div>
            <dl className="app-version-details">
              <div>
                <dt>Версія</dt>
                <dd>{appInfo.version}</dd>
              </div>
              <div>
                <dt>Платформа</dt>
                <dd>{appInfo.platform}{appInfo.arch ? ` / ${appInfo.arch}` : ""}</dd>
              </div>
            </dl>
          </section>

          <UpdatePanel />

          <section className="settings-card" aria-label="Резервна копія">
            <div>
              <h3>Резервна копія</h3>
              <p>Один JSON-файл містить налаштування, два останні результати та ручні правки брендів. Вхідний текст не експортується.</p>
            </div>
            <div className="settings-actions-row">
              <button type="button" onClick={onExportBackup}>
                <Download size={18} />
                Експорт резервної копії
              </button>
              <button type="button" onClick={onImportBackup}>
                <Upload size={18} />
                Імпорт резервної копії
              </button>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function exportBrandOverridesFromBrowser(overrides: BrandOverride[]) {
  downloadTextFile("avto-pro-brand-overrides.json", serializeBrandOverrides(overrides));
}

function downloadJsonFile(fileName: string, value: unknown) {
  downloadTextFile(fileName, `${JSON.stringify(value, null, 2)}\n`);
}

function downloadTextFile(fileName: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importBrowserBackupFile(): Promise<FormatterBackupPayload> {
  return importJsonFile().then((parsed) => normalizeFormatterBackup(parsed) as unknown as FormatterBackupPayload);
}

function importJsonFile(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";

    input.addEventListener(
      "change",
      async () => {
        const file = input.files?.[0];
        if (!file) {
          reject(new Error("browser-import-canceled"));
          return;
        }

        try {
          resolve(JSON.parse(await file.text()));
        } catch (error) {
          reject(error instanceof Error ? error : new Error("browser-import-failed"));
        }
      },
      { once: true }
    );

    input.click();
  });
}

function importBrandOverridesFromBrowserFile(): Promise<BrandOverride[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";

    input.addEventListener(
      "change",
      async () => {
        const file = input.files?.[0];
        if (!file) {
          reject(new Error("browser-import-canceled"));
          return;
        }

        try {
          const raw = await file.text();
          const parsed = JSON.parse(raw);
          resolve(sanitizeBrandOverrides(parsed));
        } catch (error) {
          reject(error instanceof Error ? error : new Error("browser-import-failed"));
        }
      },
      { once: true }
    );

    input.click();
  });
}

function GenericOptions({
  settings,
  onChange
}: {
  settings: AppSettings;
  onChange: (options: AppSettings["genericOptions"]) => void;
}) {
  const options = settings.genericOptions;

  function patch(partial: Partial<AppSettings["genericOptions"]>) {
    onChange({ ...options, ...partial });
  }

  return (
    <section className="generic-options" aria-label="Загальні правила">
      <label>
        <input type="checkbox" checked={options.trimLines} onChange={(event) => patch({ trimLines: event.target.checked })} />
        Trim рядків
      </label>
      <label>
        <input
          type="checkbox"
          checked={options.collapseEmptyLines}
          onChange={(event) => patch({ collapseEmptyLines: event.target.checked })}
        />
        Стиснути порожні рядки
      </label>
      <label>
        <span>Макс. порожніх</span>
        <input
          type="number"
          min={0}
          max={5}
          value={options.maxEmptyLines}
          onChange={(event) => patch({ maxEmptyLines: Number(event.target.value) })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={options.convertTabsToSpaces}
          onChange={(event) => patch({ convertTabsToSpaces: event.target.checked })}
        />
        Таби в пробіли
      </label>
      <label>
        <span>Ширина таба</span>
        <input
          type="number"
          min={1}
          max={12}
          value={options.tabWidth}
          onChange={(event) => patch({ tabWidth: Number(event.target.value) })}
        />
      </label>
      <label>
        <span>Регістр</span>
        <select value={options.caseMode} onChange={(event) => patch({ caseMode: event.target.value as typeof options.caseMode })}>
          <option value="none">Без змін</option>
          <option value="lower">lowercase</option>
          <option value="upper">UPPERCASE</option>
          <option value="sentence">Sentence case</option>
          <option value="title">Title Case</option>
        </select>
      </label>
      <button type="button" onClick={() => onChange(DEFAULT_GENERIC_OPTIONS)}>
        <RotateCcw size={16} />
        Reset
      </button>
    </section>
  );
}

function BrandEditor({
  drafts,
  saved,
  onChange,
  onSave,
  onRevert,
  onExport,
  onImport,
  storageMode
}: {
  drafts: BrandOverride[];
  saved: BrandOverride[];
  onChange: (overrides: BrandOverride[]) => void;
  onSave: () => void;
  onRevert: () => void;
  onExport: () => void;
  onImport: () => void;
  storageMode: BrandStorageMode;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<BrandQualityCategory | "all">("all");
  const [issueFilter, setIssueFilter] = useState<BrandIssueFilter>("all");

  const baseCatalog = useMemo(() => getBrandCatalog(), []);
  const draftCatalog = useMemo(() => getBrandCatalog(drafts), [drafts]);
  const hasUnsavedChanges = useMemo(() => JSON.stringify(sanitizeBrandOverrides(drafts)) !== JSON.stringify(sanitizeBrandOverrides(saved)), [drafts, saved]);
  const issueStats = useMemo(() => getBrandIssueStats(draftCatalog), [draftCatalog]);

  const filteredCatalog = useMemo(() => {
    const normalizedQuery = query.toLocaleLowerCase("uk").trim();
    const normalizedKeyQuery = normalizeBrandKey(query);

    return draftCatalog.filter((entry) => {
      if (categoryFilter !== "all" && entry.category !== categoryFilter) {
        return false;
      }

      if (!matchesBrandIssueFilter(entry, issueFilter)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableText = [
        entry.displayName,
        entry.country,
        entry.categoryLabel,
        ...entry.aliases
      ].join(" ");
      return (
        searchableText.toLocaleLowerCase("uk").includes(normalizedQuery) ||
        (Boolean(normalizedKeyQuery) && normalizeBrandKey(searchableText).includes(normalizedKeyQuery))
      );
    });
  }, [categoryFilter, draftCatalog, issueFilter, query]);

  function upsertBrandOverride(entry: BrandCatalogEntry, patch: Partial<Pick<BrandOverride, "category" | "country">>) {
    const base = findCatalogEntry(baseCatalog, entry.displayName);
    const currentOverride = findBrandOverride(drafts, entry.displayName);
    const category = patch.category ?? entry.category;
    const country = cleanupInputText(patch.country ?? entry.country);
    if (!country) {
      return;
    }

    const nextOverride: BrandOverride = {
      displayName: entry.displayName,
      aliases: currentOverride?.aliases ?? entry.aliases,
      category,
      country,
      isOriginal: category === "original",
      updatedAt: new Date().toISOString(),
      source: "user"
    };

    const withoutCurrent = drafts.filter((override) => normalizeBrandKey(override.displayName) !== normalizeBrandKey(entry.displayName));
    if (
      base &&
      nextOverride.category === base.category &&
      nextOverride.country === base.country &&
      nextOverride.isOriginal === base.isOriginal
    ) {
      onChange(withoutCurrent);
      return;
    }

    onChange([...withoutCurrent, nextOverride]);
  }

  function removeOverride(entry: BrandCatalogEntry) {
    onChange(drafts.filter((override) => normalizeBrandKey(override.displayName) !== normalizeBrandKey(entry.displayName)));
  }

  return (
    <section className="brand-panel" aria-label="Редактор брендів">
      <div className="brand-toolbar">
        <label className="search-field">
          <span>Пошук</span>
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} type="text" placeholder="Бренд, alias або країна..." />
        </label>

        <label>
          <span>Категорія</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as BrandQualityCategory | "all")}>
            <option value="all">Усі категорії</option>
            {BRAND_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {BRAND_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Проблеми</span>
          <select value={issueFilter} onChange={(event) => setIssueFilter(event.target.value as BrandIssueFilter)}>
            <option value="all">Усі записи</option>
            <option value="missingCountry">Без країни ({issueStats.missingCountry})</option>
            <option value="missingCategory">Без категорії ({issueStats.missingCategory})</option>
          </select>
        </label>

        <div className="brand-toolbar-actions">
          <button type="button" className="primary" onClick={onSave}>
            <Save size={18} />
            Зберегти
          </button>
          <button type="button" onClick={onRevert} disabled={!hasUnsavedChanges}>
            <Undo2 size={18} />
            Скасувати
          </button>
          <button type="button" onClick={onExport}>
            <Download size={18} />
            Експорт
          </button>
          <button type="button" onClick={onImport}>
            <Upload size={18} />
            Імпорт
          </button>
        </div>
      </div>

      <div className="brand-summary">
        <span>{filteredCatalog.length} показано</span>
        <span>{drafts.length} змінено</span>
        <span>Збереження: {storageMode === "electron" ? "Electron" : "Browser"}</span>
        <span>Без країни: {issueStats.missingCountry}</span>
        <span>Без категорії: {issueStats.missingCategory}</span>
        {hasUnsavedChanges && <strong>Є незбережені зміни</strong>}
      </div>

      <div className="brand-table-wrap">
        <table className="brand-table">
          <thead>
            <tr>
              <th>Бренд</th>
              <th>Категорія</th>
              <th>Країна реєстрації</th>
              <th>Alias-и</th>
              <th>Стан</th>
              <th>Дії</th>
            </tr>
          </thead>
          <tbody>
            {filteredCatalog.map((entry) => (
              <tr key={entry.displayName}>
                <td>
                  <strong>{entry.displayName}</strong>
                </td>
                <td>
                  <select
                    value={entry.category}
                    onChange={(event) => upsertBrandOverride(entry, { category: event.target.value as BrandQualityCategory })}
                  >
                    {BRAND_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {BRAND_CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input value={entry.country} onChange={(event) => upsertBrandOverride(entry, { country: event.target.value })} type="text" />
                </td>
                <td className="alias-cell">{entry.aliases.length > 0 ? entry.aliases.join(", ") : "—"}</td>
                <td>
                  <div className="badge-stack">
                    <span className={`source-badge ${sourceBadgeClass(entry)}`}>{sourceBadgeLabel(entry)}</span>
                    {brandIssueBadges(entry).map((badge) => (
                      <span className={`source-badge ${badge.className}`} key={badge.label}>
                        {badge.label}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <button type="button" className="small-button" onClick={() => removeOverride(entry)} disabled={!entry.overridden}>
                    <RotateCcw size={16} />
                    База
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function preview(output: string) {
  const firstLines = output.split("\n").filter(Boolean).slice(0, 4).join(" / ");
  return firstLines.length > 180 ? `${firstLines.slice(0, 180)}...` : firstLines;
}

function findCatalogEntry(entries: BrandCatalogEntry[], displayName: string) {
  const key = normalizeBrandKey(displayName);
  return entries.find((entry) => normalizeBrandKey(entry.displayName) === key);
}

function findBrandOverride(overrides: BrandOverride[], displayName: string) {
  const key = normalizeBrandKey(displayName);
  return overrides.find((override) => normalizeBrandKey(override.displayName) === key);
}

function cleanupInputText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getBrandIssueStats(entries: BrandCatalogEntry[]) {
  return entries.reduce(
    (stats, entry) => ({
      missingCountry: stats.missingCountry + (hasMissingCountry(entry) ? 1 : 0),
      missingCategory: stats.missingCategory + (hasMissingCategory(entry) ? 1 : 0)
    }),
    { missingCountry: 0, missingCategory: 0 }
  );
}

function matchesBrandIssueFilter(entry: BrandCatalogEntry, filter: BrandIssueFilter) {
  if (filter === "missingCountry") {
    return hasMissingCountry(entry);
  }

  if (filter === "missingCategory") {
    return hasMissingCategory(entry);
  }

  return true;
}

function brandIssueBadges(entry: BrandCatalogEntry) {
  const badges: Array<{ label: string; className: string }> = [];
  if (hasMissingCountry(entry)) {
    badges.push({ label: "без країни", className: "problem" });
  }

  if (hasMissingCategory(entry)) {
    badges.push({ label: "без категорії", className: "problem" });
  }

  return badges;
}

function hasMissingCountry(entry: BrandCatalogEntry) {
  return cleanupInputText(entry.country).toLocaleLowerCase("uk") === UNKNOWN_COUNTRY_LABEL;
}

function hasMissingCategory(entry: BrandCatalogEntry) {
  return entry.category === "unknown";
}

function sourceBadgeLabel(entry: BrandCatalogEntry) {
  if (entry.overridden || entry.source === "user") {
    return "Змінено";
  }

  if (entry.source === "avtoPro") {
    return "Avto.pro";
  }

  return "Невідомий";
}

function sourceBadgeClass(entry: BrandCatalogEntry) {
  if (entry.overridden || entry.source === "user") {
    return "changed";
  }

  if (entry.source === "avtoPro") {
    return entry.category === "unknown" ? "unknown" : "avto-pro";
  }

  return "avto-pro";
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatLogTime(value: string) {
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}
