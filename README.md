<p align="center">
    <picture>
        <source media="(prefers-color-scheme: light)" srcset="docs/assets/synapse-full-logo.svg">
        <img src="docs/assets/synapse-full-logo-dark.svg" alt="Synapse" width="500">
    </picture>
</p>

<p align="center">
  <strong>Build AI teams, not chatbots.</strong>
</p>

<p align="center">
  A self-hosted AI workspace for shareable teammates, shared conversations, memory,
  governed access to plugins and MCP tools, local execution, and event-driven automation.
</p>

<p align="center">
  <strong>English (US)</strong> ·
  <a href="./README_CN.md">简体中文</a> ·
  <a href="./README_ES.md">Español</a>
</p>

<p align="center">
  <a href="#why-synapse">Why Synapse</a> ·
  <a href="#architecture-overview">Architecture</a> ·
  <a href="#example-flows">Example Flows</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#surfaces-in-this-repo">Surfaces in This Repo</a> ·
  <a href="./deploy.md">Deployment</a>
</p>

<p align="center">
  <img
    src="docs/.images/gpt-image-2/synapse-framework-gpt-image-2-20260514-061731.png"
    alt="Synapse framework overview"
    width="100%"
  />
</p>

> [!WARNING]
> Synapse is still in an early design and implementation phase. Schemas, runtime contracts, and product surfaces can change quickly, and backwards compatibility for old data is not guaranteed yet.

Synapse is a conversation-centric runtime for digital teammates.

Most AI products treat chat as a thin interface on top of isolated bots. Synapse treats the conversation itself as the collaboration boundary: humans, platform-native actors, and bridged remote agents can work in the same thread; memory, permissions, plugins, relay-exposed tools, and event sources are governed at the workspace layer; shareable teammates can be added across workspaces like contacts and then granted the right resources to work.

## Why Synapse

- **Conversation-first, not bot-first.** A conversation is the runtime boundary for participants, transcript visibility, actor execution, wakeups, and memory handoff.
- **Shareable teammates.** Workspace members, actors, and remote agents can be shared across workspaces and added through a contact-style graph. Shared actors can work with the destination workspace's granted resources.
- **Governed resource access.** Plugins, skills, MCP relay exposures, and event sources are modeled as workspace-owned resources with explicit access control, grants, and audit trails.
- **Cloud coordination plus local execution.** Teams can collaborate in the web app while still reaching local browsers, desktops, filesystems, internal services, or bridged remote-agent runtimes.
- **Event-driven teamwork.** Scheduled jobs, custom webhooks, and integration-backed event sources can wake conversations and route work automatically.
- **Native and remote agents together.** Platform-native actors live inside Synapse. Remote agents join through a bridge and keep their own runtime stack.

## Core Model

| Concept          | What it means in Synapse                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `Workspace`      | Ownership and governance boundary for teammates, plugins, relay devices, and event sources.       |
| `Conversation`   | Shared runtime where participants collaborate and work is persisted.                              |
| `Actor`          | A native Synapse teammate managed by the platform.                                                |
| `Remote agent`   | An external runtime bridged into a conversation without becoming a native actor.                  |
| `Resource layer` | Plugins, skills, MCP relay exposures, and event sources that can be granted, audited, and reused. |

## Architecture Overview

Synapse uses a conversation-centric architecture. Around that core, the system separates resource runtimes, access control, memory, transport integration, and context management into distinct subsystems.

- **Conversation and session runtime.** `conversation`, participants, conversation items, actor sessions, and `session_wakeups` define the primary collaboration and execution model. Web chat, remote-agent bridges, and IM transports reuse this model rather than implementing separate conversation systems.
- **Resource runtimes.** Plugins, installed skills, relay exposures, actors, and remote agents are represented as distinct runtime resources with independent state, lifecycle, and APIs. Marketplace catalog metadata is stored separately from installed runtime state.
- **Access control.** Authorization is evaluated against explicit resource types, including `workspace`, `conversation`, `actor`, `remote_agent`, `plugin_installation`, `installed_skill`, `relay_capability`, and `memory_item`. Sharing, invocation, and governance therefore rely on the same access model.
- **Memory subsystem.** Memory is partitioned by scope: `workspace_shared`, `conversation_shared`, `actor_private`, `participant_private`, and `user_private`. Retrieval combines lexical indexing and embeddings to support both durable memory and thread-local working state.
- **Transport and automation integration.** IM transports bind external endpoints back to conversations. Event sources, schedules, webhooks, and integration triggers enter the same runtime so they can wake sessions and emit conversation-visible events.
- **Context window management.** Model context is compiled from canonical context items into shared and private archive chains plus a live tail window. Archive points, compaction runs, and per-event context policies bound prompt size while preserving scope and event semantics.

