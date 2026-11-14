FROM node:24.22.2-bookworm-slim
WORKDIR /opt/always-on
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN mkdir -p /data && chown -R node:node /data /opt/always-on
USER node
VOLUME ["/data"]
EXPOSE 4080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4080/health',{headers:{host:process.env.ALWAYS_ON_PUBLIC_HOST,'x-forwarded-proto':'https'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "dist/control/main.js"]
