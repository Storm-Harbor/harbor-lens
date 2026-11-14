import { test, expect } from "@playwright/test";

const click = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
const go = (page, view) => page.locator(`nav [data-view="${view}"]`).click();
const jobs = (page, state) =>
  page.locator(`[data-journey-job][data-step-state="${state}"]`);
test.beforeEach(async ({ page }) => {
  await page.goto("/journeys");
  await click(page, "Simulate GitHub");
  await click(page, "Simulate MFA verification");
});

test("Journeys renders custom JointJS phase lanes, dependencies, keyboard inspection, focus and YAML", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByRole("heading", { level: 1, name: "Journeys", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-journey-job]")).toHaveCount(8);
  await expect(page.locator("[data-journey-edge]")).toHaveCount(8);
  await expect(page.locator('.journey-paper [model-id^="phase-"]')).toHaveCount(
    3,
  );
  await page.locator('[data-journey-job="approve-plan"]').click();
  const inspector = page.getByRole("region", {
    name: "Inspect details",
    exact: true,
  });
  await expect(inspector).toContainText("Declared inputs");
  await click(page, "validate-manifest");
  await page
    .getByRole("button", {
      name: "Restore data · restore-database",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Enter");
  await expect(inspector).toContainText("mock/postgresql");
  await page.getByLabel("Focus dependencies", { exact: true }).check();
  await page.getByLabel("Filter steps", { exact: true }).fill("verify");
  await expect(page.locator(".workflow-job-list > li")).toHaveCount(1);
  await page.getByLabel("Filter steps", { exact: true }).fill("not-present");
  await expect(
    page.getByText("No matching steps", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Filter steps", { exact: true }).fill("");
  await page.getByLabel("Focus dependencies", { exact: true }).uncheck();
  await click(page, "YAML draft");
  await expect(
    page.getByLabel("Visual workflow definition", { exact: true }),
  ).toContainText("needs: [validate-manifest, declare-references]");
  await expect(page.getByLabel("YAML draft", { exact: true })).toContainText(
    "ttlSeconds: 3600",
  );
  await click(page, "Zoom in");
  await expect(page.locator(".diagram-toolbar")).toContainText("120%");
  for (const direction of ["←", "→", "↑", "↓"])
    await click(page, `Journeys ${direction}`);
  await click(page, "Fit diagram");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/lens-journey-definition.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("successful journey advances seven DAG waves, counts parallel work once and shares history", async ({
  page,
}) => {
  await click(page, "Start simulation");
  await expect(jobs(page, "running")).toHaveCount(2);
  await expect(
    page.getByRole("button", {
      name: "Validate manifest · validate-manifest",
      exact: true,
    }),
  ).toHaveAccessibleDescription("Running");
  await click(page, "Complete ready jobs");
  await expect(jobs(page, "completed")).toHaveCount(2);
  await expect(jobs(page, "running")).toHaveCount(1);
  await expect(page.locator(".journey-summary-grid")).toContainText("12 s");
  for (let wave = 1; wave < 7; wave++) await click(page, "Complete ready jobs");
  await expect(jobs(page, "completed")).toHaveCount(8);
  await expect(page.locator(".journey-summary-grid")).toContainText("570 s");
  await expect(
    page.getByRole("button", { name: "Complete ready jobs", exact: true }),
  ).toHaveCount(0);
  await go(page, "activity");
  await click(page, "SIM-001");
  await expect(page.getByTestId("run-detail").last()).toContainText("570s");
  await go(page, "journeys");
  await page.locator("#journey-run").selectOption("SIM-001");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/lens-journey-success.png",
    fullPage: true,
  });
});

test("journey backup failure skips dependent jobs and retry retains the failed predecessor", async ({
  page,
}) => {
  await click(page, "Configure journey");
  await page.locator("#scenario").selectOption("backupFailure");
  await go(page, "journeys");
  await click(page, "Start simulation");
  for (let wave = 0; wave < 4; wave++) await click(page, "Complete ready jobs");
  await expect(jobs(page, "failed")).toHaveCount(1);
  await expect(jobs(page, "skipped")).toHaveCount(3);
  await click(page, "Restore data · restore-database");
  await expect(page.getByRole("note")).toContainText("Backup unavailable");
  await expect(page.locator(".journey-summary-grid")).toContainText("360 s");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/lens-journey-failure.png",
    fullPage: true,
  });
  await click(page, "Retry simulation");
  await expect(jobs(page, "running")).toHaveCount(2);
  await page.locator("#journey-run").selectOption("SIM-001");
  await expect(jobs(page, "failed")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Retry simulation", exact: true }),
  ).toBeDisabled();
  await page.locator("#journey-run").selectOption("latest");
  for (let wave = 0; wave < 7; wave++) await click(page, "Complete ready jobs");
  await expect(jobs(page, "completed")).toHaveCount(8);
  await go(page, "activity");
  await expect(
    page.getByRole("cell", { name: "Failed", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Completed", exact: true }),
  ).toBeVisible();
});

test("journey cancellation and project switching preserve scope and stop all later steps", async ({
  page,
}) => {
  await click(page, "Start simulation");
  await click(page, "Complete ready jobs");
  await click(page, "Cancel simulation");
  await expect(jobs(page, "completed")).toHaveCount(2);
  await expect(jobs(page, "cancelled")).toHaveCount(1);
  await expect(jobs(page, "skipped")).toHaveCount(5);
  await click(page, "Retry simulation");
  await expect(jobs(page, "running")).toHaveCount(2);
  await page.locator("#scope").selectOption("demo-orbit");
  await expect(page.locator("#journey-run")).not.toContainText("SIM-001");
  await click(page, "Start simulation");
  await click(page, "Cancel simulation");
  await page.locator("#scope").selectOption("demo-atlas");
  await page.locator("#journey-run").selectOption("latest");
  await expect(jobs(page, "running")).toHaveCount(2);
  await go(page, "recovery");
  await click(page, "Cancel simulation");
  await go(page, "journeys");
  await page.locator("#journey-run").selectOption("latest");
  await expect(jobs(page, "cancelled")).toHaveCount(2);
});

test("journey snapshot keeps the chosen region and provisioning after later draft edits", async ({
  page,
}) => {
  await click(page, "Configure journey");
  await page.locator("#plan-region").selectOption("europe-west4");
  await page.locator("#provisioning").selectOption("create");
  await go(page, "journeys");
  await click(page, "Start simulation");
  await click(page, "Cancel simulation");
  await click(page, "Configure journey");
  await page.locator("#purpose").selectOption("restore");
  await page.locator("#target").selectOption("atlas-recovery");
  await go(page, "journeys");
  await expect(page.locator(".journey-summary-grid")).toContainText(
    "eu-west-1",
  );
  await page.locator("#journey-run").selectOption("SIM-001");
  await click(page, "YAML draft");
  await expect(page.getByLabel("YAML draft", { exact: true })).toContainText(
    "demo-europe-west4",
  );
  await expect(page.getByLabel("YAML draft", { exact: true })).toContainText(
    "provisioning: create",
  );
  await expect(
    page.getByRole("region", { name: "Inspect details", exact: true }),
  ).toContainText("Frozen run configuration");
  expect((await page.request.get("/journeys")).status()).toBe(200);
});
