# API

Base: `/api`. En producción nginx enruta `/api/` hacia el contenedor `api` (puerto 3000) y sirve el frontend en el mismo origen. Los esquemas de entrada y salida viven en `packages/shared` y la API los usa para validar y serializar.

## Implementado

| Método | Ruta          | Respuesta                           | Notas                                                                                                                                                           |
| ------ | ------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/health` | `{ "status": "ok", "db": boolean }` | Liveness: devuelve 200 aunque Mongo esté caído (`db: false`), para que un fallo de la BD no impida que Docker arranque nginx. Es el healthcheck del contenedor. |
| `GET`  | `/api/lists`  | `List[]`                            | Listas no archivadas, ordenadas por `order`. Aún **sin autenticación**.                                                                                         |

## Propuesto (no implementado)

Diseño de referencia para las fases 2 a 5 del [ROADMAP](ROADMAP.md). Los nombres pueden cambiar al implementarlos.

### Autenticación (fase 2)

| Método | Ruta                   | Descripción                                                                     |
| ------ | ---------------------- | ------------------------------------------------------------------------------- |
| `POST` | `/api/auth/login`      | Usuario y contraseña → sesión en cookie `httpOnly`, `Secure`, `SameSite=Strict` |
| `POST` | `/api/auth/logout`     | Revoca la sesión                                                                |
| `GET`  | `/api/auth/me`         | Usuario actual (para el guard de Angular)                                       |
| —      | `/api/auth/passkeys/*` | Registro y acceso con WebAuthn (opcional, posterior)                            |

Todo `/api` exigirá sesión salvo `health` y `login`.

### Listas y elementos (fase 3)

| Método   | Ruta                   | Descripción                                           |
| -------- | ---------------------- | ----------------------------------------------------- |
| `POST`   | `/api/lists`           | Crear una lista, normalmente a partir de un preset    |
| `PATCH`  | `/api/lists/:id`       | Renombrar, cambiar campos, columnas o alias; archivar |
| `GET`    | `/api/lists/:id/items` | Elementos de la lista, con filtros por tag y texto    |
| `POST`   | `/api/items`           | Crear un elemento                                     |
| `PATCH`  | `/api/items/:id`       | Editar; incluye `done` y mover de columna / reordenar |
| `DELETE` | `/api/items/:id`       | Borrar                                                |

### Notas del día (fase 3)

| Método | Ruta                      | Descripción                                 |
| ------ | ------------------------- | ------------------------------------------- |
| `GET`  | `/api/notes/:date`        | Nota de una fecha (`YYYY-MM-DD`)            |
| `PUT`  | `/api/notes/:date`        | Crear o reemplazar el contenido             |
| `POST` | `/api/notes/:date/append` | Añadir una línea (lo usa la captura rápida) |

### Captura rápida (fase 3)

| Método | Ruta           | Descripción                                                                                                                                                                                                                                      |
| ------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/api/capture` | `{ "text": "peli: Dune #scifi" }`. Interpreta el texto **en el servidor** con `parseQuickCapture` y los alias de la BD, y crea el elemento o añade a la nota del día. Nunca falla por el contenido: lo que no reconoce acaba en la nota del día. |

### Calendario (fase 5)

| Método | Ruta                      | Descripción                                              |
| ------ | ------------------------- | -------------------------------------------------------- |
| `GET`  | `/api/calendar?from=&to=` | Elementos con `dueDate` en el rango, de todas las listas |

### Cuentas y gastos (fase 4)

| Método                              | Ruta                              | Descripción                                                                      |
| ----------------------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `GET` / `POST` / `PATCH`            | `/api/accounts`                   | Cuentas con su saldo calculado (`AccountSummary`)                                |
| `POST`                              | `/api/accounts/:id/imports`       | Subir el CSV del banco (multipart, máx. 5 MB) → `{ imported, skipped, batchId }` |
| `DELETE`                            | `/api/imports/:id`                | Deshacer una importación                                                         |
| `GET`                               | `/api/transactions`               | Filtros por cuenta, mes, categoría y texto                                       |
| `PATCH`                             | `/api/transactions/:id/category`  | Corrección manual (`SetTransactionCategory`); con `createRule` guarda una regla  |
| `GET`                               | `/api/expenses/summary?from=&to=` | `MonthlyCategoryTotal[]` para los gráficos                                       |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/rules`, `/api/categories`   | Gestión de reglas y categorías                                                   |
| `POST`                              | `/api/rules/apply`                | Reaplicar las reglas a las transacciones sin categoría                           |

## Convenciones

- Los identificadores viajan como cadena hexadecimal de 24 caracteres.
- Los importes van en céntimos enteros; los gastos, negativos.
- Las fechas de calendario van como `YYYY-MM-DD`; los instantes, en ISO 8601.
- Errores: formato uniforme por definir en la fase 2 (código, mensaje y detalles de validación). Ahora mismo los errores de validación son los que devuelve `fastify-type-provider-zod`.
