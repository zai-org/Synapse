# Synapse Host Deploy

This repository is deployed on a single Ubuntu host with:

- local `nginx`
- `systemd` for API and web
- Docker for PostgreSQL and Redis
- Prebuilt GHCR images for the API and desktop web containers
- desktop web on a production Next.js server
- optional localhost-only Next dev server for remote debugging over SSH

## 1. Host prerequisites

Install the host packages:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 nginx
sudo systemctl enable --now docker nginx
```

## 2. Local env files

Generate the local-only env files:

```bash
./setup.sh
```

This creates:

- `.env`
- `packages/web-next/.env.local`

Optional web env:

- `NEXT_ALLOWED_DEV_ORIGINS` for extra Next dev origins, as a comma-separated list of hostnames or URLs

Before starting the API in any environment, fill the Volcengine realtime ASR variables in `.env`:

- `ASR_PROVIDER=volcengine`
- `VOLCENGINE_ASR_APP_ID`
- `VOLCENGINE_ASR_ACCESS_TOKEN`
- `VOLCENGINE_ASR_SECRET_KEY`
- `VOLCENGINE_ASR_RESOURCE_ID=volc.seedasr.sauc.duration`
- `VOLCENGINE_ASR_WS_URL=wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`
- `VOLCENGINE_ASR_MAX_CONCURRENCY=3`
- `VOLCENGINE_ASR_CONNECT_TIMEOUT_MS=10000`
- `VOLCENGINE_ASR_IDLE_TIMEOUT_MS=15000`

Default seeded platform admin:

- email: `demo@synapse.dev`
- password: `demo1234`

## 3. Infrastructure containers

Start the local-only infrastructure containers:

```bash
sudo docker compose up -d postgres redis
```

Notes:

- Redis is bound to loopback and requires a password from `.env`
- The production compose profile can also run the API and desktop web from prebuilt images:

```bash
sudo docker compose --profile production pull api web
sudo docker compose --profile production up -d postgres redis api web
```

By default these services use:

- `ghcr.io/zai-org/synapse-api:${SYNAPSE_IMAGE_TAG:-latest}`
- `ghcr.io/zai-org/synapse-web:${SYNAPSE_IMAGE_TAG:-latest}`

Set `SYNAPSE_IMAGE_TAG`, `SYNAPSE_API_IMAGE`, or `SYNAPSE_WEB_IMAGE` in `.env` to pin a release or use a different registry.

If you need to build the application images locally instead of pulling from GHCR, use the build override:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.build.yml --profile production up -d --build postgres redis api web
```

## 4. Application dependencies

Install Node dependencies:

```bash
npm ci
```

## 5. Database initialization

For full reset plus seed data:

```bash
bash -lc 'set -a && source ./.env && set +a && npm run db:reset -w packages/api'
```

For schema-only initialization:

```bash
bash -lc 'set -a && source ./.env && set +a && npm run db:migrate -w packages/api'
```

## 6. Systemd services

Install and enable the services:

```bash
sudo install -m 644 infrastructure/systemd/synapse-api.service infrastructure/systemd/synapse-web.service infrastructure/systemd/synapse-web-dev.service -t /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now synapse-api synapse-web
```

Important:

- On hosts with `synapse-api.service` enabled, do not also start the API manually with `npm run start -w packages/api`, `node dist/index.js`, or `npm run dev -w packages/api`.
- `synapse-api.service` is the only supported API process on the host. A second API instance can grab port `3001`, trigger `EADDRINUSE`, and cause repeated restart attempts.
- `infrastructure/scripts/start-api.sh` now refuses to start when port `3001` is already in use, and exits with status `200`. The unit file treats that exit code as non-restartable to avoid restart storms.
- `synapse-web.service` is the only public web entrypoint and binds `127.0.0.1:3000` for nginx to proxy.
- `synapse-web-dev.service` binds `127.0.0.1:3002` only. Keep it disabled by default and start it only when you need remote dev debugging.

For remote web development:

```bash
sudo systemctl start synapse-web-dev
ssh -L 3002:127.0.0.1:3002 <user>@<host>
```

Then open `http://127.0.0.1:3002` locally through the tunnel.

## 7. Nginx

Do not commit the real `infrastructure/nginx.conf`.
It is intentionally gitignored.

Create a local config from `infrastructure/nginx.conf.template` and replace:

- `{{SERVER_NAME}}`
- `{{API_UPSTREAM}}`
- `{{WEB_UPSTREAM}}`
- `{{TLS_CERT_PATH}}`
- `{{TLS_KEY_PATH}}`

Install it:

```bash
sudo install -d -m 755 /etc/nginx/certs /etc/nginx/sites-available /etc/nginx/sites-enabled
sudo install -m 644 infrastructure/nginx.conf /etc/nginx/sites-available/synapse.conf
sudo ln -sfn /etc/nginx/sites-available/synapse.conf /etc/nginx/sites-enabled/synapse.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 8. Verification

Check services:

```bash
systemctl is-active synapse-api synapse-web nginx docker
```

Check health:

```bash
curl -sS http://localhost:3001/api/v1/health
curl -sS https://<your-domain>/api/v1/health
curl -I http://127.0.0.1:3000
```

## 9. Troubleshooting

If a session shows `Recovered after the previous worker stopped while this turn was still running.`:

- A previous API worker exited while a turn was still marked `running`. The message is a recovery marker, not a model response.
- First check for duplicate API processes:

```bash
systemctl status synapse-api.service --no-pager
ss -ltnp | rg ':3001'
ps -eo pid,ppid,lstart,etime,cmd | rg 'node dist/index.js|npm run start -w packages/api|tsx watch src/index.ts'
```

- If port `3001` is owned by a user-session process instead of `synapse-api.service`, stop the stray process and then restart the service:

```bash
sudo systemctl stop synapse-api.service
kill <stray-pid>
sudo systemctl start synapse-api.service
```

- If you need to confirm whether the service is looping on startup, inspect the API journal:

```bash
journalctl -u synapse-api.service -n 100 --no-pager
```
