# RayRecords

Aplicación web personal de gestión: notas del día, listas (incluido tablero Kanban), calendario, gastos y cuentas. Un solo usuario, desplegada con Docker en mi propio servidor y accesible únicamente desde mis dispositivos a través de Tailscale.

> **Estado: fase 1 (esqueleto).** La arquitectura, los contratos compartidos, el parser de captura rápida, el despliegue y el seeder están listos. Los módulos funcionales y la autenticación están por implementar: **hasta entonces la API no tiene login y no debe exponerse fuera de `localhost`.**

## Estructura

```
rayrecords/
├─ apps/
│  ├─ web/        Angular (standalone, signals, zoneless). Una carpeta por módulo en src/app/features
│  └─ api/        Fastify + driver nativo de MongoDB. Un plugin por módulo en src/modules
├─ packages/
│  └─ shared/     Esquemas Zod, tipos, presets de lista y parser de captura rápida (TypeScript puro)
├─ deploy/        docker-compose de producción y de desarrollo, nginx, guía de despliegue
└─ docs/          Arquitectura, esquema de colecciones y decisiones
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

## Qué hay y qué falta

|           |                                                                                                                                                                                                                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hecho     | Monorepo pnpm · esquemas Zod de todas las colecciones · parser de captura rápida con tests · índices de MongoDB · hash de deduplicación y categorización de gastos · seeder · Docker Compose con límites de memoria · nginx · CI que construye las imágenes · shell de Angular con navegación, captura rápida con vista previa y pantallas esqueleto |
| Siguiente | Autenticación (sesión persistente) · CRUD de listas, elementos y notas · captura rápida conectada a la API · importación del CSV del banco · calendario · gráficos de gastos · cuentas · passkeys · estética y tokens de diseño                                                                                                                      |

## Documentación

- [Arquitectura, colecciones y decisiones](docs/ARQUITECTURA.md)
- [Despliegue en el servidor](deploy/README.md)
