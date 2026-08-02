FROM node:22-bookworm-slim

ARG APP_NAME
ARG NEXT_PUBLIC_API_BASE_URL
ARG PORT=3000

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV APP_NAME=$APP_NAME
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV PORT=$PORT

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter "${APP_NAME}..." build

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter \"$APP_NAME\" exec next start --hostname 0.0.0.0 --port \"$PORT\""]
