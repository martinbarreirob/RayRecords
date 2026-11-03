# syntax=docker/dockerfile:1
# Se construye en CI con el contexto en la raíz del repo. El servidor nunca compila Angular:
# solo descarga esta imagen, que es nginx con los estáticos ya generados.
#   docker build -f apps/web/Dockerfile -t rayrecords-web .

FROM node:22-alpine AS build
ENV NG_CLI_ANALYTICS=false
RUN npm install -g pnpm@10.34.9
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @rayrecords/web...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @rayrecords/web build

FROM nginx:stable-alpine
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 80
