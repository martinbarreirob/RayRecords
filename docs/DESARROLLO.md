# Guía de desarrollo

## Requisitos y versiones

| Herramienta      | Versión                                | Nota                                                              |
| ---------------- | -------------------------------------- | ----------------------------------------------------------------- |
| Node.js          | ≥ 22.12 (probado con 22.23)            | `engines` en el `package.json` raíz                               |
| pnpm             | 10.34.9                                | Fijada en `packageManager`                                        |
| Docker           | 29.x                                   | Para Mongo de desarrollo y para construir las imágenes            |
| Angular          | 22.2                                   | Standalone, signals, sin zone.js, tests con Vitest                |
| TypeScript       | 7.0 en `shared` y `api`; ~6.0 en `web` | Angular exige TS 6; el código de `shared` debe compilar con ambas |
| Fastify          | 5.12                                   | Con `fastify-type-provider-zod` 7                                 |
| MongoDB (driver) | 7.8                                    | Imagen `mongo:8` en desarrollo                                    |
| Zod              | 4.6                                    |                                                                   |
| Vitest           | 5                                      | En los tres paquetes                                              |

## Primeros pasos

```bash
pnpm install
pnpm dev:db      # MongoDB en Docker
pnpm seed        # datos de ejemplo en rayrecords_dev
pnpm dev:api     # http://localhost:3000
pnpm dev:web     # http://localhost:4200
```

Para cambiar la configuración de la API, copia `apps/api/.env.example` a `apps/api/.env` (no se versiona; `tsx` lo carga solo si existe).

### Variables de entorno de la API

| Variable    | Por defecto                 | Notas                                                                          |
| ----------- | --------------------------- | ------------------------------------------------------------------------------ |
| `NODE_ENV`  | `development`               | En `development` los logs salen con `pino-pretty`                              |
| `PORT`      | `3000`                      |                                                                                |
| `HOST`      | `0.0.0.0`                   |                                                                                |
| `MONGO_URI` | `mongodb://127.0.0.1:27017` | **Obligatoria en producción**                                                  |
| `MONGO_DB`  | `rayrecords_dev`            | **Obligatoria en producción**. El seeder exige que termine en `_dev` o `_demo` |
| `LOG_LEVEL` | `info`                      |                                                                                |

### Variables del despliegue

Ver `deploy/.env.example`: `GHCR_OWNER`, `TAG`, `BIND_ADDR`, `WEB_PORT`, `MONGO_URI`, `MONGO_DB`, `COMPOSE_FILE` y `MONGO_NETWORK`.

## Comandos

Desde la raíz:

| Comando          | Qué hace                                                            |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm dev:db`    | Levanta Mongo de desarrollo (`deploy/compose.dev.yml`)              |
| `pnpm seed`      | Borra y rellena `rayrecords_dev`                                    |
| `pnpm dev:api`   | API con recarga (`tsx watch`)                                       |
| `pnpm dev:web`   | Angular con proxy de `/api` hacia `localhost:3000`                  |
| `pnpm test`      | Tests de los tres paquetes                                          |
| `pnpm typecheck` | `tsc --noEmit` en `shared` y `api` (el de `web` lo hace `ng build`) |
| `pnpm build`     | Bundle de la API (esbuild) y build de producción de Angular         |
| `pnpm format`    | Prettier sobre todo el repo                                         |

Para una sola pieza: `pnpm --filter @rayrecords/api test`, `pnpm --filter @rayrecords/shared typecheck`, etc.

Para borrar los datos de desarrollo: `docker compose -f deploy/compose.dev.yml down -v` (el volumen es `rayrecords-dev_mongo-data`).

## Estructura del código

```
apps/api/src/
  server.ts            Arranque: config → Mongo → índices → app → escucha, con cierre ordenado
  app.ts               Construye Fastify: validadores Zod, `app.db`, módulos bajo /api
  config.ts            Variables de entorno validadas
  db/
    client.ts          Conexión (pool de 5) y colecciones tipadas
    documents.ts       Tipos de los documentos de Mongo, derivados de shared
    indexes.ts         ensureIndexes, idempotente, en cada arranque
  modules/
    health/            GET /api/health
    lists/             routes.ts + mapper.ts (plantilla de módulo)
    expenses/          normalize, categorize, hash, prepare (lógica pura, con tests)
  seed/                Seeder: catálogo, transacciones generadas, RNG con semilla

