# Plataforma Mesa de Ayuda – SENA · imagen del backend (contexto: raíz del repositorio)
FROM node:26-slim AS build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY backend/ ./
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npm run build

FROM node:26-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi && npm cache clean --force
COPY --from=build /app/backend/dist ./dist
COPY frontend/ /app/frontend/
ENV FRONTEND_DIR=../frontend
# Protección del código (RF-SEG-04): huella de cada archivo y código de solo lectura para el proceso.
# El usuario sin privilegios "node" solo puede escribir en uploads/; el código y el manifiesto son de root.
RUN node dist/scripts/integridad.js && mkdir -p /app/backend/uploads && chown -R node:node /app/backend/uploads
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
