# Plataforma Mesa de Ayuda – SENA · imagen del backend (contexto: raíz del repositorio)
FROM node:22-slim AS build
WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install
COPY backend/ ./
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./dist
COPY frontend/ /app/frontend/
ENV FRONTEND_DIR=../frontend
RUN mkdir -p /app/backend/uploads && chown -R node:node /app
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
