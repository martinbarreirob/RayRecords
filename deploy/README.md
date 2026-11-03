# Despliegue

Servidor: Hetzner CX23 (4 GB). Solo hay dos contenedores propios (`web` y `api`); MongoDB es la instancia que ya existe en el servidor, con una base de datos separada.

```
Dispositivo (en la tailnet) ──HTTPS──► tailscale serve ──► 127.0.0.1:8080 (nginx) ──► api:3000 ──► Mongo (BD "rayrecords")
```

## Presupuesto de memoria

| Servicio        | `mem_limit` | Notas                                                                              |
| --------------- | ----------- | ---------------------------------------------------------------------------------- |
| `web` (nginx)   | 64 MB       | Solo estáticos y proxy.                                                            |
| `api` (Node)    | 256 MB      | `--max-old-space-size=192`: el GC actúa antes de que el kernel mate el contenedor. |
| Mongo existente | —           | Ver más abajo. Con `wiredTigerCacheSizeGB: 0.5` suele quedarse en ~0,8–1 GB.       |

`memswap_limit` es igual a `mem_limit` en todos: sin swap, un contenedor desbocado no arrastra al resto.

## Primera instalación

1. **Usuario de Mongo limitado a la BD nueva.** Desde `mongosh` con un usuario administrador:

   ```js
   use rayrecords
   db.createUser({ user: 'rayrecords', pwd: '<contraseña larga>', roles: [{ role: 'readWrite', db: 'rayrecords' }] })
   ```

2. **Caché de WiredTiger.** `compose.dev.yml` ya arranca el Mongo local con `--wiredTigerCacheSizeGB 0.5`. Si el Mongo del servidor es compartido, ese ajuste afecta también al otro proyecto: aplícalo en su `command:` / `mongod.conf` (`storage.wiredTiger.engineConfig.cacheSizeGB: 0.5`) solo si ese proyecto lo tolera.

3. **Configuración.** Copia `deploy/.env.example` a `deploy/.env` y rellénalo. Si el Mongo vive en otro compose, deja activo `COMPOSE_FILE` con el override `docker-compose.mongo-network.yml` y pon el nombre de su red en `MONGO_NETWORK` (`docker network ls`).

4. **Acceso a las imágenes.** El repo es privado, así que los paquetes de GHCR también: en el servidor, `docker login ghcr.io` con un token de GitHub con permiso `read:packages`.

5. **Arranque.**

   ```bash
   cd deploy
   docker compose pull
   docker compose up -d
   ```

6. **HTTPS dentro de la tailnet.** Las passkeys y las cookies `Secure` exigen HTTPS. Con Tailscale instalado en el servidor:

   ```bash
   tailscale serve --bg 8080
   ```

   La app queda en `https://<máquina>.<tailnet>.ts.net`. No se abre ningún puerto a internet: nginx solo escucha en `127.0.0.1`.

## Actualizar

CI publica `rayrecords-api` y `rayrecords-web` en GHCR en cada push a `main`. En el servidor:

```bash
cd deploy && docker compose pull && docker compose up -d
```

Para volver atrás, fija `TAG=<sha>` en `deploy/.env` (cada build también se publica con el SHA del commit).

## Desarrollo local

```bash
pnpm dev:db     # Mongo en Docker (con los mismos límites que producción)
pnpm seed       # datos de ejemplo en la BD rayrecords_dev
pnpm dev:api    # API en :3000
pnpm dev:web    # Angular en :4200, con proxy de /api hacia la API
```

El seeder se niega a ejecutarse si `NODE_ENV=production` o si el nombre de la BD no termina en `_dev` o `_demo`, para que nunca pueda borrar la BD real.
