import { useState } from "preact/hooks";
import { config, saveConfig, addToast } from "../state";
import { api } from "../api/client";
import { t } from "../i18n";

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
    addToast("success", t("settings.saved"));
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await api.health();
      addToast("success", t("settings.online", { version: res.version, uptime: Math.round(res.uptime) }));
    } catch (e: any) {
      addToast("error", t("settings.failed", { error: e.message }));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div class="max-w-xl space-y-6 animate-fade-in">
      <div>
        <h2 class="text-xl font-bold text-surface-100">{t("settings.title")}</h2>
        <p class="text-sm text-surface-500 mt-1">{t("settings.subtitle")}</p>
      </div>

      <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl p-5 space-y-5">
        <div>
          <label class="block text-[13px] text-surface-300 mb-1.5 font-medium">{t("settings.workerUrl")}</label>
          <input
            value={baseUrl}
            onInput={(e) => setBaseUrl((e.target as HTMLInputElement).value)}
            placeholder={t("settings.workerUrlPlaceholder")}
            class="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
          <p class="text-[11px] text-surface-500 mt-1.5">{t("settings.workerUrlHelp")}</p>
        </div>

        <div>
          <label class="block text-[13px] text-surface-300 mb-1.5 font-medium">{t("settings.apiKey")}</label>
          <input
            value={apiKey}
            onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
            type="password"
            class="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
          <p class="text-[11px] text-surface-500 mt-1.5">{t("settings.apiKeyHelp")}</p>
        </div>

        <div>
          <label class="block text-[13px] text-surface-300 mb-1.5 font-medium">{t("settings.userId")}</label>
          <input
            value={userId}
            onInput={(e) => setUserId((e.target as HTMLInputElement).value)}
            type="number"
            class="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg px-3 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
          <p class="text-[11px] text-surface-500 mt-1.5">{t("settings.userIdHelp")}</p>
        </div>

        <div class="flex gap-3 pt-1">
          <button
            onClick={handleSave}
            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {t("settings.save")}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            class="px-5 py-2.5 bg-surface-800 hover:bg-surface-700 disabled:opacity-50 text-surface-200 text-sm font-medium rounded-lg border border-surface-700/50 transition-colors flex items-center gap-2"
          >
            {testing && <div class="w-3.5 h-3.5 border-2 border-surface-500 border-t-surface-200 rounded-full animate-spin" />}
            {testing ? t("settings.testing") : t("settings.test")}
          </button>
        </div>
      </div>

      <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-surface-200 mb-3">{t("settings.about")}</h3>
        <div class="text-sm text-surface-400 space-y-1.5">
          <p class="font-medium text-surface-300">{t("settings.aboutTitle")}</p>
          <p>{t("settings.aboutBuilt")}</p>
          <p class="text-surface-500 text-xs pt-1">{t("settings.aboutDesc")}</p>
        </div>
      </div>
    </div>
  );
}
