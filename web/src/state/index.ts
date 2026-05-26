import { signal, computed } from "@preact/signals";
import type { DownloadTask, QueueTask, ApiConfig } from "../types";
import { api } from "../api/client";

export const config = signal<ApiConfig>(api.getConfig());
export const downloads = signal<DownloadTask[]>([]);
export const queueTasks = signal<QueueTask[]>([]);
export const queueTotal = signal(0);
export const queuePage = signal(1);
export const queueLimit = signal(20);
export const loading = signal(false);
export const toasts = signal<{ id: number; type: "success" | "error" | "info"; message: string }[]>([]);

let toastId = 0;

export function addToast(type: "success" | "error" | "info", message: string) {
  const id = ++toastId;
  toasts.value = [...toasts.value, { id, type, message }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, 4000);
}

export function saveConfig(cfg: ApiConfig) {
  config.value = cfg;
  api.setConfig(cfg);
}

export async function refreshDownloads() {
  try {
    const res = await api.listDownloads();
    downloads.value = res.tasks;
  } catch (e: any) {
    addToast("error", `Failed to load downloads: ${e.message}`);
  }
}

export async function refreshQueue(page?: number) {
  try {
    if (page) queuePage.value = page;
    const res = await api.listQueue(queuePage.value, queueLimit.value);
    queueTasks.value = res.rows;
    queueTotal.value = res.total;
  } catch (e: any) {
    addToast("error", `Failed to load queue: ${e.message}`);
  }
}

export function updateDownloadProgress(taskId: string, progress: number, status: string, extra?: Partial<DownloadTask>) {
  downloads.value = downloads.value.map((d) =>
    d.id === taskId ? { ...d, progress, status: status as DownloadTask["status"], ...extra } : d
  );
}

export function updateTranscodeProgress(taskId: number, progress: number, status: string) {
  queueTasks.value = queueTasks.value.map((t) =>
    t.id === taskId ? { ...t, progress, status } : t
  );
}

export const activeDownloads = computed(() => downloads.value.filter((d) => d.status === "downloading" || d.status === "pending" || d.status === "seeding"));
export const activeTranscodes = computed(() => queueTasks.value.filter((t) => t.status === "processing"));
export const completedDownloads = computed(() => downloads.value.filter((d) => d.status === "completed"));
export const completedTranscodes = computed(() => queueTasks.value.filter((t) => t.status === "completed"));
