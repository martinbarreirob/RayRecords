# Roadmap

Estado a 3 de noviembre de 2026. Este documento es la fuente de verdad de **qué está hecho, qué falta y qué está por decidir**. El [README](../README.md) solo resume; el diseño está en [ARQUITECTURA.md](ARQUITECTURA.md).

Leyenda: `[x]` hecho y verificado · `[ ]` pendiente · **(decisión)** hay algo que resolver antes o durante.

## Resumen

| Fase | Contenido                                                                                | Estado    |
| ---- | ---------------------------------------------------------------------------------------- | --------- |
| 1    | Esqueleto: monorepo, contratos compartidos, parser, despliegue, seeder, shell de Angular | Hecha     |
| 2    | Autenticación y base de la API                                                           | Por hacer |
| 3    | Listas, elementos y notas del día, con captura rápida conectada                          | Por hacer |
| 4    | Gastos y cuentas                                                                         | Por hacer |
| 5    | Calendario                                                                               | Por hacer |
| 6    | Estética y sistema de tokens                                                             | Por hacer |
| 7    | Puesta en producción y operación                                                         | Por hacer |
| —    | Opcionales (passkeys, demo pública, etc.)                                                | Sin fecha |

El orden importa: **la fase 2 va primero porque hasta que exista login la API no puede exponerse fuera de `localhost`**. La fase 6 (estética) se aplaza a propósito para no decidir tokens antes de tener pantallas reales; las pantallas actuales llevan solo la estructura mínima.

## Estado del repositorio

