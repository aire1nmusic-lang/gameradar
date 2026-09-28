FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl --fail --silent --show-error https://storage.yandexcloud.net/cloud-certs/CA.pem -o /app/yandex-ca.pem \
    && chmod 644 /app/yandex-ca.pem \
    && rm -rf /var/lib/apt/lists/*
ENV PG_CA_FILE=/app/yandex-ca.pem
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY private-api ./private-api
COPY worker/lib ./worker/lib
USER node
EXPOSE 8080
CMD ["node", "private-api/serve.mjs"]
