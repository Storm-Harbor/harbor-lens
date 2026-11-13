import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { catalogs } from "./catalogs.mjs";
import { defaultLocale, localeOptions } from "./locales/config";

const i18n = createInstance();
i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries(catalogs).map(([locale, translation]) => [
      locale,
      { translation },
    ]),
  ),
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  supportedLngs: localeOptions.map((locale) => locale.code),
  load: "currentOnly",
  initImmediate: false,
  interpolation: { escapeValue: false },
});
export default i18n;
