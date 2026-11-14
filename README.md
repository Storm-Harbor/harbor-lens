# Harbor Lens
Harbor Lens is Storm Harbor's separate operational frontend. This delivery is a synthetic demo preview: simulated GitHub/Google/company SSO and mandatory MFA, inventory, readiness/gap examples, interactive JointJS topology, YAML drafts and recoveries with success, failure, cancellation, retry and phase evidence. It makes no identity-provider, cloud, core API or AI call and stores no browser credentials or durable data. Reload or logout discards the demo session.

The selected frontend uses React 19, Vite 8, JavaScript/JSX, React Router, Tailwind CSS 4, shadcn/ui radix-nova/Radix, Lucide, i18next, Recharts and JointJS Core 4.3.4. Colors follow the Storm Harbor product website. Technical documentation is English; the application has the same 25 locales as stormharbor.io, with en-GB as default and RTL layouts for Arabic, Hebrew and Urdu. Every catalog includes all 163 UI/error/demo messages. The product website stays in its existing repository.

## Development and validation

Use Node 26.10.0 and the checked-in Yarn 4.18.0 strict PnP toolchain; no npm lockfile or node_modules.

```sh
node .yarn/releases/yarn-4.18.0.cjs install --immutable
node .yarn/releases/yarn-4.18.0.cjs format:check
node .yarn/releases/yarn-4.18.0.cjs test:tooling
node .yarn/releases/yarn-4.18.0.cjs test:contracts
node .yarn/releases/yarn-4.18.0.cjs test:coverage
node .yarn/releases/yarn-4.18.0.cjs build
node .yarn/releases/yarn-4.18.0.cjs exec playwright install chromium
node .yarn/releases/yarn-4.18.0.cjs test:browser
```

`dev` starts Vite locally. Browser acceptance normally serves the built artifact on loopback port 4179. Set `LENS_TEST_ORIGIN` to an owned local container origin to validate the actual runtime. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an already installed matching Chromium. Do not point ordinary tests at customer or production environments.

`test:contracts` additionally needs Go 1.26.11. It generates browser YAML drafts across providers, regions, exercise/restore and permitted provisioning choices, then validates them with the published `storm-lib-recovery-contracts` v0.1.0-alpha.1 module, pinned in `test/contracts/go.mod` and `go.sum`. The command uses `-count=1` because changes to the JavaScript producer are outside Go's test-result cache inputs. It imports no sibling checkout and makes no cloud call. Exercise drafts require ephemeral targets, run-owned cleanup and a TTL even when reusing a target; restore drafts retain their target and omit TTL. Run-owned cleanup never permits deleting an existing project or unrelated assets. CI qualifies these producer/consumer semantics independently of UI coverage.

Vitest includes all maintained executable frontend source, including bootstrap, i18n and unimported modules; targets are 100% independently for statements, branches, functions and lines. Playwright records 46 separate browser scenarios (8 initial sandbox journeys, 8 expanded workbench journeys, 5 visual-workflow journeys and 25 locale journeys). Unit tests replace only the external SVG engine boundary; browser scenarios use real JointJS shapes/links, selection, zoom, viewport and updates across run-state/language changes. Mocks and synthetic filtering do not qualify authoritative backend identity, tenancy, workload permissions or real recovery. Coverage reports, traces and screenshots are generated artifacts.

## Local Docker Compose preview

With Docker Desktop/Engine and Docker Compose running, start the local preview from this repository:

```sh
docker compose up --build --detach
```

Open **http://127.0.0.1:4180/**. Select a demo identity provider, continue through the explicitly simulated MFA step and explore the sandbox. No account, password, cloud credential or real MFA code is needed. Recovery progress and history are synthetic; reload/logout resets the session.

On macOS external volumes, Docker may reject AppleDouble extended attributes before processing `.dockerignore`. This workspace can use the included Node helper instead; it needs no host dependency install and uses the same Compose file:

```sh
node tools/compose-local.mjs up
```

The helper byte-copies only the Dockerfile's allowed inputs to an owned temporary directory, skips filesystem metadata, refuses symlinks and bounds file count/size. It never traverses Git metadata or stages unlisted root files such as `.env`. The temporary input is removed after Compose finishes building/starting, including failure. Keep secrets out of source. The pinned builder supplies Node/Yarn; the final container runs only Nginx.

