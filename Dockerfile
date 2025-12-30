FROM oven/bun:latest AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lockb* /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS prerelease
COPY --from=install /temp/prod/node_modules node_modules
COPY . .

FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/src src
COPY --from=prerelease /usr/src/app/package.json package.json

RUN mkdir -p /usr/src/app/data \
  && chown -R bun:bun /usr/src/app

USER bun

ENTRYPOINT ["bun"]
CMD ["run", "src/server.ts"]
