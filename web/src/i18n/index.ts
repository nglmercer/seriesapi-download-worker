import { signal } from "@preact/signals";
import en from "./en";
import es from "./es";

type Translations = Record<string, string>;

const locales: Record<string, Translations> = { en: en as unknown as Translations, es: es as unknown as Translations };

const stored = typeof localStorage !== "undefined" ? localStorage.getItem("locale") : null;
export const locale = signal<string>(stored || (typeof navigator !== "undefined" && navigator.language.startsWith("es") ? "es" : "en"));

export function setLocale(lang: string) {
  locale.value = lang;
  localStorage.setItem("locale", lang);
}

export function t(key: string, vars?: Record<string, string | number>, fallback?: string): string {
  const dict = locales[locale.value] || (en as unknown as Translations);
  let text = dict[key] || (en as unknown as Translations)[key] || fallback || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

export type TranslationKey = keyof typeof en;
