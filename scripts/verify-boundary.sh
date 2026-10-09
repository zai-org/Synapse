#!/usr/bin/env bash
#
# verify:boundary — the single must-run gate for the DB / DTO / Wire boundary
# refactor (docs/architecture-boundary-refactor-master-plan.md). The root
# `npm test` / `npm run typecheck` only cover packages/api, and mobile-app is
# not even in the root workspace — so "root build is green" never meant the
# boundary-refactor clients + protocol packages were safe (round-6 P2-3). This
# script closes that gap: it builds the dependency chain, runs every boundary
# guard + the business-enum audit, and typechecks/tests every package that
# carries a piece of the boundary contract (API, shared, device-protocol,
# device-sdk, device-runtime, remote-agent-daemon, web-next, mobile-app).
#
# Usage: npm run verify:boundary   (from repo root)
#
# Exits non-zero on the first failing step. Set VERIFY_SKIP_TESTS=1 to run only
# the build + guard + typecheck layers (faster pre-commit gate).

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
ok() { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }

# ── 1. Build the dependency chain in order ──────────────────────────────────
# device-protocol → shared are the contract sources everything else imports.
step "build: device-protocol → shared → device-runtime → device-sdk → api → daemon"
npm run build -w packages/device-protocol
npm run build -w packages/shared
npm run build -w packages/device-runtime
npm run build -w packages/device-sdk
npm run build -w packages/api
npm run build -w packages/remote-agent-daemon
ok "builds clean"

# ── 2. Boundary guards (machine-checkable layering rules) ───────────────────
step "guard:api + guard:layering + guard:datetime + guard:logging"
npm run guard:db -w packages/api
npm run guard:fk-policy -w packages/api
npm run guard:soft-delete -w packages/api
npm run guard:layering -w packages/api
# Config JSON Schemas must stay in sync with their Zod sources. Runs here (not
# only via api pretest, which CI bypasses) so committed /schemas/*.schema.json
# can never drift from packages/api/scripts/gen-config-schemas.mts. The generator
# imports its Zod sources transitively from @synapse/shared AND
# @synapse/device-runtime (config-schemas) — both are built above, so keep those
# build steps before this guard.
npm run guard:schemas -w packages/api
node ./scripts/guard-datetime-boundaries.mjs
node ./scripts/guard-logging.mjs
node ./scripts/guard-trace-propagation.mjs
# Self-test the carrier-contract engine so a future refactor that silently stops
# detecting ledger drift is caught here rather than passing CI with a dead ratchet.
node --test ./scripts/guard-trace-propagation.test.mjs
# Release-cohort version cohesion: the publishable @synapse packages must bump in
# lockstep, pin each other to the exact cohort version (no `*`/range), keep the
# platform bundles decoupled, and have the lock in sync. Cheap manifest+lock read.
node ./scripts/guard-workspace-versions.mjs
# Patches, two layers. (1) HOST tree: every patch in patches/ is applied to the
# node_modules this gate runs against. --verify-only is load-bearing — a gate that
# repairs its own subject reports nothing (CI `npm ci` already fires postinstall).
# --require-all because the host tree is a full install. Version-agnostic: no patch
# filename, package or marker symbol appears here.
node ./scripts/apply-patches.mjs --verify-only --require-all
# (2) IMAGES: this script can only ever see the HOST tree, so it can never speak
# for an artifact — that is exactly how an unpatched api image shipped while this
# gate was green. The artifact assertion lives in each Dockerfile
# (`RUN node scripts/apply-patches.mjs`), and this guard is what keeps it there.
node ./scripts/guard-image-patches.mjs
ok "guards clean"

# ── 2b. Curated ESLint rule set (no-nested-ternary et al.) ──────────────────
# Per-package eslint.config.mjs across the business-logic packages enforce the
# Airbnb-aligned control-flow subset (headline: no-nested-ternary). Fast,
# syntactic, no build needed — runs here so a chained ternary can never land.
step "lint: curated ESLint rules across business-logic packages"
npm run lint
ok "lint clean"

