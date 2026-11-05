# syntax=docker/dockerfile:1
# Built in CI with the build context at the repo root. The server never compiles Angular: it only
# pulls this image, which is nginx with the static files already built.
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

# Put the hashes of the inline scripts of index.html into the Content-Security-Policy.
COPY deploy/nginx deploy/nginx
RUN node deploy/nginx/build-conf.mjs

FROM nginx:stable-alpine
COPY --from=build /tmp/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 80