apps/web/src/app/
  app.ts · app.html    Shell: navegación, captura rápida y router-outlet
  app.config.ts        Router con binding de parámetros a input(), proveedores de la API
  app.routes.ts        Una ruta lazy por módulo
  core/api/            ApiClient (contrato), HttpApiClient (implementación), provideApi()
  features/
    capture/           Barra de captura rápida y su vista previa
    lists/             Store compartido de listas, lista y detalle
    notes/ calendar/ expenses/ accounts/   Pantallas esqueleto con rutas propias

packages/shared/src/
  schemas/             Zod: common, list, item, daily-note, account, transaction, category
  presets/             LIST_PRESETS, DEFAULT_CATEGORIES, DEFAULT_RULES
  capture/             parse.ts, price.ts, types.ts (+ tests)
  dates.ts · slug.ts   Utilidades de fechas "de calendario" y slugs
```

## Cómo se hace…

### Añadir un módulo a la API

1. Crear `apps/api/src/modules/<nombre>/` con `routes.ts` (un `FastifyPluginAsyncZod`) y, si hace falta, `mapper.ts` (documento de Mongo → DTO).
2. Declarar los esquemas de entrada y salida con los de `@rayrecords/shared` en `schema: { body, querystring, response }`: así se validan y se serializan solos.
3. Registrar el plugin dentro del bloque con prefijo `/api` en `app.ts`.
4. Si usa una colección nueva: añadir su tipo en `db/documents.ts`, su acceso en `db/client.ts` y sus índices en `db/indexes.ts`.

### Añadir una pantalla o módulo a la web

1. Crear `features/<nombre>/` con `<nombre>.routes.ts` (constante de tipo `Routes`) y la página.
2. Añadir la ruta con `loadChildren` en `app.routes.ts` y el enlace en `app.html`.
3. Los datos se piden a través de `ApiClient`: añadir el método en la clase abstracta y en `HttpApiClient`. Las pantallas **nunca** inyectan `HttpClient` directamente, para poder sustituir la implementación (demo con datos en memoria, tests).

### Cambiar el modelo de datos

El cambio se hace en este orden: esquema Zod en `shared` → tipo del documento en `api/db/documents.ts` → mapper → índices si procede → seeder → tests. Como los tipos de los documentos se derivan de los esquemas con `Omit`, el compilador marca lo que falta.

### Añadir un tipo de lista

No requiere código: es un dato. Se añade una entrada a `LIST_PRESETS` (si debe ofrecerse como plantilla) o se crea la lista con sus `fieldDefs`. Los campos `money` se guardan en céntimos dentro de `item.extra`.

### Añadir un prefijo de captura

Los alias de lista no se programan: son el `captureAlias` de cada lista y se pasan al parser. Solo `hoy` y `mañana` están en el código (`DATE_PREFIXES` en `capture/parse.ts`). Un prefijo nuevo con fecha (por ejemplo `pasado`) se añade ahí con su desplazamiento en días y un test.

## El seeder

`pnpm seed` ejecuta `apps/api/src/seed/index.ts`. **Borra la base de datos entera** y la rellena de forma determinista (semilla 42), con las fechas relativas a hoy para que el calendario siempre tenga datos:

| Qué                 | Cantidad                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Categorías / reglas | 9 / 18                                                                                                                             |
| Listas              | 6: Películas, Series, Compras, Tareas, Portfolio web (tablero), Ideas                                                              |
| Elementos           | 47                                                                                                                                 |
| Notas del día       | 10                                                                                                                                 |
| Cuentas             | 2 (corriente y ahorro)                                                                                                             |
| Transacciones       | 130 en 6 meses, con una corrección manual, varias sin categoría y dos cafés idénticos el mismo día para ejercitar la deduplicación |

Guardas: se niega a ejecutarse con `NODE_ENV=production` o si `MONGO_DB` no termina en `_dev` o `_demo`.

## Tests

- `shared`: parser de captura, importes, fechas y slugs (90 tests). El parser es la pieza con más casos límite.
- `api`: categorización, hash de deduplicación, `prepareTransactions` y generador del seeder (31 tests). **No hay todavía tests de integración de rutas.**
- `web`: shell y vista previa de la captura (8 tests). `ng test --no-watch` para ejecución única.

## Convenciones

- **Dinero**: céntimos enteros, siempre. Gastos negativos.
- **Fechas de calendario**: `YYYY-MM-DD` como cadena; instantes como `Date`/ISO. Nada de `Date` para algo que no sea un instante.
- **Idioma**: documentación y textos de interfaz en español; identificadores de código y de datos en español sin acentos cuando son claves (`anio`, `puntuacion`, `porHacer`) y en inglés para la infraestructura.
- **Capas**: la lógica de negocio va en funciones puras con tests (como `categorize` o `prepareTransactions`); las rutas y los componentes solo orquestan.
- **Formato**: prettier (`pnpm format`), LF en todos los archivos (`.gitattributes`).
- **Comentarios**: explican el porqué (una restricción, una decisión), no repiten el código.

## Problemas conocidos y trucos

- **Mover o renombrar la carpeta del repo en Windows rompe `node_modules`**: pnpm usa enlaces con ruta absoluta. Hay que reinstalar con `CI=true pnpm install` (en PowerShell: `$env:CI='true'; pnpm install`), porque sin terminal pnpm se niega a purgar el directorio.
- **`shared` se consume como código fuente TypeScript**, sin compilar. La API lo resuelve por `exports` (`./src/index.ts`) y Angular por `paths` en `apps/web/tsconfig.json`. Si se añade otro punto de entrada hay que declararlo en los dos sitios.
- **`"sideEffects": false` en `shared` es lo que mantiene a Zod fuera del bundle de la web.** No hay que añadir código con efectos al importar. Si algún día la web importa un esquema Zod (por ejemplo para validar formularios), el bundle inicial crecerá unos 435 kB: valorar `zod/mini`.
- **Si un test de la web importa código de `shared` que usa un paquete que solo es dependencia de `shared`** (como `zod`), el builder de tests no lo encuentra: hay que añadirlo como dependencia de `web`. Hoy no hace falta porque se descarta al compilar.
- **Plantillas inline de Angular**: no escribir comillas invertidas dentro de ellas, ni siquiera en comentarios HTML; cierran el literal de la plantilla.
- **`pnpm deploy` necesita `--legacy`** en el Dockerfile de la API (pnpm 10 lo exige si el workspace no inyecta paquetes).
- **La API se empaqueta con esbuild** dejando externas las `dependencies` y metiendo dentro `@rayrecords/shared` (que por eso es una `devDependency`). Una dependencia de runtime nueva debe ir en `dependencies`.
- **Los dos Dockerfiles copian los `package.json` de todos los paquetes del workspace** para que `--frozen-lockfile` funcione. Un paquete nuevo del workspace necesita su línea `COPY` en ambos.
- **`ng new` falla con `pnpm dlx` dentro de un workspace**: usar `npx @angular/cli@latest`.
- **El seeder borra la base de datos entera**: no cambiar las guardas.

## Cuenta personal de GitHub

El repo está en una cuenta **personal**; la máquina tiene además una cuenta del trabajo autenticada en `gh`, que es la activa. Para no mezclarlas:

- Usar el token personal solo para el comando que lo necesita, sin cambiar la cuenta activa:

  ```powershell
  $env:GH_TOKEN = (gh auth token --user martinbarreirob)
  # … comando de gh …
  Remove-Item Env:GH_TOKEN
  ```

- Fijar la identidad **local** del repo (la global es la del trabajo): `git config user.name` y `git config user.email` con el correo `noreply` de GitHub de la cuenta personal.
- Empujar sin tocar el gestor de credenciales:

  ```powershell
  $env:GH_TOKEN = (gh auth token --user martinbarreirob)
  git -c credential.helper= -c "credential.helper=!gh auth git-credential" push
  Remove-Item Env:GH_TOKEN
  ```

- **El token personal no tiene el permiso `workflow`**, así que GitHub rechaza cualquier push que cree o modifique `.github/workflows/*`. Para concederlo (la autorización se hace en el navegador):

  ```bash
  gh auth switch --user martinbarreirob
  gh auth refresh -h github.com -s workflow
  gh auth switch --user <cuenta-del-trabajo>
  ```

## CI

`.github/workflows/ci.yml` define dos trabajos, pero **todavía no está versionado** (ver [ROADMAP](ROADMAP.md#estado-del-repositorio)):

1. `check`: `pnpm install --frozen-lockfile`, `typecheck`, `test` y `build`, en cada push a `main` y en cada pull request.
2. `images`: solo en push a `main`, construye `rayrecords-api` y `rayrecords-web` y las publica en GHCR con las etiquetas `latest` y el SHA del commit.

Las imágenes se construyen siempre en CI (o en local para probar): el servidor de 4 GB nunca ejecuta `pnpm install` ni `ng build`.
