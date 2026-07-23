# node:sqlite (used for all storage) needs Node 24+ to run without an experimental flag.
FROM node:24-alpine

WORKDIR /app

# Install curl for the container healthcheck.
RUN apk add --no-cache curl

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# xpt-pdf.js is the same dependency-free PDF writer the browser extension uses —
# vendored here so downloaded invoices are byte-for-byte identical to the extension's.
COPY src/xpt-pdf.js ./src/xpt-pdf.js
COPY server ./server

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV PORT=4100
ENV DATA_DIR=/app/data
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:4100/healthz || exit 1

WORKDIR /app/server
CMD ["node", "index.js"]
