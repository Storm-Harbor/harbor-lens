// Preserve licenses for the pinned production dependency graph, including
// packages later removed by tree shaking. Never include build-only dependencies.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const overrides = require("../licenses/upstream-notices.json");
const pnp = require("pnpapi");
const root = pnp.getPackageInformation(pnp.findPackageLocator(__filename));
const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
const queue = Object.keys(manifest.dependencies).map((name) =>
  pnp.getLocator(name, root.packageDependencies.get(name)),
);
const visited = new Set();
const notices = new Map();
while (queue.length) {
  const locator = queue.shift();
  const identity = `${locator.name}:${locator.reference}`;
  if (visited.has(identity)) continue;
  visited.add(identity);
  if (visited.size > 500)
    throw new Error("Production dependency notice budget exceeded.");
  const info = pnp.getPackageInformation(locator);
  const pkg = JSON.parse(
    fs.readFileSync(path.join(info.packageLocation, "package.json"), "utf8"),
  );
  const files = fs
    .readdirSync(info.packageLocation, { withFileTypes: true })
    .filter(
      (e) =>
        e.isFile() &&
        /^(LICEN[CS]E|COPYING|NOTICE|COPYRIGHT)([-.].*|Notice.*)?$/i.test(
          e.name,
        ),
    );
  const texts = files.map((file) => {
    const text = fs.readFileSync(
      path.join(info.packageLocation, file.name),
      "utf8",
    );
    if (Buffer.byteLength(text) > 128 * 1024)
      throw new Error("Dependency notice exceeds file budget.");
    return `${file.name}\n${text.trim()}`;
  });
  if (!files.length) {
    const override = overrides[`${pkg.name}@${pkg.version}`];
    if (!override)
      throw new Error(
        `Missing distributed license for ${pkg.name}@${pkg.version}.`,
      );
    const text = fs.readFileSync(path.join("licenses", override.file), "utf8");
    if (createHash("sha256").update(text).digest("hex") !== override.sha256)
      throw new Error("Upstream license checksum mismatch.");
    texts.push(`${override.source}\n${text.trim()}`);
  }
  notices.set(`${pkg.name}@${pkg.version}`, texts.join("\n\n"));
  for (const [name, reference] of info.packageDependencies)
    if (reference !== null) queue.push(pnp.getLocator(name, reference));
}
const output =
  [
    "Harbor Lens — distributed source and production dependency notices",
    fs.readFileSync("LICENSE", "utf8").trim(),
    ...[...notices.keys()]
      .sort()
      .map((name) => `\n===== ${name} =====\n${notices.get(name)}`),
  ].join("\n\n") + "\n";
if (Buffer.byteLength(output) > 2 * 1024 * 1024)
  throw new Error("Distribution notices exceed total budget.");
fs.writeFileSync("dist/THIRD_PARTY_NOTICES.txt", output);
console.log(
  `Preserved licenses/notices for ${notices.size} production packages.`,
);
