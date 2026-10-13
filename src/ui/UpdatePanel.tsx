import { Download, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UpdateState } from "../../electron/updateTypes";

const UNAVAILABLE_STATE: UpdateState = {
  status: "unavailable",
  mode: "unavailable",
  currentVersion: "",
  message: "Оновлення доступні у встановленій версії для macOS або Windows."
};

export function UpdatePanel() {
  const [state, setState] = useState<UpdateState>(UNAVAILABLE_STATE);
  const [pending, setPending] = useState(false);
  const mounted = useRef(false);
  const bridge = window.formatterApp;

  useEffect(() => {
    mounted.current = true;
    if (!bridge?.getUpdateState || !bridge.onUpdateState) return () => { mounted.current = false; };
    let active = true;
    let receivedEvent = false;
    const unsubscribe = bridge.onUpdateState((next) => {
      receivedEvent = true;
      if (active && mounted.current) setState(next);
    });
    void bridge.getUpdateState().then((next) => {
      if (active && mounted.current && !receivedEvent) setState(next);
    }).catch(() => {
      if (active && mounted.current) setState((previous) => ({ ...previous, status: "error", message: "Не вдалося отримати стан оновлення." }));
    });
    return () => { active = false; mounted.current = false; unsubscribe(); };
  }, [bridge]);

  const busy = pending || ["checking", "downloading", "opening-download", "installing"].includes(state.status);

  async function runAction(action: (() => Promise<UpdateState>) | undefined) {
    if (!action || busy) return;
    setPending(true);
    try {
      const next = await action();
      if (mounted.current) setState(next);
    } catch {
      if (mounted.current) setState((previous) => ({ ...previous, status: "error", message: "Не вдалося виконати оновлення. Спробуйте ще раз." }));
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return (
    <section className="settings-card" aria-label="Оновлення програми">
      <div>
        <h3>Оновлення</h3>
        <p>Нові версії Formatter доступні після публікації релізу на GitHub.</p>
        {state.mode === "manual" && <p>На macOS нову версію потрібно встановити вручну поверх поточної.</p>}
      </div>
      <div className="update-controls">
        <div className="settings-actions-row">
          <button type="button" disabled={!bridge?.checkForUpdates || state.mode === "unavailable" || busy || state.status === "downloaded"}
            onClick={() => runAction(bridge?.checkForUpdates)}>
            <RefreshCw size={18} /> Перевірити оновлення
          </button>
          {state.status === "available" && (
            <button type="button" className="primary" disabled={busy} onClick={() => runAction(bridge?.downloadUpdate)}>
              <Download size={18} /> {state.mode === "manual" ? "Завантажити DMG" : "Завантажити оновлення"}
            </button>
          )}
          {state.status === "downloaded" && state.mode === "automatic" && (
            <button type="button" className="primary" disabled={busy} onClick={() => runAction(bridge?.installUpdate)}>
              <RefreshCw size={18} /> Перезапустити та оновити
            </button>
          )}
        </div>
        {state.availableVersion && <p>Доступна версія: <strong>{state.availableVersion}</strong></p>}
        <p className={`update-message ${state.status === "error" ? "update-error" : ""}`} role="status">{state.message}</p>
        {state.status === "downloading" && (
          <div className="update-progress">
            <progress aria-label="Завантаження оновлення" max={100} value={state.downloadPercent ?? 0} />
            <span>{Math.round(state.downloadPercent ?? 0)}%</span>
          </div>
        )}
      </div>
    </section>
  );
}
