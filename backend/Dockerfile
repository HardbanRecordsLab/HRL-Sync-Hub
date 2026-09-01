# ─── HRL Sync API ───────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Install production deps against the lockfile
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Non-root
RUN addgroup -S app && adduser -S app -G app \
 && mkdir -p /app/uploads /app/logs && chown -R app:app /app
USER app

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/index.js"]
