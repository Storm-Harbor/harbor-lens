# Harbor Lens
Harbor Lens is Storm Harbor's separate operational frontend. This first delivery is a synthetic demo preview: simulated GitHub/Google/company SSO and mandatory MFA, inventory, illustrative metrics, accessible topology and recovery simulation/history. It makes no identity-provider, cloud, core API or AI call and stores no browser credentials or durable data. Reload or logout discards the demo session.

The selected frontend uses React 19, Vite 8, JavaScript/JSX, React Router, Tailwind CSS 4, shadcn/ui radix-nova/Radix, Lucide, i18next and Recharts. Colors follow the Storm Harbor product website. Technical documentation is English; the initial application catalogs are English and Brazilian Portuguese. The product website stays in its existing repository.

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

Vitest includes all maintained executable frontend source, including bootstrap, i18n and unimported modules; targets are 100% independently for statements, branches, functions and lines. Playwright records eight separate browser scenarios. Mocks and synthetic filtering do not qualify authoritative backend identity, tenancy, workload permissions or real recovery. Coverage reports, traces and screenshots are generated artifacts.

## Cloud Run delivery

The owner selected `https://lens.stormharbor.io/` on Cloud Run, following a static-container strategy. GitHub Pages is not the Lens host. The Dockerfile pins Node and non-root Chainguard Nginx by digest; only built static files enter the final runtime. The build preserves the production dependency graph's license/notice texts in `THIRD_PARTY_NOTICES.txt`; no private/build-only package is included. Node is a build tool. Nginx listens on 8080, exposes a dependency-free `/healthz`, serves known SPA routes, rejects unknown/API/source paths and prohibits runtime network connections through CSP. No authenticated backend exists in this slice.

```sh
docker build --platform linux/amd64 -t harbor-lens:demo .
docker run --rm -p 127.0.0.1:4179:8080 --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m --cap-drop=ALL \
  --security-opt no-new-privileges harbor-lens:demo
```

For filesystems with incompatible extended attributes, stage only the Dockerfile's allowlisted sources in a temporary build context; never traverse or clean Git metadata. The CI container build uses its clean checkout.

Infrastructure, scoped WIF, registry, runtime shell, protected edge, certificates and DNS must be qualified before deployment. The application release will own immutable images, revisions/traffic and rollback after those producer gates; this initial CI does not authenticate to GCP, push an image or deploy. User manual PR merge, infrastructure applies and an actual live URL check precede a publication claim. Keep `stormharbor.io` pointing at the product website.

## Available and planned

The demo has no real sign-in, MFA assurance, company membership, metric collector or recovery executor. Observation/operation stay disabled. Real protected access must support company-selected OIDC (later qualified SAML), Google/GitHub and verified mandatory MFA, through core Go session/identity boundaries. No public toggle or synthetic session can grant those capabilities.

Recharts renders illustrative metrics. The current topology is a static synthetic projection with a text alternative. Advanced scoped graphs are planned with JointJS Community/Core (MPL-2.0), not the paid JointJS+ extensions; neither package is installed in this initial slice. Verify capability availability and licenses before integration. Do not claim the advanced graph editor, provider adapters, real measured RTO/RPO or production readiness exists.

The initial eager bundle includes the demo views and chart toolkit; route/chart splitting and measured accessibility/performance budgets remain production work. No third-party analytics, remote fonts or shared customer corpus is introduced.

Core Go APIs, CLI, GitHub App/bots, collectors, orchestration and controllers stay in [storm-harbor-control-plane](https://github.com/Storm-Harbor/storm-harbor-control-plane). Follow the [Lens plan](https://github.com/Storm-Harbor/storm-harbor-control-plane/blob/main/docs/SPECS-HARBOR-LENS.md), [sandbox issue #1](https://github.com/Storm-Harbor/harbor-lens/issues/1) and shared [engineering guidance](https://github.com/Storm-Harbor/.github/blob/main/AGENTS.md). The plan link requires its source PR to merge; native issues own current lifecycle.
