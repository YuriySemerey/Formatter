import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UpdateState } from "../../electron/updateTypes";
import { UpdatePanel } from "./UpdatePanel";

afterEach(() => { cleanup(); delete window.formatterApp; });

function bridge(mode: "manual" | "automatic" = "automatic") {
  let listener: ((state: UpdateState) => void) | undefined;
  const idle: UpdateState = { mode, currentVersion: "0.3.0", status: "idle", message: "Перевірте нову версію." };
  const available: UpdateState = { ...idle, status: "available", availableVersion: "0.4.0", message: "Доступна нова версія." };
  const api = {
    getUpdateState: vi.fn(async () => idle),
    checkForUpdates: vi.fn(async () => available),
    downloadUpdate: vi.fn(async () => ({ ...available, status: mode === "manual" ? "manual-install" : "downloaded", message: "Завантажено." } as UpdateState)),
    installUpdate: vi.fn(async () => ({ ...available, status: "installing", message: "Перезапуск…" } as UpdateState)),
    onUpdateState: vi.fn((next: (state: UpdateState) => void) => { listener = next; return unsubscribe; })
  };
  const unsubscribe = vi.fn(() => { listener = undefined; });
  window.formatterApp = api as unknown as NonNullable<Window["formatterApp"]>;
  return { api, idle, available, unsubscribe, emit: (state: UpdateState) => act(() => listener?.(state)) };
}

describe("update panel", () => {
  it("is unavailable in browser mode without any network calls", () => {
    delete window.formatterApp; render(<UpdatePanel />);
    expect(screen.getByRole("button", { name: "Перевірити оновлення" })).toBeDisabled();
  });

  it("shows Windows download progress, exposes restart only after download, and unsubscribes", async () => {
    const h = bridge(); const view = render(<UpdatePanel />);
    const check = screen.getByRole("button", { name: "Перевірити оновлення" });
    await waitFor(() => expect(check).toBeEnabled());
    expect(h.api.checkForUpdates).not.toHaveBeenCalled();
    fireEvent.click(check);
    fireEvent.click(await screen.findByRole("button", { name: "Завантажити оновлення" }));
    await screen.findByRole("button", { name: "Перезапустити та оновити" });
    expect(h.api.installUpdate).not.toHaveBeenCalled();
    h.emit({ ...h.available, status: "downloading", downloadPercent: 37, message: "Завантаження…" });
    expect(screen.getByRole("progressbar", { name: "Завантаження оновлення" })).toHaveAttribute("value", "37");
    expect(screen.queryByRole("button", { name: "Перезапустити та оновити" })).not.toBeInTheDocument();
    h.emit({ ...h.available, status: "downloaded", message: "Готово до встановлення." });
    fireEvent.click(screen.getByRole("button", { name: "Перезапустити та оновити" }));
    await waitFor(() => expect(h.api.installUpdate).toHaveBeenCalledOnce());
    view.unmount(); expect(h.unsubscribe).toHaveBeenCalledOnce();
  });

  it("offers a Mac DMG with manual-install instructions and no restart button", async () => {
    const h = bridge("manual"); render(<UpdatePanel />);
    const check = screen.getByRole("button", { name: "Перевірити оновлення" });
    await waitFor(() => expect(check).toBeEnabled()); fireEvent.click(check);
    fireEvent.click(await screen.findByRole("button", { name: "Завантажити DMG" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Завантажено."));
    expect(screen.queryByRole("button", { name: "Перезапустити та оновити" })).not.toBeInTheDocument();
    expect(h.api.installUpdate).not.toHaveBeenCalled();
  });

  it("handles IPC failure and lets users retry", async () => {
    const h = bridge(); h.api.checkForUpdates.mockRejectedValueOnce(new Error("IPC disconnected"));
    render(<UpdatePanel />); const check = screen.getByRole("button", { name: "Перевірити оновлення" });
    await waitFor(() => expect(check).toBeEnabled()); fireEvent.click(check);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Не вдалося"));
    await waitFor(() => expect(check).toBeEnabled()); fireEvent.click(check);
    expect(await screen.findByRole("button", { name: "Завантажити оновлення" })).toBeEnabled();
  });
});
