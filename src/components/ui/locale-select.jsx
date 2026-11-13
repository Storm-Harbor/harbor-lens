import { localeOptions } from "@/locales/config";
export function LocaleSelect({ id, i18n, label }) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={i18n.resolvedLanguage}
        onChange={(event) => i18n.changeLanguage(event.target.value)}
      >
        {localeOptions.map((locale) => (
          <option
            key={locale.code}
            value={locale.code}
            lang={locale.code}
            dir={locale.dir}
          >
            {locale.label}
          </option>
        ))}
      </select>
    </>
  );
}
