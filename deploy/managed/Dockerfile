FROM caddy:2.11.9 AS proxy
FROM node:24.22.2-bookworm-slim
RUN npm install --global pnpm@11.28.5
COPY --from=proxy /usr/bin/caddy /usr/bin/caddy
WORKDIR /opt/always-on
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && node scripts/build-managed.mjs && npm pack --ignore-scripts && npm pack ./packages/managed --ignore-scripts
ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data/caddy DSH_HOME=/data/harness ALWAYS_ON_DATA_DIR=/data/agent ALWAYS_ON_GATEWAY_DATA_DIR=/data/gateway ALWAYS_ON_DOCUMENTS_DIR=/data/documents
RUN mkdir -p /data /config && chown -R node:node /data /config /opt/always-on
USER node
VOLUME ["/data", "/config"]
EXPOSE 8443
ENTRYPOINT ["node", "deploy/managed/start.mjs"]
