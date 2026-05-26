import { useState } from "preact/hooks";
import { config, saveConfig, addToast } from "../state";
import { api } from "../api/client";

export function Settings() {
  const [baseUrl, setBaseUrl] = useState(config.value.baseUrl);
  const [apiKey, setApiKey] = useState(config.value.apiKey);
  const [userId, setUserId] = useState(String(config.value.userId));
  const [testing, setTesting] = useState(false);

  async function handleSave() {
    const cfg = {
      baseUrl: baseUrl.replace(/\/+$/, ""),
      apiKey,
      userId: parseInt(userId) || 1,
    };
    saveConfig(cfg);
    addToast("success", "Settings saved");
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await api.health();
      addToast(
        "success",
        `Worker online — v${res.version} (uptime ${Math.round(res.uptime)}s)`,
      );
    } catch (e: any) {
      addToast("error", `Connection failed: ${e.message}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div class="max-w-xl space-y-6 animate-fade-in">
      <div>
        <h2 class="text-xl font-bold text-surface-100">Settings</h2>
        <p class="text-sm text-surface-500 mt-1">Configure the connection to your worker backend.</p>
      </div>

      <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl p-5 space-y-5">
        <div>
          <label class="block text-[13px] text-surface-300 mb-1.5 font-medium">Worker URL</label>
          <input
            value={baseUrl}
            onInput={(e) => setBaseUrl((e.target as HTMLInputElement).value)}
            placeholder="http://localhost:5001 (leave empty for same-origin)"
            class="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
          <p class="text-[11px] text-surface-500 mt-1.5">Leave empty if serving from the same origin (production) or through Vite proxy (dev).</p>
        </div>

        <div>
          <label class="block text-[13px] text-surface-300 mb-1.5 font-medium">API Key</label>
          <input
            value={apiKey}
            onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
            type="password"
            class="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
          <p class="text-[11px] text-surface-500 mt-1.5">Must match the SHARED_API_KEY in your worker's .env file.</p>
        </div>

        <div>
          <label class="block text-[13px] text-surface-300 mb-1.5 font-medium">User ID</label>
          <input
            value={userId}
            onInput={(e) => setUserId((e.target as HTMLInputElement).value)}
            type="number"
            class="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
          <p class="text-[11px] text-surface-500 mt-1.5">Sent as X-User-Id header for user-scoped operations.</p>
        </div>

        <div class="flex gap-3 pt-1">
          <button
            onClick={handleSave}
            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Save Changes
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            class="px-5 py-2.5 bg-surface-800 hover:bg-surface-700 disabled:opacity-50 text-surface-200 text-sm font-medium rounded-lg border border-surface-700/50 transition-colors flex items-center gap-2"
          >
            {testing && <div class="w-3.5 h-3.5 border-2 border-surface-500 border-t-surface-200 rounded-full animate-spin" />}
            {testing ? "Testing..." : "Test Connection"}
          </button>
        </div>
      </div>

      <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-surface-200 mb-3">About</h3>
        <div class="text-sm text-surface-400 space-y-1.5">
          <p class="font-medium text-surface-300">SeriesAPI Worker Dashboard <span class="text-surface-500">v1.0.0</span></p>
          <p>Built with Preact + Tailwind CSS + Vite</p>
          <p class="text-surface-500 text-xs pt-1">Manages file downloads and FFmpeg transcoding for the SeriesAPI platform.</p>
        </div>
      </div>
    </div>
  );
}
