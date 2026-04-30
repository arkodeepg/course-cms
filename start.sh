#!/bin/sh
set -e

export PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

echo "Running database schema push..."
node /app/node_modules/prisma/build/index.js db push --schema=/app/prisma/schema.prisma --skip-generate --accept-data-loss

echo "Starting server on port 3004..."
exec node server.js