# ── 2c. Type-aware lint: api switch-exhaustiveness ──────────────────────────
# Separate from the fast `npm run lint` because building the api type graph is
# slow + memory-hungry (the script bumps the Node heap to 8GB). 0 violations
# today — regression prevention for future discriminated-union switches.
step "lint:types — @typescript-eslint/switch-exhaustiveness-check (api)"
npm run lint:types -w @synapse/api
ok "type-aware lint clean"

# ── 2d. JSX leaked-render gate (crash class) ────────────────────────────────
# `{count && <X/>}` renders a stray "0"/"NaN" on web and CRASHES React Native.
# Standalone gate so it covers web-next (whose full lint is not a CI gate) plus
# mobile-app. mobile-app's own lint is also run for its error-level rules
# (rules-of-hooks etc.); its react-hooks v7 rules are warnings by design.
step "lint: react/jsx-no-leaked-render (web-next + mobile-app)"
node_modules/.bin/eslint --no-config-lookup -c scripts/eslint-jsx-leaked.config.mjs \
  "packages/web-next/**/*.tsx" "packages/mobile-app/**/*.tsx"
( cd packages/mobile-app && npm run lint )
ok "jsx-leaked-render + mobile-app lint clean"

# ── 3. Business-enum audit (no raw protocol literals) ───────────────────────
step "audit:business-enums"
npm run audit:business-enums
ok "business-enum audit clean"

# ── 4. Typecheck the clients that consume the shared/wire contracts ─────────
step "typecheck: api + web-next + mobile-app"
npm run typecheck -w packages/api
# API typecheck runs package lifecycle builds that clean/recreate dependency
# dist folders. Rebuild the package chain once more before raw API tests below
# so test workers never observe a transiently missing workspace export.
npm run build -w packages/device-protocol
npm run build -w packages/shared
npm run build -w packages/device-runtime
npx tsc -p packages/web-next/tsconfig.json --noEmit
( cd packages/mobile-app && npm run typecheck )
ok "typechecks clean"

# ── 5. Tests across the boundary-bearing packages ───────────────────────────
if [ "${VERIFY_SKIP_TESTS:-0}" = "1" ]; then
  printf '\n\033[1;33m(VERIFY_SKIP_TESTS=1 — skipping test suites)\033[0m\n'
else
  step "test: device-protocol / shared / device-runtime / device-sdk / remote-agent-daemon / api / web-next / mobile-app"
  npm run test -w packages/device-protocol
  npm run test -w packages/shared
  npm run test -w packages/device-runtime
  npm run test -w packages/device-sdk
  npm run test -w packages/remote-agent-daemon
  # --experimental-test-module-mocks: the WS tracing tests (asr-tracing /
  # ws-route-tracing) drive the REAL handlers with mock.module'd auth/registry
  # seams (Node 22 gates mock.module behind this flag; it only enables the API).
  ( cd packages/api && npx tsx --test --experimental-test-module-mocks --test-concurrency=4 "src/**/*.test.ts" )
  npm run test -w packages/web-next
  ( cd packages/mobile-app && npm test )
  # Cross-language carrier-contract golden vectors (workstream F, adjudication
  # R8): run the SHARED packages/shared/src/utils/traceparent-vectors.json
  # THROUGH the Go (cua) and Rust (fs-helper) helper code, so behaviour — not
  # just the regex TEXT that guard-trace-propagation.mjs byte-compares — stays
  # identical across all three languages. Neither `go test` nor `cargo test` ran
  # in this gate before, so the cross-language assertions were never executed.
  step "test: go (sidecars/cua) + cargo (sidecars/fs-helper) carrier vectors"
  ( cd sidecars/cua && go test ./... )
  ( cd sidecars/fs-helper && cargo test )
  ok "cross-language carrier-contract tests pass"
fi

printf '\n\033[1;32m✓ verify:boundary passed\033[0m\n'
