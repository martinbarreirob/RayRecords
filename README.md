# RayRecords

Aplicación web personal de gestión: notas del día, listas (incluido tablero Kanban), calendario, gastos y cuentas. Un solo usuario, desplegada con Docker en mi propio servidor y accesible únicamente desde mis dispositivos a través de Tailscale.

> **Estado: fase 1 completada (esqueleto).** La arquitectura, los contratos compartidos, el parser de captura rápida, el despliegue y el seeder están listos y probados. Los módulos funcionales y la autenticación están por implementar: **hasta que exista login la API no debe exponerse fuera de `localhost`.** El detalle de lo hecho y lo pendiente está en el [roadmap](docs/ROADMAP.md).

## Estructura

```
RayRecords/
├─ apps/
│  ├─ web/        Angular (standalone, signals, sin zone.js). Una carpeta por módulo en src/app/features
│  └─ api/        Fastify + driver nativo de MongoDB. Un plugin por módulo en src/modules
├─ packages/
│  └─ shared/     Esquemas Zod, tipos, presets de lista y parser de captura rápida (TypeScript puro)
├─ deploy/        docker-compose de producción y de desarrollo, nginx, guía de despliegue
└─ docs/          Roadmap, arquitectura, guía de desarrollo y API
```

## Empezar

Requisitos: Node ≥ 22.12, pnpm 10 y Docker.

```bash
pnpm install
pnpm dev:db      # MongoDB en Docker (límite de 1 GB y wiredTigerCacheSizeGB 0.5, como en producción)
pnpm seed        # datos de ejemplo en la base rayrecords_dev
pnpm dev:api     # API en http://localhost:3000
pnpm dev:web     # Angular en http://localhost:4200 (proxy de /api hacia la API)
```

Otros comandos: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm format`.

## Qué hay hoy

- **Hecho:** monorepo pnpm, esquemas de todas las colecciones, parser de captura rápida (90 tests), índices de MongoDB, hash de deduplicación y categorización de gastos, seeder, Docker Compose con límites de memoria, nginx, y un shell de Angular con navegación, captura rápida con vista previa y pantallas esqueleto.
- **Siguiente:** autenticación, CRUD de listas, elementos y notas con la captura conectada, importación del CSV del banco, calendario, gráficos de gastos, estética y puesta en producción.
- **Sin probar todavía:** CI en GitHub (el workflow no está subido), el servidor real y Tailscale.

## Documentación

| Documento                                    | Contenido                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | Qué está hecho, fases pendientes con tareas, preguntas abiertas y deuda técnica              |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Visión general, colecciones e índices, decisiones y alternativas descartadas, captura rápida |
| [docs/DESARROLLO.md](docs/DESARROLLO.md)     | Versiones, comandos, estructura del código, cómo extenderlo, problemas conocidos             |
| [docs/API.md](docs/API.md)                   | Endpoints implementados y diseño de los previstos                                            |
| [deploy/README.md](deploy/README.md)         | Despliegue en el servidor: memoria, Mongo, Tailscale, actualizaciones                        |
