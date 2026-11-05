# syntax=docker/dockerfile:1
# Built in CI with the build context at the repo root:
#   docker build -f apps/api/Dockerfile -t rayrecords-api .

FROM node:22-alpine AS build
RUN npm install -g pnpm@10.34.9
WORKDIR /repo

# Manifests first: the dependency layer stays cached until they change.
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

# Final image: Node runtime, production dependencies and the bundle. No source code.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
