import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { catalogs } from "./catalogs.mjs";

const i18n = createInstance();
i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries(catalogs).map(([locale, translation]) => [
      locale,
      { translation },
    ]),
  ),
  lng: "en",
  fallbackLng: "en",
  initImmediate: false,
  interpolation: { escapeValue: false },
});
export default i18n;
