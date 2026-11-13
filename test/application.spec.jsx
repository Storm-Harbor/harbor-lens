import { test, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { SandboxAccess } from "../src/SandboxEntry";
import i18n from "../src/i18n";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
const click = (user, name) =>
  user.click(screen.getByRole("button", { name, exact: true }));
function setup(path = "/") {
  const result = render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <SandboxAccess />
      </MemoryRouter>
    </I18nextProvider>,
  );
  return { ...result, user: userEvent.setup() };
}
async function enter(user) {
  await click(user, "Simulate GitHub");
  await click(user, "Simulate MFA verification");
}
async function go(user, view) {
  await user.click(document.querySelector(`nav [data-view="${view}"]`));
}
async function add(user, name, provider = "GCP") {
  await click(user, "Add synthetic Harbor");
  await user.type(screen.getByLabelText("Display name", { exact: true }), name);
  await user.selectOptions(
    screen.getByLabelText("Provider", { exact: true }),
    provider,
  );
  await click(user, "Create fixture");
}

test("all fake providers require simulated MFA and expose no credential inputs", async () => {
  const { user } = setup();
  expect(document.querySelector("input")).toBeNull();
  for (const provider of ["GitHub", "Google", "Company SSO"]) {
    await click(user, `Simulate ${provider}`);
    expect(
      screen.getByRole("heading", { name: "Mandatory MFA · simulation" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Overview", exact: true }),
    ).toBeNull();
    await click(user, "Choose another provider");
    await click(user, `Simulate ${provider}`);
    await click(user, "Simulate MFA verification");
    expect(
      screen.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    await click(user, "Leave sandbox");
  }
  await user.selectOptions(screen.getByLabelText("Language"), "pt-BR");
  expect(
    screen.getByRole("heading", { name: "Explore o Harbor Lens" }),
  ).toBeVisible();
  expect(document.documentElement.lang).toBe("pt-BR");
});

test("navigation, localization, unknown signals, diagram alternatives and unavailable live modes", async () => {
  const { user } = setup();
  await enter(user);
  expect(
    screen.getByRole("button", { name: "Observation", exact: true }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Operation", exact: true }),
  ).toBeDisabled();
  await click(user, "View infrastructure");
  expect(screen.getByText("CPU utilization: Not measured")).toBeVisible();
  expect(screen.getByText("Fixture age (min): Unknown")).toBeVisible();
  await go(user, "topology");
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  for (const lang of ["pt-BR", "en"]) {
    await user.selectOptions(document.getElementById("locale"), lang);
    for (const view of [
      "overview",
      "inventory",
      "topology",
      "recovery",
      "activity",
    ])
      await go(user, view);
    expect(document.documentElement.lang).toBe(lang);
    expect(document.querySelector("main").textContent).not.toContain(
      "undefined",
    );
  }
  await user.click(
    screen.getAllByRole("button", { name: "Recovery", exact: true }).at(-1),
  );
  expect(document.getElementById("run-form")).toBeVisible();
  await go(user, "overview");
  await click(user, "Exercise journey");
  expect(document.getElementById("run-form")).toBeVisible();
});

test("dialog focus, dismissal, safe label, invalid label/provider and quota", async () => {
  const { user } = setup();
  await enter(user);
  await click(user, "Add synthetic Harbor");
  expect(screen.getByLabelText("Display name", { exact: true })).toHaveFocus();
  await click(user, "Create fixture");
  expect(screen.getByRole("alert")).toHaveTextContent("between 1 and 60");
  const label = screen.getByLabelText("Display name", { exact: true });
  fireEvent.change(label, { target: { value: "x".repeat(61) } });
  await click(user, "Create fixture");
  expect(screen.getByRole("alert")).toHaveTextContent("between 1 and 60");
  fireEvent.change(label, { target: { value: "Invented" } });
  const provider = screen.getByLabelText("Provider", { exact: true });
  provider.add(new Option("invalid", "invalid"));
  await user.selectOptions(provider, "invalid");
  await click(user, "Create fixture");
  expect(screen.getByRole("alert")).toHaveTextContent("available provider");
  await user.selectOptions(provider, "Oracle Cloud");
  await click(user, "Create fixture");
  await click(user, "Add synthetic Harbor");
  await user.click(
    screen.getAllByRole("button", { name: "Close", exact: true })[0],
  );
  await click(user, "Add synthetic Harbor");
  await user.click(
    screen.getAllByRole("button", { name: "Close", exact: true })[1],
  );
  await click(user, "Add synthetic Harbor");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  const unsafe = `<img src=x onerror="x">&`;
  await add(user, unsafe, "Azure");
  const row = screen.getByRole("rowheader", { name: unsafe, exact: true });
  expect(row.querySelector("img")).toBeNull();
  for (let i = 0; i < 7; i++)
    await add(user, `Fixture ${i}`, i % 2 ? "AWS" : "DigitalOcean");
  await add(user, "Over quota");
  expect(screen.getByRole("alert")).toHaveTextContent("up to 12");
});

test("scoped simulation completion, cancellation, history, invalid target/scope and reset", async () => {
  const { user } = setup();
  await enter(user);
  await go(user, "recovery");
  const target = document.getElementById("target");
  target.add(new Option("foreign", "orbit-primary"));
  await user.selectOptions(target, "orbit-primary");
  await click(user, "Start simulation");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Select a Harbor in this demo project.",
  );
  await user.selectOptions(target, "atlas-primary");
  await click(user, "Start simulation");
  expect(screen.getByRole("status")).toHaveTextContent(
    "No live action occurred.",
  );
  await user.selectOptions(document.getElementById("scope"), "demo-orbit");
  expect(
    screen.queryByRole("cell", { name: "Running", exact: true }),
  ).toBeNull();
  await click(user, "Start simulation");
  await click(user, "Cancel simulation");
  expect(
    screen.getByRole("cell", { name: "Cancelled", exact: true }),
  ).toBeVisible();
  await user.selectOptions(document.getElementById("scope"), "demo-atlas");
  expect(
    screen.queryByRole("cell", { name: "Cancelled", exact: true }),
  ).toBeNull();
  for (let i = 0; i < 3; i++) await click(user, "Complete next phase");
  await go(user, "activity");
  expect(
    screen.getByRole("cell", { name: "Completed", exact: true }),
  ).toBeVisible();
  const scope = document.getElementById("scope");
  scope.add(new Option("foreign", "foreign"));
  await user.selectOptions(scope, "foreign");
  expect(screen.getByRole("status")).toHaveTextContent(
    "available demo project",
  );
  await click(user, "Reset sandbox");
  expect(
    screen.getByRole("heading", { name: "No simulations yet" }),
  ).toBeVisible();
});

test("mobile menu keyboard lifecycle and unknown application route", async () => {
  const { user } = setup("/unavailable");
  await enter(user);
  expect(
    screen.getByRole("heading", { level: 1, name: "Page unavailable" }),
  ).toBeVisible();
  await user.click(
    screen.getAllByRole("button", { name: "Overview", exact: true })[1],
  );
  await click(user, "Toggle navigation");
  await user.keyboard("a");
  expect(
    screen.getByRole("button", { name: "Toggle navigation" }),
  ).toHaveAttribute("aria-expanded", "true");
  await user.keyboard("{Escape}");
  expect(
    screen.getByRole("button", { name: "Toggle navigation" }),
  ).toHaveFocus();
  await click(user, "Toggle navigation");
  await click(user, "Toggle navigation");
  await click(user, "Toggle navigation");
  await go(user, "inventory");
  expect(
    screen.getByRole("button", { name: "Toggle navigation" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById("main")).toHaveFocus();
});

test("real bootstrap renders the demo gate and releases its root", async () => {
  const container = document.createElement("div");
  container.id = "app";
  document.body.append(container);
  let module;
  await act(async () => {
    module = await import("../src/main");
  });
  expect(
    screen.getByRole("heading", { name: "Explore Harbor Lens" }),
  ).toBeVisible();
  await act(async () => module.application.unmount());
  container.remove();
});
