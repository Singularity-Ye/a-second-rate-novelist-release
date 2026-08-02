FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

ARG DEBIAN_MIRROR_URL=http://deb.debian.org

RUN sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR_URL}|g" /etc/apt/sources.list.d/debian.sources \
  && apt-get -o Acquire::Retries=4 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update \
  && apt-get -o Acquire::Retries=4 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm build:backend

EXPOSE 4000

CMD ["node", "apps/backend/dist/main.js"]
