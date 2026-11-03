# Arquitectura

## Visión general

```
Dispositivo (tailnet) ──HTTPS──► tailscale serve ──► nginx ──► api (Fastify) ──► MongoDB (BD propia)
                                                      │
                                                      └─ estáticos de Angular (compilados en CI)
```

- **Mismo origen.** nginx sirve el frontend y hace proxy de `/api`: sin CORS y con cookie `SameSite=Strict`.
- **Monolito modular.** Cada módulo de la API (`health`, `lists`, y los que vengan) es un plugin de Fastify con sus rutas, su mapper y su acceso a datos. Un módulo nuevo es una carpeta nueva.
- **Contratos compartidos.** `packages/shared` define los esquemas Zod, de los que salen los tipos TypeScript. La API valida entradas y serializa salidas con ellos; Angular importa los tipos y el parser. Se consume como código fuente, sin paso de build previo.
- **Compilación fuera del servidor.** CI construye dos imágenes (`rayrecords-api`, `rayrecords-web`) y las publica en GHCR. El servidor solo hace `docker compose pull && up -d`.

## Convenciones de datos

| Tema                     | Decisión                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Dinero                   | Céntimos enteros (`amountCents`). Nunca floats. Gastos negativos, ingresos positivos.                                                         |
| Fechas de calendario     | Cadena `YYYY-MM-DD` (`dueDate`, `date` de la nota del día). Evita desfases de zona horaria.                                                   |
| Instantes                | `Date` en Mongo, ISO 8601 en la API.                                                                                                          |
| Fecha de una transacción | `Date` a medianoche UTC más `month` (`YYYY-MM`) desnormalizado para agrupar.                                                                  |
| Identificadores          | `ObjectId` en Mongo, cadena hexadecimal de 24 caracteres en la API. La categoría usa su clave como `_id`.                                     |
| Campo `extra`            | Solo escalares planos con claves `[a-z][a-zA-Z0-9_]*`: sin objetos anidados ni claves con `$`, para no abrir la puerta a operadores de Mongo. |
| Enlaces                  | Solo `http(s)`, para que un `javascript:` no llegue nunca a un `href`.                                                                        |

## Colecciones e índices

| Colección              | Contenido                                                                                                                                                                          | Índices                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `lists`                | Contenedor autodescriptivo: `name`, `slug`, `kind` (plantilla de origen), `captureAlias`, `fieldDefs[]`, `board.columns[]`, `order`, `archived`                                    | `slug` único · `captureAlias` único **parcial** (solo listas con alias) · `{archived, order}`                                         |
| `items`                | `listId`, `title`, `text`, `tags[]`, `dueDate`, `time`, `url`, `extra{}`, `column`, `order`, `doneAt`, `source`                                                                    | `{listId, order}` · `{listId, createdAt:-1}` · `tags` (multikey) · `dueDate` **parcial** (calendario) · texto `title+text` en español |
| `daily_notes`          | Una nota markdown por fecha                                                                                                                                                        | `date` único                                                                                                                          |
| `accounts`             | `name`, `bank`, `type`, `currency`, `openingBalanceCents`, `openingDate`, `archived`. **El saldo no se guarda**: es apertura + suma de movimientos                                 | `{archived, name}`                                                                                                                    |
| `transactions`         | `accountId`, `date`, `month`, `amountCents`, `description`, `descriptionNorm`, `balanceAfterCents`, `hash`, `category`, `categorySource` (`rule`/`manual`/`none`), `importBatchId` | **`{accountId, hash}` único** (deduplicación) · `{accountId, date:-1}` · `{month, category}` (gráficos) · `importBatchId` parcial     |
| `categories`           | `_id` = clave, `name`, `color`, `icon`                                                                                                                                             | —                                                                                                                                     |
| `categorization_rules` | `pattern`, `matchType` (`contains`/`startsWith`/`regex`), `categoryKey`, `priority`, `active`                                                                                      | `{active, priority:-1}`                                                                                                               |
| `import_batches`       | Traza de cada importación (`fileName`, `imported`, `skipped`) para poder deshacerla                                                                                                | `createdAt:-1`                                                                                                                        |

Pendientes con la autenticación: `users`, `sessions` (índice TTL sobre `expiresAt`) y `credentials` (passkeys).

Los índices los crea `ensureIndexes` en cada arranque de la API (idempotente). Con un solo usuario no compensa un sistema de migraciones.

## Decisiones y alternativas descartadas

