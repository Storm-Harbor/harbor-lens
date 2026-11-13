// Owner-selected locale parity with the Storm Harbor product website.
export const localeOptions = [
  { code: "en-GB", label: "English (UK)", dir: "ltr" },
  { code: "en-US", label: "English (US)", dir: "ltr" },
  { code: "es-ES", label: "Español", dir: "ltr" },
  { code: "ca-ES", label: "Català", dir: "ltr" },
  { code: "pt-PT", label: "Português (Portugal)", dir: "ltr" },
  { code: "pt-BR", label: "Português (Brasil)", dir: "ltr" },
  { code: "it-IT", label: "Italiano", dir: "ltr" },
  { code: "ru-RU", label: "Русский", dir: "ltr" },
  { code: "de-DE", label: "Deutsch", dir: "ltr" },
  { code: "fr-FR", label: "Français", dir: "ltr" },
  { code: "uk-UA", label: "Українська", dir: "ltr" },
  { code: "et-EE", label: "Eesti", dir: "ltr" },
  { code: "pl-PL", label: "Polski", dir: "ltr" },
  { code: "bg-BG", label: "Български", dir: "ltr" },
  { code: "zh-Hans", label: "简体中文", dir: "ltr" },
  { code: "hi-IN", label: "हिन्दी", dir: "ltr" },
  { code: "ja-JP", label: "日本語", dir: "ltr" },
  { code: "he-IL", label: "עברית", dir: "rtl" },
  { code: "ur-PK", label: "اردو", dir: "rtl" },
  { code: "af-ZA", label: "Afrikaans", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "ko-KR", label: "한국어", dir: "ltr" },
  { code: "tr-TR", label: "Türkçe", dir: "ltr" },
  { code: "id-ID", label: "Bahasa Indonesia", dir: "ltr" },
  { code: "vi-VN", label: "Tiếng Việt", dir: "ltr" },
];
export const defaultLocale = "en-GB";
export const localeInfo = Object.fromEntries(
  localeOptions.map((item) => [item.code, item]),
);
