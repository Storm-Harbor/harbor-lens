import { test, expect } from "@playwright/test";
import { catalogs } from "../../src/catalogs.mjs";

// Independent product-website baseline: locale IDs, native overview and direction.
const baseline = [
  ["en-GB", "Overview", "ltr"],
  ["en-US", "Overview", "ltr"],
  ["es-ES", "Resumen", "ltr"],
  ["ca-ES", "Resum", "ltr"],
  ["pt-PT", "Visão geral", "ltr"],
  ["pt-BR", "Visão geral", "ltr"],
  ["it-IT", "Panoramica", "ltr"],
  ["ru-RU", "Обзор", "ltr"],
  ["de-DE", "Übersicht", "ltr"],
  ["fr-FR", "Vue d'ensemble", "ltr"],
  ["uk-UA", "Огляд", "ltr"],
  ["et-EE", "Ülevaade", "ltr"],
  ["pl-PL", "Przegląd", "ltr"],
  ["bg-BG", "Общ преглед", "ltr"],
  ["zh-Hans", "概览", "ltr"],
  ["hi-IN", "अवलोकन", "ltr"],
  ["ja-JP", "概要", "ltr"],
  ["he-IL", "סקירה", "rtl"],
  ["ur-PK", "جائزہ", "rtl"],
  ["af-ZA", "Oorsig", "ltr"],
  ["ar", "نظرة عامة", "rtl"],
  ["ko-KR", "개요", "ltr"],
  ["tr-TR", "Genel bakış", "ltr"],
  ["id-ID", "Ringkasan", "ltr"],
  ["vi-VN", "Tổng quan", "ltr"],
];

for (const [code, title, dir] of baseline) {
  test(`${code}: localized access, views, simulation, validation and mobile direction`, async ({
    page,
    baseURL,
  }) => {
    const unexpected = [];
    const origin = new URL(baseURL).origin;
    page.on("request", (req) => {
      if (new URL(req.url()).origin !== origin) unexpected.push(req.url());
    });
    await page.goto("");
    expect(
      await page
        .locator("#entry-locale option")
        .evaluateAll((options) => options.map((o) => o.value)),
    ).toEqual(baseline.map(([id]) => id));
    await page.locator("#entry-locale").selectOption(code);
    await expect(page.locator("html")).toHaveAttribute("lang", code);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    const c = catalogs[code];
    await expect(
      page.getByText(c.fakeLoginNote, { exact: true }),
    ).toBeVisible();
    await expect(page.locator("input")).toHaveCount(0);
    await page
      .getByRole("button", {
        name: `${c.continueWith} ${c.companySso}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: c.demoMfa, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(c.fakeMfaNote, { exact: true })).toBeVisible();
    await page.locator("#entry-locale").selectOption("en-GB");
    await expect(page.locator(".demo-identity")).toContainText("Company SSO");
    await page.locator("#entry-locale").selectOption(code);
    await expect(page.locator(".demo-identity")).toContainText(c.companySso);
    await page.getByRole("button", { name: c.verifyDemo, exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: c.readiness, exact: true }),
    ).toBeVisible();
    expect(
      await page
        .locator("#locale option")
        .evaluateAll((options) => options.map((o) => o.value)),
    ).toEqual(baseline.map(([id]) => id));
    await expect(
      page.getByRole("button", { name: c.observation, exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: c.operation, exact: true }),
    ).toBeDisabled();
    for (const view of [
      "inventory",
      "topology",
      "recovery",
      "activity",
      "overview",
    ]) {
      await page.locator(`nav [data-view="${view}"]`).click();
      await expect(
        page.getByRole("heading", { level: 1, name: c[view], exact: true }),
      ).toBeVisible();
      expect(await page.locator("main").innerText()).not.toContain("undefined");
    }
    await page.locator('nav [data-view="recovery"]').click();
    await page.getByRole("button", { name: c.start, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(c.startDone);
    await page.getByRole("button", { name: c.advance, exact: true }).click();
    await page.getByRole("button", { name: c.cancel, exact: true }).click();
    await expect(
      page.getByRole("cell", { name: c.cancelled, exact: true }),
    ).toBeVisible();
    await page.locator("#scenario").selectOption("backupFailure");
    await page.getByRole("button", { name: c.start, exact: true }).click();
    for (let phase = 0; phase < 2; phase++)
      await page.getByRole("button", { name: c.advance, exact: true }).click();
    await expect(page.getByRole("note")).toContainText(c.backupFailure);
    await page.getByRole("button", { name: c.retry, exact: true }).click();
    await expect(page.locator("#scenario")).toBeDisabled();
    await page.getByRole("button", { name: c.cancel, exact: true }).click();
    await page.locator("#add").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: c.create, exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(c.invalidLabel);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#menu").click();
    await expect
      .poll(async () => {
        const box = await page.locator("#navigation").boundingBox();
        return (
          box.x >= 0 &&
          box.x + box.width <= 391 &&
          (dir === "rtl" ? box.x > 100 : Math.abs(box.x) < 1)
        );
      })
      .toBe(true);
    await page.locator('nav [data-view="topology"]').click();
    await expect(page.locator("#menu")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(page.locator(".joint-element")).toHaveCount(8);
    await page.getByRole("button", { name: c.zoomIn, exact: true }).click();
    await page.getByRole("button", { name: c.fit, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (dir === "rtl")
      await page.screenshot({
        path: `test-results/harbor-lens-${code}.png`,
        fullPage: true,
      });
    await page.locator("#locale").selectOption("en-GB");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    expect(unexpected).toEqual([]);
  });
}