Useful commands:

```sh
curl --fail http://127.0.0.1:4180/healthz
docker compose ps
docker compose logs --tail=50 lens
node tools/compose-local.mjs down
```

`docker compose down` also stops the local project. To use another loopback port, set `HARBOR_LENS_PORT`, for example `HARBOR_LENS_PORT=4190 node tools/compose-local.mjs up`. The project is named `harbor-lens-local`; do not run parallel copies under that same name. Source changes need another build/start; this is the static runtime rather than a hot-reload server. `yarn compose:up` / `yarn compose:down` are equivalent shortcuts with the project toolchain installed.

Compose binds only to `127.0.0.1`, drops capabilities, runs as UID/GID 65532, uses a read-only root plus bounded `/tmp`, and limits CPU, memory and process count. The image targets `linux/amd64`, matching the selected Cloud Run delivery; other host architectures need Docker emulation. Readiness is an actual HTTP request to `/healthz`; Nginx configuration validation is not an application health check. CI builds this Compose runtime and runs all 46 browser journeys against it before stopping its own separate test project.

## Explore a journey

Open **Journeys** in the navigation or load `/journeys`, then enter through the demo gate. The workflow view preserves the existing layout and uses JointJS Core for three phase lanes, eight custom job cards and eight dependency edges. It is a browser simulation inspired by CI workflow clarity; no GitHub Actions job, cloud runner or adapter executes.

1. Inspect the **Definition** or choose a clearly labeled success/failure reference. Select any card, keyboard-accessible job or dependency chip to inspect declared inputs/outputs, adapter, policy and synthetic duration. Search filters the job list; focus highlights immediate dependencies. Zoom, physical-direction pan and a scrollable mobile viewport keep the graph inspectable in every locale.
2. Choose **Configure journey** to set exercise/restore, target/provider, region, provisioning and outcome in Recovery. Return to Journeys to inspect the matching configuration. The visual workflow YAML is illustrative UI metadata; the separate `RecoveryConfiguration` YAML follows the published core contract. The visualization does not introduce a runnable journey kind or grant runtime admission.
3. Start a simulation. The definition/configuration is copied into that run. Two independent checks start together; seven ready-job waves follow their declared dependencies through approval, target preparation, database/workload restore, verification and evidence. Complete ready jobs manually. Parallel work contributes once to the 570-second illustrative critical path; these are fixed fixture durations, not elapsed recovery measurements.
4. A configured failure stops its job and skips downstream work. Cancellation preserves completed jobs and marks remaining work cancelled/skipped. An explicit retry creates a separate fresh attempt without changing the predecessor. Both detailed Journeys and grouped Recovery/history use the same scoped in-memory run state; switching projects cannot expose the other project's session runs.
5. Select a previous run to inspect its preserved target, region, provisioning and workflow even after editing the next draft. Failed job inspection shows its synthetic cause. Declared outputs are expected codes, not proof of a real operation or secret resolution. Reload/logout discards all runs.

The owner accepted the existing demo as an initial baseline, then prioritized this Journeys view before Cloud Run publication. After verified Lens publication, product-website research/content/demo-link work follows, then the remaining SPECS sequence. These are distinct source, infrastructure and public-URL acceptance gates.

## Cloud Run delivery

The owner selected `https://lens.stormharbor.io/` on Cloud Run, following a static-container strategy. GitHub Pages is not the Lens host. The Dockerfile pins Node and non-root Chainguard Nginx by digest; only built static files enter the final runtime. The build preserves the production dependency graph's license/notice texts in `THIRD_PARTY_NOTICES.txt`; no private/build-only package is included. Node is a build tool. Nginx listens on 8080, exposes a dependency-free `/healthz`, serves known SPA routes, rejects unknown/API/source paths and prohibits runtime network connections through CSP. No authenticated backend exists in this slice.

Infrastructure, scoped WIF, registry, runtime shell, protected edge, certificates and DNS must be qualified before deployment. The application release will own immutable images, revisions/traffic and rollback after those producer gates; this initial CI does not authenticate to GCP, push an image or deploy. User manual PR merge, infrastructure applies and an actual live URL check precede a publication claim. Keep `stormharbor.io` pointing at the product website.

