-- Migración v2.0: PWA, asistente IA, notificaciones, auditoría inmutable, refresh tokens, contador de casos.

-- CreateEnum
CREATE TYPE "TemaPreferido" AS ENUM ('CLARO', 'OSCURO', 'SISTEMA');
CREATE TYPE "VisibilidadObservacion" AS ENUM ('PUBLICA', 'INTERNA');
CREATE TYPE "RolMensaje" AS ENUM ('USUARIO', 'ASISTENTE');

-- AlterTable usuarios
ALTER TABLE "usuarios" ADD COLUMN "preferenciaTema" "TemaPreferido" NOT NULL DEFAULT 'SISTEMA',
ADD COLUMN "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable casos
ALTER TABLE "casos" ADD COLUMN "slaVenceEn" TIMESTAMP(3),
ADD COLUMN "slaAlertado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable evidencias
ALTER TABLE "evidencias" ADD COLUMN "usuarioId" INTEGER;

-- AlterTable observaciones
ALTER TABLE "observaciones" ADD COLUMN "visibilidad" "VisibilidadObservacion" NOT NULL DEFAULT 'PUBLICA';

-- AlterTable notificaciones
ALTER TABLE "notificaciones" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN "casoId" INTEGER,
ADD COLUMN "correoPendiente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "correoEnviadoAt" TIMESTAMP(3),
ADD COLUMN "correoIntentos" INTEGER NOT NULL DEFAULT 0;

-- AlterTable auditorias
ALTER TABLE "auditorias" ALTER COLUMN "usuarioId" DROP NOT NULL,
ADD COLUMN "datos" JSONB;

-- CreateTable refresh_tokens
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable contadores_caso
CREATE TABLE "contadores_caso" (
    "anio" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contadores_caso_pkey" PRIMARY KEY ("anio")
);

-- CreateTable suscripciones_push
CREATE TABLE "suscripciones_push" (
    "id" SERIAL NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "suscripciones_push_pkey" PRIMARY KEY ("id")
);

-- CreateTable conversaciones_asistente
CREATE TABLE "conversaciones_asistente" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT,
    "escaladaACaso" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER NOT NULL,
    "casoId" INTEGER,

    CONSTRAINT "conversaciones_asistente_pkey" PRIMARY KEY ("id")
);

-- CreateTable mensajes_asistente
CREATE TABLE "mensajes_asistente" (
    "id" SERIAL NOT NULL,
    "rol" "RolMensaje" NOT NULL,
    "contenido" TEXT NOT NULL,
    "util" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversacionId" INTEGER NOT NULL,

    CONSTRAINT "mensajes_asistente_pkey" PRIMARY KEY ("id")
);

-- CreateTable articulos_conocimiento
CREATE TABLE "articulos_conocimiento" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "palabrasClave" TEXT[],
    "categoria" "CategoriaCaso",
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articulos_conocimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
CREATE INDEX "refresh_tokens_usuarioId_idx" ON "refresh_tokens"("usuarioId");
CREATE UNIQUE INDEX "suscripciones_push_endpoint_key" ON "suscripciones_push"("endpoint");
CREATE INDEX "casos_estado_idx" ON "casos"("estado");
CREATE INDEX "casos_usuarioId_idx" ON "casos"("usuarioId");
CREATE INDEX "casos_tecnicoId_idx" ON "casos"("tecnicoId");
CREATE INDEX "notificaciones_usuarioId_leida_idx" ON "notificaciones"("usuarioId", "leida");
CREATE INDEX "notificaciones_correoPendiente_idx" ON "notificaciones"("correoPendiente");
CREATE INDEX "auditorias_createdAt_idx" ON "auditorias"("createdAt");
CREATE INDEX "conversaciones_asistente_usuarioId_idx" ON "conversaciones_asistente"("usuarioId");
CREATE INDEX "mensajes_asistente_conversacionId_idx" ON "mensajes_asistente"("conversacionId");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "suscripciones_push" ADD CONSTRAINT "suscripciones_push_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversaciones_asistente" ADD CONSTRAINT "conversaciones_asistente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversaciones_asistente" ADD CONSTRAINT "conversaciones_asistente_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "casos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mensajes_asistente" ADD CONSTRAINT "mensajes_asistente_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "conversaciones_asistente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La FK de auditorias.usuarioId pasa de RESTRICT a SET NULL (el usuario puede ser nulo)
ALTER TABLE "auditorias" DROP CONSTRAINT "auditorias_usuarioId_fkey";
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Contador inicial a partir de los casos existentes (por año de creación)
INSERT INTO "contadores_caso" ("anio", "ultimo")
SELECT EXTRACT(YEAR FROM "fechaCreacion")::INTEGER, COUNT(*)::INTEGER
FROM "casos" GROUP BY 1
ON CONFLICT ("anio") DO NOTHING;

-- Bitácora inmutable: no se permite UPDATE ni DELETE sobre auditorias (RF-ADM-04)
CREATE OR REPLACE FUNCTION auditorias_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora de auditoría es inmutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auditorias_no_update_delete
BEFORE UPDATE OR DELETE ON "auditorias"
FOR EACH ROW EXECUTE FUNCTION auditorias_inmutable();
