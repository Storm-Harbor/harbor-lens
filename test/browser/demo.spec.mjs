import { test, expect } from "@playwright/test";

const go = (page, view) => page.locator(`nav [data-view="${view}"]`).click();
const click = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
test.beforeEach(async ({ page }) => {
  await page.goto("");
  await click(page, "Simulate GitHub");
  await click(page, "Simulate MFA verification");
});

test("real JointJS SVG renders dependencies and responds to selection, zoom, pan and project changes", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await go(page, "topology");
  await expect(page.locator(".joint-element")).toHaveCount(8);
  await expect(page.locator(".joint-link")).toHaveCount(8);
  await page.locator('[model-id="demo-atlas-database"]').click();
  await expect(
    page.getByRole("region", { name: "Inspect details", exact: true }),
  ).toContainText("demo-postgres");
  await click(page, "Zoom in");
  await expect(page.locator(".diagram-toolbar")).toContainText("120%");
  await click(page, "Topology ←");
  await click(page, "Topology →");
  await click(page, "Zoom out");
  await click(page, "Fit diagram");
  await expect(page.locator(".diagram-toolbar")).toContainText("100%");
  await page
    .getByRole("button", { name: "demo-backup · BackupSnapshot", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Inspect details", exact: true }),
  ).toContainText("demo-backup");
  await page.screenshot({
    path: "test-results/lens-jointjs-topology.png",
    fullPage: true,
  });
  await page.locator("#scope").selectOption("demo-orbit");
  await expect(page.locator('[model-id^="demo-atlas-"]')).toHaveCount(0);
  await expect(page.locator(".joint-element")).toHaveCount(8);
  expect(errors).toEqual([]);
});

for (const [scenario, phase, label] of [
  ["policyFailure", 0, "Policy denied"],
  ["backupFailure", 1, "Backup unavailable"],
  ["verifyFailure", 2, "Service verification failed"],
  ["timeout", 2, "Verification timed out"],
  ["partialFailure", 2, "Partial recovery"],
]) {
  test(`${scenario}: failure stops progression, records evidence and an explicit retry preserves history`, async ({
    page,
  }) => {
    await go(page, "recovery");
    await page.locator("#scenario").selectOption(scenario);
    await click(page, "Start simulation");
    for (let index = 0; index <= phase; index++)
      await click(page, "Complete next phase");
    await expect(page.getByRole("note")).toContainText(label);
    await expect(
      page.getByRole("cell", { name: "Failed", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Complete next phase", exact: true }),
    ).toHaveCount(0);
    await click(page, "Retry simulation");
    for (let index = 0; index < 3; index++)
      await click(page, "Complete next phase");
    await expect(
      page.getByRole("cell", { name: "Completed", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Failed", exact: true }),
    ).toBeVisible();
    await go(page, "activity");
    await click(page, "SIM-001");
    await expect(page.getByRole("note")).toContainText(label);
    await click(page, "SIM-002");
    await expect(page.getByTestId("run-detail").last()).toContainText(
      "Retry simulation",
    );
  });
}

test("new isolated GCP exercise, restore restrictions, region and YAML stay consistent", async ({
  page,
}) => {
  await go(page, "recovery");
  await page.locator("#plan-region").selectOption("europe-west4");
  await page.locator("#provisioning").selectOption("create");
  const yaml = page.getByLabel("YAML draft", { exact: true });
  await expect(yaml).toContainText("provisioning: create");
  await expect(yaml).toContainText("placementRef: demo-europe-west4");
  await expect(yaml).toContainText("ttlSeconds: 3600");
  await expect(yaml).not.toContainText("password:");
  await page.locator("#purpose").selectOption("restore");
  await expect(page.locator("#provisioning")).toHaveValue("existing");
  await expect(
    page.locator('#provisioning option[value="create"]'),
  ).toBeDisabled();
  await page.locator("#target").selectOption("atlas-recovery");
  await expect(page.locator("#plan-region")).toHaveValue("eu-west-1");
  await expect(yaml).toContainText("providerRef: demo-aws");
  await expect(yaml).toContainText("purpose: restore");
  await click(page, "Start simulation");
  await expect(page.locator("#purpose")).toBeDisabled();
  await click(page, "Cancel simulation");
  await click(page, "Retry simulation");
  await expect(page.locator("#purpose")).toHaveValue("restore");
  await page.screenshot({
    path: "test-results/lens-journey-yaml.png",
    fullPage: true,
  });
});

test("metrics and reference history expose distinct series and inspectable outcomes", async ({
  page,
}) => {
  await click(page, "Replication lag");
  await expect(page.locator(".metric-summary")).toContainText("3s");
  await click(page, "CPU utilization");
  await expect(page.locator(".metric-summary")).toContainText("42%");
  await click(page, "Service latency");
  await expect(page.locator(".metric-summary")).toContainText("94ms");
  await page.screenshot({
    path: "test-results/lens-expanded-overview.png",
    fullPage: true,
  });
  await go(page, "activity");
  await page.getByRole("button", { name: /REF-1041/ }).click();
  await expect(page.getByRole("note")).toContainText("Backup unavailable");
  await page.getByRole("button", { name: /REF-1040/ }).click();
  await expect(page.getByTestId("run-detail")).toContainText("Cancelled");
  await page.screenshot({
    path: "test-results/lens-run-evidence.png",
    fullPage: true,
  });
});
