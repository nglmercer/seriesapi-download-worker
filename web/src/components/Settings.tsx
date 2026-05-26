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
        `Worker online: v${res.version} (uptime ${Math.round(res.uptime)}s)`,
      );
    } catch (e: any) {
      addToast("error", `Connection failed: ${e.message}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div class="max-w-xl space-y-6">
      <h2 class="text-xl font-bold text-surface-100">Settings</h2>

      <div class="bg-surface-900 border border-surface-800 rounded-xl p-5 space-y-4">
        <p class="text-sm text-surface-400">
          Configure the connection to the SeriesAPI Download Worker backend.
        </p>

        <div>
          <label class="block text-sm text-surface-300 mb-1">Worker URL</label>
          <input
            value={baseUrl}
            onInput={(e) => setBaseUrl((e.target as HTMLInputElement).value)}
            placeholder="http://localhost:5001 (leave empty for same-origin)"
            class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500"
          />
          <p class="text-xs text-surface-500 mt-1">
            Leave empty if serving through Vite proxy (dev mode)
          </p>
        </div>

        <div>
          <label class="block text-sm text-surface-300 mb-1">API Key</label>
          <input
            value={apiKey}
            onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
            type="password"
            class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500"
          />
          <p class="text-xs text-surface-500 mt-1">
            The SHARED_API_KEY from your worker's .env
          </p>
        </div>

        <div>
          <label class="block text-sm text-surface-300 mb-1">User ID</label>
          <input
            value={userId}
            onInput={(e) => setUserId((e.target as HTMLInputElement).value)}
            type="number"
            class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500"
          />
          <p class="text-xs text-surface-500 mt-1">
            Sent as X-User-Id header for user-scoped operations
          </p>
        </div>

        <div class="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Save
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            class="px-4 py-2 bg-surface-700 hover:bg-surface-600 disabled:opacity-50 text-surface-200 text-sm font-medium rounded-lg transition-colors"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
        </div>
      </div>

      <div class="bg-surface-900 border border-surface-800 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-surface-200 mb-3">About</h3>
        <div class="text-sm text-surface-400 space-y-1">
          <p>SeriesAPI Worker Dashboard v1.0.0</p>
          <p>Built with Preact + Tailwind CSS + Vite 8</p>
          <p>
            Manages file downloads and FFmpeg transcoding for the SeriesAPI
            platform.
          </p>
        </div>
      </div>
    </div>
  );
}
