import { readdir, unlink } from "node:fs/promises";
const files = [];
for (const dir of ["dist", "dist/assets"]) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name.startsWith("._")) {
      await unlink(`${dir}/${e.name}`);
      continue;
    }
    if (e.isFile()) files.push(`${dir}/${e.name}`.slice(5));
    else if (dir !== "dist" || e.name !== "assets" || e.isSymbolicLink())
      throw new Error("Unexpected artifact directory.");
  }
}
for (const file of files)
  if (
    file !== "index.html" &&
    file !== "THIRD_PARTY_NOTICES.txt" &&
    !/^assets\/[A-Za-z0-9_-]+\.(js|css|svg)$/.test(file)
  )
    throw new Error("Unexpected static artifact.");
console.log(
  `Verified ${files.length} static files; no server, customer data or source maps.`,
);
