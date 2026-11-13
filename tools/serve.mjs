// Loopback static artifact preview; not a production application server.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
const files = await readdir("dist/assets");
const assets = new Map(
  files
    .filter((f) => /^[A-Za-z0-9_-]+\.(js|css|svg)$/.test(f))
    .map((f) => [`/assets/${f}`, `dist/assets/${f}`]),
);
for (const path of [
  "/",
  "/index.html",
  "/infrastructure",
  "/topology",
  "/recovery",
  "/history",
])
  assets.set(path, "dist/index.html");
assets.set("/THIRD_PARTY_NOTICES.txt", "dist/THIRD_PARTY_NOTICES.txt");
const types = {
  txt: "text/plain",
  html: "text/html",
  js: "text/javascript",
  css: "text/css",
  svg: "image/svg+xml",
};
const server = createServer(async (req, res) => {
  const path = assets.get(req.url);
  if (!path || req.method !== "GET") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const body = await readFile(path);
  res.writeHead(200, {
    "Content-Type": types[path.split(".").at(-1)],
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(body);
});
server.listen(4179, "127.0.0.1", () =>
  console.log("Harbor Lens local preview: http://127.0.0.1:4179/"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close());
