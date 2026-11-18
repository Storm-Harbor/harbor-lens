# syntax=docker/dockerfile:1.12@sha256:93bfd3b68c109427185cd78b4779fc82b484b0b7618e36d0f104d4d801e66d25
ARG NODE_IMAGE=node@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1
ARG RUNTIME_IMAGE=cgr.dev/chainguard/nginx@sha256:a2bbeeda97bb059018d7a022b3d704e2c0ac55ca738e6f7654ae743189dac24e
ARG GO_IMAGE=golang@sha256:ecb67f987aa1a57794c91d19ade7ae0209f2f0f5496aaef9e6ae85ddf92d02ab
FROM ${GO_IMAGE} AS supervisor
WORKDIR /runtime
ENV GOTOOLCHAIN=local
COPY runtime/go.mod runtime/main.go ./
RUN CGO_ENABLED=0 go build -trimpath -buildvcs=false -ldflags='-s -w -buildid=' -o /harbor-lens-runtime .

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY .yarn/releases/yarn-4.18.0.cjs .yarn/releases/yarn-4.18.0.cjs
COPY package.json yarn.lock .yarnrc.yml ./
RUN node .yarn/releases/yarn-4.18.0.cjs install --immutable
COPY index.html vite.config.js LICENSE ./
COPY tools/check-toolchain.cjs tools/check-artifact.mjs tools/notices.cjs ./tools/
COPY licenses ./licenses
COPY src ./src
RUN node .yarn/releases/yarn-4.18.0.cjs build
COPY --from=supervisor /usr/local/go/LICENSE /tmp/go-runtime-license
RUN node -e "const fs = require('node:fs'); fs.appendFileSync('dist/THIRD_PARTY_NOTICES.txt', '\\nGo runtime standard library (BSD-3-Clause)\\n' + fs.readFileSync('/tmp/go-runtime-license', 'utf8'))"

FROM ${RUNTIME_IMAGE} AS runtime
COPY --chown=65532:65532 --chmod=0444 nginx-runtime.conf /etc/nginx/nginx.conf
COPY --chown=65532:65532 --chmod=0444 nginx.conf /etc/nginx/conf.d/nginx.default.conf
COPY --from=builder --chown=65532:65532 /app/dist /usr/share/nginx/html
COPY --from=supervisor --chown=65532:65532 --chmod=0555 /harbor-lens-runtime /usr/bin/harbor-lens-runtime
USER 65532:65532
ENTRYPOINT ["/usr/bin/harbor-lens-runtime"]
CMD []
STOPSIGNAL SIGTERM
EXPOSE 8080
# Readiness is an external HTTP request to /healthz; nginx -t only checks config.
HEALTHCHECK NONE
