import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nextProvider } from "react-i18next";
import { BrowserRouter } from "react-router-dom";
import { ShieldCheck, Code2, Building2, ArrowRight, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocaleSelect } from "@/components/ui/locale-select";
import { localeInfo } from "@/locales/config";
import App from "@/App";
import i18n from "@/i18n";
import mark from "@/mark.svg";

export function SandboxAccess() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState("");
  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage;
    document.documentElement.dir = localeInfo[i18n.resolvedLanguage].dir;
  }, [i18n.resolvedLanguage]);
  const [session, setSession] = useState(false);
  if (session)
    return (
      <App
        onLogout={() => {
          setSession(false);
          setProvider("");
        }}
      />
    );
  return (
    <main className="access-page">
      <section className="access-brand">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <img src={mark} width="42" height="42" alt="" />
          <span>
            Harbor Lens<small>STORM HARBOR</small>
          </span>
        </a>
        <div>
          <span className="eyebrow">
            {t("sandbox")} · {t("synthetic")}
          </span>
          <h1>{t("accessTitle")}</h1>
          <p>{t("accessText")}</p>
          <div className="access-steps">
            <span>01 · {t("inventory")}</span>
            <span>02 · {t("topology")}</span>
            <span>03 · {t("recovery")}</span>
          </div>
        </div>
        <small>{t("noLive")}</small>
      </section>
      <section className="access-panel">
        <LocaleSelect id="entry-locale" i18n={i18n} label={t("language")} />
        <div className="access-card">
          <span className="sandbox-badge">{t("demoLogin")}</span>
          <h2>{t(provider ? "demoMfa" : "welcome")}</h2>
          <p>{t("fakeLoginNote")}</p>
          {provider ? (
            <>
              <div className="demo-identity">
                <ShieldCheck aria-hidden="true" />
                <span>
                  {provider === "companySso" ? t("companySso") : provider}
                  <small>demo@stormharbor.example</small>
                </span>
              </div>
              <p className="notice">{t("fakeMfaNote")}</p>
              <Button variant="default" onClick={() => setSession(true)}>
                {t("verifyDemo")}
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button onClick={() => setProvider("")}>{t("back")}</Button>
            </>
          ) : (
            <div className="provider-buttons">
              {[
                ["GitHub", Code2],
                ["Google", Globe],
                ["companySso", Building2],
              ].map(([name, Icon]) => (
                <Button key={name} onClick={() => setProvider(name)}>
                  <Icon aria-hidden="true" />
                  {t("continueWith")}{" "}
                  {name === "companySso" ? t("companySso") : name}
                  <ArrowRight aria-hidden="true" />
                </Button>
              ))}
            </div>
          )}
          <p className="caption">{t("sessionNote")}</p>
        </div>
      </section>
    </main>
  );
}
export default function SandboxEntry() {
  return (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <SandboxAccess />
      </BrowserRouter>
    </I18nextProvider>
  );
}
