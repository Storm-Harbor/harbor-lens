import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  await page.goto("");
  if (!info.title.startsWith("demo login")) {
    await page
      .getByRole("button", { name: "Simulate GitHub", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Simulate MFA verification", exact: true })
      .click();
  }
});
const navigate = (page, view) =>
  page.locator(`nav button[data-view="${view}"]`).click();
const dialog = (page) => page.getByRole("dialog");
async function add(page, label, provider = "GCP") {
  await page.locator("#add").click();
  await dialog(page).getByLabel("Display name", { exact: true }).fill(label);
  await dialog(page)
    .getByLabel("Provider", { exact: true })
    .selectOption(provider);
  await dialog(page)
    .getByRole("button", { name: "Create fixture", exact: true })
    .click();
}

test("overview, infrastructure, topology and catalog parity through actual UI", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Observation", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Operation", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "View infrastructure", exact: true })
    .click();
  await expect(
    page.getByText("CPU utilization: Not measured", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fixture age (min): Unknown", { exact: true }),
  ).toBeVisible();
  await navigate(page, "topology");
  await expect(
    page
      .getByRole("list", { name: "Synthetic dependency chain" })
      .getByRole("listitem"),
  ).toHaveCount(4);
  for (const locale of ["pt-BR", "en-GB"]) {
    await page.locator("#locale").selectOption(locale);
    for (const view of [
      "overview",
      "inventory",
      "topology",
      "recovery",
      "activity",
    ]) {
      await navigate(page, view);
      expect(await page.locator("main").innerText()).not.toContain("undefined");
    }
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  }
  await page
    .getByRole("button", { name: "Recovery", exact: true })
    .last()
    .click();
  await expect(page.locator("#run-form")).toBeVisible();
  await navigate(page, "overview");
  await page.screenshot({
    path: "test-results/harbor-lens-desktop.png",
    fullPage: true,
  });
});

