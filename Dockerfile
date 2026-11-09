# ---------- build frontendu ----------
FROM node:24-alpine AS client
WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---------- runtime: jeden proces Node serwuje API + statyczny front ----------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/gwiazdka.db \
    STATIC_DIR=/app/public
WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/src ./src
COPY --from=client /app/dist ./public

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "src/index.js"]
