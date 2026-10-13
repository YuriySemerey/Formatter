export type UpdateStatus = "idle" | "checking" | "up-to-date" | "no-release" | "available" | "downloading" | "downloaded" | "opening-download" | "manual-install" | "installing" | "error" | "unavailable";

export interface UpdateState {
  status: UpdateStatus;
  mode: "automatic" | "manual" | "unavailable";
  currentVersion: string;
  availableVersion?: string;
  downloadPercent?: number;
  message: string;
}
