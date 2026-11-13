# Harbor Lens
Harbor Lens is Storm Harbor's separate operational frontend. This first delivery is a synthetic demo preview: simulated GitHub/Google/company SSO and mandatory MFA, inventory, illustrative metrics, accessible topology and recovery simulation/history. It makes no identity-provider, cloud, core API or AI call and stores no browser credentials or durable data. Reload or logout discards the demo session.

The selected frontend uses React 19, Vite 8, JavaScript/JSX, React Router, Tailwind CSS 4, shadcn/ui radix-nova/Radix, Lucide, i18next and Recharts. Colors follow the Storm Harbor product website. Technical documentation is English; the application has the same 25 locales as stormharbor.io, with en-GB as default and RTL layouts for Arabic, Hebrew and Urdu. Every catalog includes all 109 UI/error/demo messages. The product website stays in its existing repository.

## Development and validation

Use Node 26.10.0 and the checked-in Yarn 4.18.0 strict PnP toolchain; no npm lockfile or node_modules.

```sh
node .yarn/releases/yarn-4.18.0.cjs install --immutable
node .yarn/releases/yarn-4.18.0.cjs format:check
node .yarn/releases/yarn-4.18.0.cjs test:coverage
node .yarn/releases/yarn-4.18.0.cjs build
node .yarn/releases/yarn-4.18.0.cjs exec playwright install chromium
node .yarn/releases/yarn-4.18.0.cjs test:browser
```

`dev` starts Vite locally. Browser acceptance normally serves the built artifact on loopback port 4179. Set `LENS_TEST_ORIGIN` to an owned local container origin to validate the actual runtime. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an already installed matching Chromium. Do not point ordinary tests at customer or production environments.

Vitest includes all maintained executable frontend source, including bootstrap, i18n and unimported modules; targets are 100% independently for statements, branches, functions and lines. Playwright records 33 separate browser scenarios (8 sandbox journeys plus 25 locale journeys). Mocks and synthetic filtering do not qualify authoritative backend identity, tenancy, workload permissions or real recovery. Coverage reports, traces and screenshots are generated artifacts.

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

Compose binds only to `127.0.0.1`, drops capabilities, runs as UID/GID 65532, uses a read-only root plus bounded `/tmp`, and limits CPU, memory and process count. The image targets `linux/amd64`, matching the selected Cloud Run delivery; other host architectures need Docker emulation. Readiness is an actual HTTP request to `/healthz`; Nginx configuration validation is not an application health check. CI builds this Compose runtime and runs all 33 browser journeys against it before stopping its own separate test project.

## Cloud Run delivery

The owner selected `https://lens.stormharbor.io/` on Cloud Run, following a static-container strategy. GitHub Pages is not the Lens host. The Dockerfile pins Node and non-root Chainguard Nginx by digest; only built static files enter the final runtime. The build preserves the production dependency graph's license/notice texts in `THIRD_PARTY_NOTICES.txt`; no private/build-only package is included. Node is a build tool. Nginx listens on 8080, exposes a dependency-free `/healthz`, serves known SPA routes, rejects unknown/API/source paths and prohibits runtime network connections through CSP. No authenticated backend exists in this slice.

Infrastructure, scoped WIF, registry, runtime shell, protected edge, certificates and DNS must be qualified before deployment. The application release will own immutable images, revisions/traffic and rollback after those producer gates; this initial CI does not authenticate to GCP, push an image or deploy. User manual PR merge, infrastructure applies and an actual live URL check precede a publication claim. Keep `stormharbor.io` pointing at the product website.

## Available and planned

The demo has no real sign-in, MFA assurance, company membership, metric collector or recovery executor. Observation/operation stay disabled. Real protected access must support company-selected OIDC (later qualified SAML), Google/GitHub and verified mandatory MFA, through core Go session/identity boundaries. No public toggle or synthetic session can grant those capabilities.

Recharts renders illustrative metrics. The current topology is a static synthetic projection with a text alternative. Advanced scoped graphs are planned with JointJS Community/Core (MPL-2.0), not the paid JointJS+ extensions; neither package is installed in this initial slice. Verify capability availability and licenses before integration. Do not claim the advanced graph editor, provider adapters, real measured RTO/RPO or production readiness exists.

The initial eager bundle includes the demo views and chart toolkit; route/chart splitting and measured accessibility/performance budgets remain production work. No third-party analytics, remote fonts or shared customer corpus is introduced.

The expanded demo has a finite acceptance scope, separate from real provider integration:

- Interactive topology: pan/zoom, bounded expansion, filters, node inspection and a keyboard/text alternative.
- Illustrative YAML journeys: exercise versus restore, create versus reuse of a target project, target environment/region and dependency order.
- Synthetic Kubernetes/managed SQL/Terraform examples, with clearly identified provider-specific differences and cross-cloud compatibility assumptions.
- Gap analysis and checklist, phase outcomes, cancelled/failed/completed runs and run detail/history, all explicitly simulated.
- Complete 25-locale, RTL, responsive and browser acceptance for the added views.

These additions are planned, not implemented by the local Compose delivery. Real SSO/MFA, scoped collectors, approvals, cloud mutations and measured recovery outcomes have separate contracts and qualification gates. A complete synthetic demo is not production recovery readiness.

Core Go APIs, CLI, GitHub App/bots, collectors, orchestration and controllers stay in [storm-harbor-control-plane](https://github.com/Storm-Harbor/storm-harbor-control-plane). Follow the [Lens plan](https://github.com/Storm-Harbor/storm-harbor-control-plane/blob/master/docs/SPECS-HARBOR-LENS.md), [sandbox issue #1](https://github.com/Storm-Harbor/harbor-lens/issues/1) and shared [engineering guidance](https://github.com/Storm-Harbor/.github/blob/master/AGENTS.md). Native issues own current lifecycle.