- `main` en `martinbarreirob/RayRecords` (privado), un commit inicial más los de documentación.
- `.github/workflows/ci.yml` **existe en local pero no está versionado ni subido**: GitHub rechaza el push de workflows con el token de la cuenta personal porque no tiene el permiso `workflow`. Hasta entonces **no hay CI ni se publican imágenes en GHCR**. Ver [la tarea en la fase 2](#fase-2--autenticación-y-base-de-la-api).
- 129 tests pasando (90 `shared`, 31 `api`, 8 `web`), typecheck limpio y los dos builds correctos.
- Las dos imágenes Docker se construyeron y se ejecutaron en local con el compose de producción: nginx usó 12 MiB de 64 y la API 35 MiB de 256.
- Sin probar nunca: CI en GitHub, el servidor real (Hetzner), Tailscale y el Mongo existente.

## Fase 1 — Esqueleto (hecha)

- [x] Monorepo pnpm (`apps/web`, `apps/api`, `packages/shared`), TypeScript, prettier, `.editorconfig`, `.gitattributes`.
- [x] Esquemas Zod de listas, elementos, notas del día, cuentas, transacciones, categorías y reglas.
- [x] Presets de lista (películas/series, compras, tablero, libre) como datos.
- [x] Parser de captura rápida con 90 tests, incluidos los casos límite.
- [x] API Fastify: `/api/health` y `/api/lists`, plantilla de módulo, configuración validada.
- [x] Índices de MongoDB y `ensureIndexes` idempotente.
- [x] Gastos: normalización de descripciones, hash de deduplicación con n.º de repetición, categorización por reglas, `prepareTransactions`.
- [x] Seeder determinista con guardas (solo `_dev`/`_demo`, nunca en producción).
- [x] Docker: compose de producción y de desarrollo con `mem_limit`, Mongo con `wiredTigerCacheSizeGB 0.5`, nginx, Dockerfiles multi-etapa.
- [x] Angular: rutas lazy por módulo, shell, captura rápida con vista previa y atajo (`Ctrl/Cmd+K` o `/`), `ApiClient` abstracto, pantallas esqueleto.
- [x] Documentación inicial y guía de despliegue.

## Fase 2 — Autenticación y base de la API

Objetivo: poder abrir la app desde mis dispositivos con sesión persistente y que todo `/api` quede protegido.

- [ ] Colecciones `users`, `sessions` (índice TTL sobre `expiresAt`) y `credentials` (passkeys, vacía de momento) con sus índices.
- [ ] Hash de contraseña con argon2.
- [ ] Alta del usuario único por CLI (`pnpm --filter @rayrecords/api create-user`), sin pantalla de registro.
- [ ] `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- [ ] Cookie `httpOnly; Secure; SameSite=Strict`, 30 días con renovación deslizante, sesión en Mongo (revocable).
- [ ] Hook global que exige sesión en todo `/api` salvo `health` y `login`.
- [ ] Limitación de intentos de login (rate limit) y comprobación de `Origin`.
- [ ] Formato uniforme de errores de la API (código, mensaje, detalles de validación).
- [ ] Angular: pantalla de login, guard de rutas e interceptor que redirige al login en 401.
- [ ] **(decisión)** Estrategia de tests de integración de la API: `mongodb-memory-server` frente a un servicio Mongo en CI. Hoy solo hay tests unitarios.
- [ ] Subir `ci.yml`: renovar el permiso `workflow` del token personal (ver [DESARROLLO.md](DESARROLLO.md#cuenta-personal-de-github)) y hacer `git add .github` + push.
- [ ] Una vez haya CI: comprobar que las imágenes se publican en GHCR y que el compose del servidor las descarga.

## Fase 3 — Listas, elementos y notas del día

Objetivo: usar la app a diario para capturar y consultar. Es la fase donde la captura rápida deja de ser una vista previa.

**Listas**

- [ ] `POST /api/lists` a partir de un preset (crear una lista nueva en pocos segundos, sin código), `PATCH` y archivado.
- [ ] Error claro si el alias de captura ya lo usa otra lista (el índice único parcial lo garantiza; falta el mensaje).
- [ ] Angular: formulario mínimo de nueva lista con selector de plantilla y edición de campos.

**Elementos**

- [ ] `GET /api/lists/:id/items`, `POST`, `PATCH`, `DELETE` de `/api/items`.
- [ ] Validación **flexible** de `extra` contra `list.fieldDefs`: tipo correcto en los campos definidos y claves libres permitidas.
- [ ] Filtros por tag y búsqueda de texto (ya existe el índice).
- [ ] Angular: vista de lista (tabla/tarjetas según los campos) y edición en línea.
- [ ] Tablero Kanban: mover entre columnas y reordenar. **(decisión)** Orden: hoy el seeder usa `order` numérico con huecos de 1000; alternativa, rangos fraccionarios (lexorank). Elegir antes de implementar el arrastrar y soltar con CDK.

**Notas del día**

- [ ] `GET /api/notes/:date` y `PUT /api/notes/:date` (upsert), `POST /api/notes/:date/append`.
- [ ] Angular: editor markdown, navegación entre días, vista previa.
- [ ] **(decisión)** Formato de lo que se añade desde la captura sin prefijo: línea sin más (hoy) o con hora (`- 14:32 texto`).

**Captura rápida conectada**

- [ ] `POST /api/capture`: ejecuta `parseQuickCapture` **en el servidor** con los alias de la BD (una sola fuente de verdad; el cliente solo la usa para la vista previa).
- [ ] Resolver el alias a su lista y mapear: `priceCents` → `extra.precio`, `category` → `extra.categoria`, `url`, `tags`, `dueDate`.
- [ ] **(decisión)** Si la lista destino no define los campos `precio` o `categoria`: ignorar el dato, guardarlo igualmente en `extra` o añadir el texto al título.
- [ ] **(decisión)** Si no existe ninguna lista con alias `tarea` (destino de `hoy:` / `mañana:`): crearla automáticamente o caer a la nota del día. La regla "capturar nunca falla" apunta a lo segundo con aviso.
- [ ] Angular: enviar desde la barra, confirmación con deshacer, y recargar los datos afectados.
- [ ] **(decisión)** Zona horaria del usuario: hoy es la constante `Europe/Madrid`; valorar hacerla configurable.

## Fase 4 — Gastos y cuentas

Objetivo: importar el extracto del banco, categorizarlo y ver en qué se va el dinero. **Bloqueada por la muestra del CSV real.**

- [ ] **(bloqueo)** Cabecera y 3–4 líneas anonimizadas del CSV del banco: columnas, si hay saldo, si el importe va con signo o en cargo/abono separados.
- [ ] Parser del CSV: separador `;`, decimales con coma, fechas `dd/mm/yyyy`, codificación Windows-1252 (`TextDecoder('windows-1252')`), con tests sobre un fichero de ejemplo.
- [ ] `POST /api/accounts/:id/imports` (multipart, límite de 5 MB ya puesto en nginx): `prepareTransactions` → `insertMany({ ordered: false })`, contando como omitidas las violaciones del índice único (código 11000), y registro en `import_batches`.
- [ ] Deshacer una importación completa por `importBatchId`.
- [ ] `GET /api/transactions` con filtros por cuenta, mes, categoría y texto.
- [ ] Corrección manual de categoría (`categorySource: manual`, nunca se sobrescribe) con opción de crear una regla a partir de ella.
- [ ] Reaplicar las reglas a las transacciones sin categoría.
- [ ] CRUD de reglas y categorías.
- [ ] `GET /api/expenses/summary`: agregación por mes y categoría (`$group` sobre `{month, category}`).
- [ ] Angular: importación con vista previa, tabla de movimientos, gestión de reglas y gráficos.
- [ ] **(decisión)** Librería de gráficos (ECharts, Chart.js u otra), que depende del sistema de diseño de la fase 6.
- [ ] Cuentas: CRUD y saldo calculado (apertura + suma de movimientos) con resumen básico.
- [ ] **(decisión)** Qué hacer con los traspasos entre cuentas propias para que no cuenten como gasto ni ingreso.

## Fase 5 — Calendario

- [ ] `GET /api/calendar?from=&to=`: elementos con `dueDate` en el rango, de todas las listas.
- [ ] Angular: vista mensual y agenda, con acceso rápido a crear un evento o tarea en una fecha.
- [ ] Marcar tareas como hechas desde el calendario y resaltar las vencidas.
- [ ] **(decisión)** Eventos de varios días: hoy solo existe `dueDate` + `time`. Si hacen falta rangos, añadir `endDate`/`endTime` al esquema de `Item` y un índice.

## Fase 6 — Estética y sistema de tokens

Aplazada a propósito. Cuando se aborde:

- [ ] **(decisión)** Sistema de diseño con tokens. Candidatos: Angular Material M3 (tokens `--mat-sys-*`), Tailwind v4 (`@theme`) con Angular CDK, o CSS propio con variables y CDK sin estilos. Criterios: peso del bundle (hoy 70 kB transferidos), accesibilidad y que sirva como portfolio.
- [ ] Tokens de color, tipografía, espaciado y radio; tema claro/oscuro.
- [ ] Diseño adaptable a móvil: se usará desde varios dispositivos.
- [ ] Accesibilidad: foco visible, etiquetas, contraste, navegación por teclado.
- [ ] Política CSP en nginx, **cuando la UI esté cerrada** (Angular inyecta estilos y un manejador de carga que obligan a decidir `style-src` y `script-src`).

## Fase 7 — Puesta en producción y operación

- [ ] Crear en Mongo la base de datos `rayrecords` y su usuario `readWrite` (ver [deploy/README.md](../deploy/README.md)).
- [ ] `deploy/.env` en el servidor, red del Mongo existente y `docker login ghcr.io`.
- [ ] `tailscale serve --bg 8080` y comprobar HTTPS, cookie `Secure` y cabecera `X-Forwarded-Proto`.
- [ ] **(decisión)** Aplicar `wiredTigerCacheSizeGB 0.5` al Mongo compartido: afecta también al otro proyecto.
- [ ] Copias de seguridad: `mongodump` programado de la base `rayrecords`, con retención y una restauración de prueba.
- [ ] Rotación de logs de Docker (`json-file` con `max-size` y `max-file`) para no llenar el disco.
- [ ] Medir el consumo real de memoria con datos reales y ajustar `mem_limit`.
- [ ] Procedimiento de actualización y de vuelta atrás documentado y probado (`TAG=<sha>`).

## Opcionales

- [ ] **Passkeys** (WebAuthn con `@simplewebauthn`): colección `credentials` ya prevista; requiere HTTPS.
- [ ] **Demo pública para el portfolio**: build estática con un adaptador `ApiClient` en memoria y los datos del seeder, desplegada en GitHub Pages. Es posible porque las pantallas dependen de `ApiClient`, no de `HttpClient`.
- [ ] Exportar e importar todos los datos en JSON.
- [ ] ESLint con reglas de Angular y TypeScript.
- [ ] Tests E2E (Playwright) del flujo de captura y de importación.
- [ ] Dependabot o Renovate para las dependencias.
- [ ] PWA / atajo de captura en el móvil.

## Preguntas abiertas

| Pregunta                                                                                        | Quién   | Bloquea                                      |
| ----------------------------------------------------------------------------------------------- | ------- | -------------------------------------------- |
| Muestra anonimizada del CSV del banco                                                           | Usuario | Fase 4                                       |
| ¿El Mongo del servidor corre en un contenedor (otro compose o red) o está instalado en el host? | Usuario | Fase 7 (define si se usa el override de red) |
| ¿Se puede aplicar `wiredTigerCacheSizeGB 0.5` al Mongo compartido?                              | Usuario | Fase 7                                       |
| ¿Quieres la demo pública con datos mock?                                                        | Usuario | Opcional                                     |
| Sistema de diseño y librería de gráficos                                                        | Usuario | Fase 6 y gráficos de la fase 4               |
| Renovar el permiso `workflow` del token personal                                                | Usuario | Subir el CI                                  |

## Deuda técnica y riesgos conocidos

| Asunto                          | Detalle                                                                                                                                 | Cuándo                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Sin autenticación**           | Cualquiera con acceso a la red de la API lee y escribe todo. Por eso nginx solo escucha en `127.0.0.1`.                                 | Fase 2                        |
| Sin CI                          | El workflow existe pero no se ha podido subir.                                                                                          | Fase 2                        |
| Sin tests de integración        | Las rutas de la API solo se han probado a mano contra Mongo.                                                                            | Fase 2                        |
| Sin ESLint                      | Solo hay prettier y typecheck.                                                                                                          | Opcional                      |
| Sin CSP                         | Cabeceras de seguridad básicas en nginx, sin `Content-Security-Policy`.                                                                 | Fase 6                        |
| Zona horaria fija               | `Europe/Madrid` como constante en `shared`.                                                                                             | Fase 3                        |
| Moneda fija                     | Solo EUR en el parser y en la presentación.                                                                                             | Si hace falta                 |
| TypeScript en dos versiones     | `shared` y `api` usan TS 7; `web` usa TS 6 porque lo exige el compilador de Angular. El código de `shared` debe compilar con ambas.     | Revisar al actualizar Angular |
| El cliente no valida respuestas | Confía en los tipos de `shared`; el servidor sí valida y serializa. Decisión consciente para no enviar Zod al navegador (692 → 257 kB). | —                             |
| Mongo compartido                | Un fallo de memoria del otro proyecto puede afectar a este.                                                                             | Fase 7                        |
