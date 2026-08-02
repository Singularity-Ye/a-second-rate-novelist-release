FROM node:22-alpine

RUN npm install -g tsx

WORKDIR /app

COPY tools/preview/preview-gateway.ts tools/preview/preview-gateway.ts

EXPOSE 3300

CMD ["tsx", "tools/preview/preview-gateway.ts", "--port", "3300"]