| Decisión                                                                                                 | Descartado                               | Motivo                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| pnpm workspaces                                                                                          | Nx, Turborepo                            | Con tres paquetes serían sobreingeniería.                                                                       |
| Fastify + Zod                                                                                            | Express                                  | Validación por esquema nativa, menos memoria, mejor tipado.                                                     |
| Driver nativo de MongoDB                                                                                 | Mongoose                                 | El campo `extra` sin esquema y las agregaciones encajan mejor sin ODM; ahorra memoria.                          |
| Listas autodescriptivas: cada una guarda sus `fieldDefs`; los presets son datos que se copian al crearla | Un `type` fijo con código por tipo       | Crear un tipo de lista nuevo es crear datos, no código. Cada lista define su propio alias de captura.           |
| Calendario como vista sobre `items` con `dueDate`                                                        | Colección `events` aparte                | Menos código y un solo modelo.                                                                                  |
| Hash `sha256(cuenta, fecha, importe, descripción normalizada, saldo, nº de repetición)`                  | Hash sin nº de repetición                | Dos cafés iguales el mismo día no se pierden, y un extracto solapado produce los mismos hashes.                 |
| Corrección manual con `categorySource: manual` que las reglas nunca sobrescriben                         | Recategorizar siempre                    | Respeta las correcciones del usuario.                                                                           |
| Agregaciones al vuelo (`$group` por mes y categoría)                                                     | Vistas materializadas                    | Serán unos miles de transacciones al año.                                                                       |
| Sesión en cookie (`httpOnly`, `Secure`, `SameSite=Strict`) guardada en Mongo, passkeys después           | JWT                                      | Se puede revocar y no hay tokens en el cliente.                                                                 |
| `tailscale serve` + nginx en `127.0.0.1`                                                                 | Abrir un puerto público con lista de IPs | Las passkeys y las cookies `Secure` exigen HTTPS, y así no hay nada expuesto a internet.                        |
| El cliente confía en los tipos de `shared` y no valida respuestas con Zod                                | Validar en el cliente                    | Zod añadía ~435 kB al bundle inicial (692 → 257 kB). El servidor ya valida y serializa con los mismos esquemas. |
| `ApiClient` abstracto entre las pantallas y los datos                                                    | `HttpClient` directo en cada pantalla    | Permite una build de demo con un adaptador en memoria, sin backend.                                             |

## Captura rápida

El parser (`packages/shared/src/capture`) es una función pura: recibe el texto, la hora de referencia, la zona horaria y los alias de las listas, y devuelve un resultado tipado. No lanza nunca por el contenido.

| Entrada                                            | Resultado                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| `peli: Dune #scifi`                                | Elemento en la lista con alias `peli`, tag `scifi`                     |
| `compra: Cafetera @hogar 89€ https://tienda.com/p` | Elemento con categoría `hogar`, precio 8900 céntimos y enlace          |
| `hoy: llamar al dentista` / `mañana: …`            | Elemento en `tarea` con `dueDate` de hoy o mañana (zona Europe/Madrid) |
| Sin prefijo                                        | Línea en la nota del día                                               |
| Prefijo desconocido (`idea: …`)                    | Nota del día con el texto íntegro, sin fallar                          |
| `peli:` sin título, o entrada en blanco            | Nada que guardar (`empty`)                                             |

Reglas y casos límite cubiertos por los tests:

- Prefijo insensible a mayúsculas y acentos (`Mañana:`, `manana:`), con espacios alrededor de los dos puntos y tolerante al texto Unicode descompuesto.
- Un prefijo es una palabra corta: `https://…`, `10:30 llamar` o una frase larga antes de los dos puntos **no** se interpretan como prefijo.
- Tags en minúsculas y sin duplicados; `#1`, `C#` y `#fragmento` dentro de una URL no son tags.
- Importes `89€`, `89,50€`, `€89`, `89 eur`, `1.299,99€`. Solo se reconocen con símbolo de euro: `Dune 2` no es un precio.
- Solo cuenta la primera categoría, el primer importe y el primer enlace; el resto queda en el título. Un email no es una categoría.
- En las tareas con fecha no se interpretan `@categoría` ni importes: son texto normal.
- Los alias de lista se pasan por parámetro (los `captureAlias` de las listas), no están fijos en el código.
- La fecha se calcula en la zona horaria indicada, cruzando cambio de hora, fin de mes, fin de año y año bisiesto.

## Siguiente fase

1. Autenticación: usuario único, argon2, sesión persistente, `users`/`sessions` con TTL. Passkeys como mejora posterior.
2. CRUD de listas, elementos y notas, y captura rápida conectada a la API.
3. Importación del CSV del banco (`;`, decimales con coma, `dd/mm/yyyy`, Windows-1252), apoyada en `prepareTransactions`, que ya hace hash y categorización. Falta una muestra del fichero real para fijar las columnas.
4. Calendario, gráficos de gastos y cuentas.
5. Estética: sistema de tokens de diseño.