## Example Flows

- Share a research actor into another workspace, grant it the right plugins, and let it work in the same thread as people.
- Pair a desktop relay so teammates can use browser, filesystem, or command-line capabilities without giving every conversation global access.
- Register GitHub, GitLab, or custom webhook event sources to wake an incident room and bring the right actors into the conversation.
- Bridge a coding agent from another machine as a remote agent and let it collaborate in Synapse while keeping its own external runtime and tools.

## Exploratory Features

This section highlights runtime directions that are already being validated in code, but should not yet be treated as stable platform contracts.

### Everything is a file model

Synapse is exploring a virtual-filesystem projection for selected local runtimes. The goal is to expose state, structure, and actions through paths, files, and writable control nodes. This fits the platform's authorization model and also aligns with models' strong prior over command-line workflows, where composition, pipes, and chained operations can express richer procedures with fewer execution round trips.

Current support includes:

- **Session-scoped VFS exposures.** Relay VFS currently projects builtin browser and CUA runtimes under session paths, with file-based controls for session creation, inspection, and teardown.
- **Browser projection.** The browser surface exposes page state, page lists, current-page snapshots and screenshots, a tree projection with per-node files, and writable action files for navigation and interaction.
- **CUA projection.** The CUA surface exposes displays, windows, apps, captures, keyboard state, focused-element summaries, and a semantic accessibility tree when the desktop backend is available.
- **Action files.** Writable nodes are already mapped to concrete runtime actions. In the browser surface this includes operations such as `navigate`, `new_page`, `select_page`, `click`, `fill`, `press_key`, and `evaluate`; in the CUA surface this includes `click`, `type_text`, `press_keys`, and `scroll`, with per-node semantic actions where actionable bounds are available.

## Roadmap

Roadmap items describe planned platform capabilities. They are directional and may change as the runtime model evolves.

### Planned: Sandbox runtime

Introduce a managed Sandbox runtime as a governed execution surface for agents.

Planned goals:

- Provide isolated execution environments as workspace-governed resources rather than direct host access.
- Support suspend/resume and persistent state so agent work can continue across runs.
- Offer standardized environment profiles, including optional GUI variants and preconfigured integrations.
- Support both cloud-hosted and local-managed deployments.
- Evaluate E2B-style control interfaces where they fit Synapse's conversation, resource, and authorization model.

This is a planned capability, not a shipped feature.

## Quick Start

### Local web + API

Prerequisites:

- Node.js
- Docker and Docker Compose

Clone the repo and start the core local stack:

```bash
git clone https://github.com/zai-org/Synapse
cd Synapse

npm ci
./setup.sh
docker compose up -d postgres redis

# Create the current schema
npm run db:bootstrap

# Start the API and desktop web in separate terminals
npm run dev:api
npm run dev:web
```

Open:

- Desktop web: `http://localhost:3000`
- API health: `http://localhost:3001/api/v1/health`

If your local Docker setup requires elevated privileges, run the `docker compose` command with `sudo`.

Before using actor or chat flows with real models, edit `.env` and set an AI provider such as `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`.

### Optional: reset and seed a demo environment

If you want a fully seeded local environment with demo users, a demo workspace, official actors, and built-in plugin catalog entries:

```bash
npm run db:rebuild
```

Seeded demo accounts:

- `demo@synapse.dev` / `demo1234`
- `yihang@synapse.dev` / `demo1234`

### Optional: run the Expo mobile app

The mobile client lives in its own package with its own lockfile:

```bash
cd packages/mobile-app
npm ci
npm run web
```

You can also use `npm run ios` or `npm run android` inside `packages/mobile-app`.

## Surfaces in This Repo

- `packages/api` — Fastify API, orchestration runtime, chat, memory, files, automation, plugins, relay, IM, and audit surfaces
- `packages/web-next` — Next.js desktop web app and workspace dashboard
- `packages/mobile-app` — Expo Router mobile app and exported mobile web surface
- `packages/remote-agent-daemon` — machine-side daemon for bridging external runtimes such as Codex CLI or Claude Code
- `packages/shared` — shared types, protocol contracts, automation definitions, and constants
- `subprojects/cli-anything` — vendored capability pack used by relay-backed auto-loaded skills

## Deployment

This repository currently ships with a self-hosting path centered on a single Ubuntu host:

- `systemd` for the API and desktop web services
- `nginx` as the public entrypoint
- Dockerized PostgreSQL and Redis for local infrastructure
- prebuilt GHCR images for optional containerized API and desktop web services
- desktop web served from `packages/web-next`
- mobile web exported as static assets from `packages/mobile-app`

See [`deploy.md`](deploy.md) for the production deployment path used in this repo.
