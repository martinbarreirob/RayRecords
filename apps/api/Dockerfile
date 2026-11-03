# syntax=docker/dockerfile:1
# Se construye en CI con el contexto en la raíz del repo:
#   docker build -f apps/api/Dockerfile -t rayrecords-api .

FROM node:22-alpine AS build
RUN npm install -g pnpm@10.34.9
WORKDIR /repo

# Primero solo los manifiestos: la capa de dependencias se cachea mientras no cambien.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @rayrecords/api...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @rayrecords/api build \
 && pnpm --filter @rayrecords/api --prod deploy --legacy /out

# Imagen final: runtime de Node, dependencias de producción y el bundle. Nada de código fuente.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
