if (process.versions.node !== "26.10.0")
  throw new Error("Harbor Lens requires Node 26.10.0.");
if (!require("node:module").findPnpApi(__filename))
  throw new Error("Use Yarn 4.18.0 strict PnP.");
