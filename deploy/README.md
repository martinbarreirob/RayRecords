# Deployment

Server: Hetzner CX23 (4 GB). Three small containers of our own (`web`, `api`, `cloudflared`). MongoDB is the instance that already runs on the server, with a separate database and a user that can only touch it.

```
Browser ──HTTPS──► Cloudflare ──tunnel──► cloudflared ──► web (nginx) ──► api:3000 ──► Mongo (database "rayrecords")
```

The tunnel is an outbound connection from the server to Cloudflare, so no inbound port is opened. The public hostname is `rayrecords.nonchoperdas.com`.

## Memory budget

| Service         | `mem_limit` | Notes                                                                           |
| --------------- | ----------- | ------------------------------------------------------------------------------- |
| `web` (nginx)   | 64 MB       | Static files and a proxy.                                                       |
| `api` (Node)    | 256 MB      | `--max-old-space-size=192`: the GC runs before the kernel kills the container.  |
| `cloudflared`   | 64 MB       | Tunnel connector.                                                               |
| Existing Mongo  | -           | Shared with the other project; see below.                                       |

`memswap_limit` equals `mem_limit` everywhere: without swap, a runaway container cannot drag the rest down.

## First install

1. **Limited Mongo user.** From `mongosh` as an admin user:

   ```js
   use rayrecords
   db.createUser({ user: 'rayrecords', pwd: '<long password>', roles: [{ role: 'readWrite', db: 'rayrecords' }] })
   ```

2. **WiredTiger cache.** `compose.dev.yml` starts the local Mongo with `--wiredTigerCacheSizeGB 0.5`. If the server's Mongo is shared, that setting also affects the other project: only apply it there if that project tolerates it.

3. **Configuration.** Copy `deploy/.env.example` to `deploy/.env` and fill it in. If Mongo lives in another compose project, keep the `COMPOSE_FILE` override (`docker-compose.mongo-network.yml`) and set `MONGO_NETWORK` to that project's network (`docker network ls`).

4. **Tunnel.** Create a Cloudflare Tunnel (Zero Trust > Networks > Tunnels, remotely managed), add a public hostname that points to `http://web:80`, and put the tunnel token in `TUNNEL_TOKEN`. The DNS record is a proxied CNAME to `<tunnel-id>.cfargotunnel.com`.

5. **Image access.** The repository is private, so its GHCR packages are too. The CI deploy job logs in to `ghcr.io` on the server with a short-lived token on every deploy. For a manual pull, run `docker login ghcr.io` with a GitHub token that has `read:packages`.

6. **Start.**

   ```bash
   cd deploy
   docker compose pull
   docker compose up -d
   ```

7. **User.** The app has a single user and no sign-up screen. Create it (or change its password) from the container. The password is asked for without echo, 12 characters minimum:

   ```bash
   docker compose exec -it api node dist/cli/create-user.js <username>
   ```

HTTPS is terminated by Cloudflare. nginx forwards `X-Forwarded-Proto`, which the API needs to set `Secure` cookies.

## Updating

On every push to `main`, CI runs the checks, publishes `rayrecords-api` and `rayrecords-web` to GHCR and deploys them over SSH. See [DEVELOPMENT.md](../docs/DEVELOPMENT.md#ci). To deploy by hand, from the repository root:

```bash
docker build -f apps/api/Dockerfile -t ghcr.io/martinbarreirob/rayrecords-api:latest .
docker build -f apps/web/Dockerfile -t ghcr.io/martinbarreirob/rayrecords-web:latest .
docker push ghcr.io/martinbarreirob/rayrecords-api:latest
docker push ghcr.io/martinbarreirob/rayrecords-web:latest
```

Then on the server:

```bash
cd deploy && docker compose pull && docker compose up -d
```

To roll back, set `TAG=<sha>` in `deploy/.env` (every build is also published under its commit SHA).

## Local development

```bash
pnpm dev:db     # Mongo in Docker (same limits as production)
pnpm seed       # sample data in the rayrecords_dev database
pnpm --filter @rayrecords/api create-user <username>   # once: the single user
pnpm dev:api    # API on :3000
pnpm dev:web    # Angular on :4300, proxying /api to the API
```

The seeder refuses to run when `NODE_ENV=production` or when the database name does not end in `_dev` or `_demo`, so it can never wipe the real database.
