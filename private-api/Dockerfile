FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY private-api ./private-api
COPY worker/lib ./worker/lib
USER node
EXPOSE 8080
CMD ["node", "private-api/serve.mjs"]