test("bounded input, modal dismissal, safe labels and no persistence", async ({
  page,
}) => {
  await page.locator("#add").click();
  await expect(page.locator("#label")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toBeVisible();
  await page.locator("#add").click();
  await dialog(page)
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await page.locator("#add").click();
  await dialog(page)
    .getByRole("button", { name: "Create fixture", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Enter a display name between 1 and 60 characters.",
  );
  await dialog(page)
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  const label = `<img src=x onerror="alert('x')">&`;
  await add(page, label, "Oracle Cloud");
  await expect(
    page.getByRole("rowheader", { name: label, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("rowheader", { name: label, exact: true }).locator("img"),
  ).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Synthetic Harbor added.");
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Explore Harbor Lens", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate GitHub", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Simulate MFA verification", exact: true })
    .click();
  await expect(
    page.getByRole("rowheader", { name: label, exact: true }),
  ).toHaveCount(0);
  await page.locator("h1").click();
});

test("simulation advances to completion and reports scoped history", async ({
  page,
}) => {
  await navigate(page, "recovery");
  await page.locator("#target").selectOption("atlas-recovery");
  await page
    .getByRole("button", { name: "Start simulation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "No live action occurred.",
  );
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Complete next phase", exact: true })
      .click();
  await expect(
    page.getByRole("cell", { name: "Completed", exact: true }),
  ).toBeVisible();
  await navigate(page, "activity");
  await expect(
    page.getByRole("cell", { name: "Atlas recovery", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "3 / 3 · Simulated", exact: true }),
  ).toBeVisible();
});

test("switching demo projects isolates fixtures, active simulations and cancellation history", async ({
  page,
}) => {
  await add(page, "Atlas-only fixture", "AWS");
  await navigate(page, "recovery");
  await page
    .getByRole("button", { name: "Start simulation", exact: true })
    .click();
  await page.locator("#scope").selectOption("demo-orbit");
  await expect(page.getByRole("rowheader", { name: /SIM-/ })).toHaveCount(0);
  await expect(page.locator("#target option")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Start simulation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel simulation", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Cancelled", exact: true }),
  ).toBeVisible();
  await page.locator("#scope").selectOption("demo-atlas");
  await expect(
    page.getByRole("button", { name: "Cancel simulation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Cancelled", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cancel simulation", exact: true })
    .click();
  await navigate(page, "inventory");
  await expect(
    page.getByRole("rowheader", { name: "Atlas-only fixture", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset sandbox", exact: true })
    .click();
  await expect(
    page.getByRole("rowheader", { name: "Atlas-only fixture", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Sandbox reset.");
  await navigate(page, "activity");
  await expect(
    page.getByRole("heading", { name: "No simulations yet" }),
  ).toBeVisible();
});

test("provider selection, invalid forged options and quota have safe UI outcomes", async ({
  page,
}) => {
  await page.locator("#add").click();
  await page.locator("#label").fill("Invented fixture");
  await page.locator("#provider").evaluate((el) => {
    el.add(new Option("invalid", "invalid"));
    el.value = "invalid";
  });
  await dialog(page)
    .getByRole("button", { name: "Create fixture", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Select an available provider.",
  );
  await page.locator("#provider").selectOption("Azure");
  await dialog(page)
    .getByRole("button", { name: "Create fixture", exact: true })
    .click();
  for (let i = 0; i < 8; i++)
    await add(page, `Synthetic ${i}`, i % 2 ? "DigitalOcean" : "GCP");
  await add(page, "Over quota");
  await expect(page.getByRole("alert")).toHaveText(
    "This demo project allows up to 12 Harbors.",
  );
  await page.keyboard.press("Escape");
  await navigate(page, "recovery");
  await page.locator("#target").evaluate((el) => {
    el.add(new Option("foreign", "orbit-primary"));
    el.value = "orbit-primary";
  });
  await page
    .getByRole("button", { name: "Start simulation", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Select a Harbor in this demo project.",
  );
});

test("mobile menu supports keyboard, Escape, selection and no page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", {
    name: "Toggle navigation",
    exact: true,
  });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await menu.click();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await navigate(page, "topology");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#main")).toBeFocused();
  for (const view of [
    "overview",
    "inventory",
    "topology",
    "recovery",
    "activity",
  ]) {
    await menu.click();
    await navigate(page, view);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await menu.click();
  await navigate(page, "overview");
  await page.screenshot({
    path: "test-results/harbor-lens-mobile.png",
    fullPage: true,
  });
});

test("sandbox policy blocks network APIs and exposes no application/API routes", async ({
  page,
}) => {
  const external = [];
  page.on("request", (req) => {
    if (new URL(req.url()).origin !== new URL(page.url()).origin)
      external.push(req.url());
  });
  const notices = await page.request.get("/THIRD_PARTY_NOTICES.txt");
  expect(notices.status()).toBe(200);
  expect(await notices.text()).toContain("react@19.2.8");
  expect(await notices.text()).toContain("Permission is hereby granted");
  const blocked = await page.evaluate(async () => {
    try {
      await fetch("https://invalid.example/never-send");
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  expect(external).toEqual([]);
  for (const path of [
    "/api/harbors",
    "/login",
    "/.git/config",
    "/src/._app.mjs",
    "/unknown",
  ])
    expect((await page.request.get(path)).status()).toBe(404);
  await expect(page.locator(".mode-strip")).toContainText(
    "No live connections",
  );
});

test("demo login requires simulated MFA for every provider and logout discards changes", async ({
  page,
}) => {
  const external = [];
  page.on("request", (req) => {
    if (new URL(req.url()).origin !== new URL(page.url()).origin)
      external.push(req.url());
  });
  await expect(
    page.getByRole("heading", { name: "Explore Harbor Lens", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/harbor-lens-login.png",
    fullPage: true,
  });
  await expect(page.locator("input")).toHaveCount(0);
  for (const provider of ["Google", "Company SSO", "GitHub"]) {
    await page
      .getByRole("button", { name: `Simulate ${provider}`, exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Mandatory MFA · simulation",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Choose another provider", exact: true })
      .click();
    await page
      .getByRole("button", { name: `Simulate ${provider}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Simulate MFA verification", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    await add(page, "Discard on logout");
    await page
      .getByRole("button", { name: "Leave sandbox", exact: true })
      .click();
  }
  expect(external).toEqual([]);
  await page.locator("#entry-locale").selectOption("pt-BR");
  await expect(
    page.getByRole("heading", { name: "Explore o Harbor Lens", exact: true }),
  ).toBeVisible();
});