## Available and planned

The demo has no real sign-in, MFA assurance, company membership, metric collector or recovery executor. Observation/operation stay disabled. Real protected access must support company-selected OIDC (later qualified SAML), Google/GitHub and verified mandatory MFA, through core Go session/identity boundaries. No public toggle or synthetic session can grant those capabilities.

The reference workbench preserves the original layout and deepens its contents:

- Overview/infrastructure: four explicit readiness checks and two outstanding gaps, plus Recharts CPU, service-latency and replication-lag series with units and distinct values. These are fixture checks, not a recovery certification.
- Topology: real JointJS Core renders eight scoped synthetic resources and eight dependencies, with SVG selection, zoom/viewport controls, a keyboard-accessible resource list and a detail inspector. Kubernetes, managed PostgreSQL/Cloud SQL, backup, secret-reference, Terraform and recovery-target fixtures are representative examples, not all resources counted in the Harbor inventory. The latest session run highlights its phase/outcome.
- Recovery: choose exercise or restore, target Harbor/provider, region, existing target or a new isolated GCP exercise project. The draft uses the core `RecoveryConfiguration` envelope. A new project is limited to GCP exercises; create versus restore and provider-region choices are checked in the synthetic model. Logical provider/placement/secret references need manual private bindings. The YAML and plan are frozen while the simulation runs.
- Scenarios: success, unavailable backup, policy denial, failed verification, timeout and partial recovery. Failures stop at their configured phase; cancelled/failed runs remain terminal. Explicit retry creates a separate successful-scenario attempt with the same target/configuration and a link to its predecessor, without changing the original evidence. The user advances that attempt independently; retry does not imply a real remediation.
- History: three clearly labeled reference fixtures (success/failure/cancellation), duration comparison, phase timelines/codes and inspectable session runs. Reference IDs are separate from session `SIM-*` runs. All durations are deterministic illustrative seconds, not elapsed recovery measurements; all data remains in memory.

JointJS Core is the free [MPL-2.0 edition](https://www.jointjs.com/license), pinned as `@joint/core` 4.3.4. No JointJS+ package or paid extension is used. Upstream source is unmodified and available at the versioned [JointJS repository](https://github.com/clientIO/joint/tree/v4.3.4); the distribution preserves its license text in `THIRD_PARTY_NOTICES.txt`. General editing, provider discovery, customer-scoped graph authorization and production recovery remain unimplemented.

The initial eager bundle includes the demo views and chart toolkit; route/chart splitting and measured accessibility/performance budgets remain production work. No third-party analytics, remote fonts or shared customer corpus is introduced.

The expanded demo has a finite acceptance scope, separate from real provider integration:

- Interactive topology: pan/zoom, bounded expansion, filters, node inspection and a keyboard/text alternative.
- Illustrative YAML journeys: exercise versus restore, create versus reuse of a target project, target environment/region and dependency order.
- Synthetic Kubernetes/managed SQL/Terraform examples, with clearly identified provider-specific differences and cross-cloud compatibility assumptions.
- Gap analysis and checklist, phase outcomes, cancelled/failed/completed runs and run detail/history, all explicitly simulated.
- Complete 25-locale, RTL, responsive and browser acceptance for the added views.

The workbench implements the bounded examples above and the Journeys view's search/dependency focus. General graph editing, resource-topology expansion/filtering, complete Terraform state/drift exploration, richer workload catalogs and end-to-end provider coverage remain later work. Real SSO/MFA, scoped collectors, approvals, cloud mutations and measured recovery outcomes have separate contracts and qualification gates. A complete synthetic demo is not production recovery readiness.

Core Go APIs, CLI, GitHub App/bots, collectors, orchestration and controllers stay in [storm-harbor-control-plane](https://github.com/Storm-Harbor/storm-harbor-control-plane). Follow the [Lens plan](https://github.com/Storm-Harbor/storm-harbor-control-plane/blob/master/docs/SPECS-HARBOR-LENS.md), [sandbox issue #1](https://github.com/Storm-Harbor/harbor-lens/issues/1) and shared [engineering guidance](https://github.com/Storm-Harbor/.github/blob/master/AGENTS.md). Native issues own current lifecycle.
