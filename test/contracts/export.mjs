import {
  createState,
  changeScope,
  addHarbor,
  scopeData,
  scopes,
  providerRegions,
} from "../../src/model.mjs";
import { manifestDraft } from "../../src/demo.mjs";

const state = createState();
const drafts = [];
for (const scope of scopes) {
  changeScope(state, scope);
  addHarbor(state, "demo-oracle", "Oracle Cloud");
  for (const harbor of scopeData(state).harbors) {
    for (const region of new Set([
      ...providerRegions[harbor.provider],
      harbor.region,
    ])) {
      const configurations = [
        { purpose: "exercise", provisioning: "existing", region },
        { purpose: "restore", provisioning: "existing", region },
      ];
      if (harbor.provider === "GCP")
        configurations.push({
          purpose: "exercise",
          provisioning: "create",
          region,
        });
      for (const config of configurations)
        drafts.push({
          name: `${scope}/${harbor.id}/${region}/${config.purpose}/${config.provisioning}`,
          scope,
          yaml: manifestDraft(scope, harbor, config),
        });
    }
  }
}
process.stdout.write(JSON.stringify(drafts));
