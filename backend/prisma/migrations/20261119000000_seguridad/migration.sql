-- Eventos de seguridad (RF-SEG-02 a RF-SEG-05).
CREATE TYPE "SeveridadSeguridad" AS ENUM ('INFO', 'ADVERTENCIA', 'CRITICA');

CREATE TABLE "eventos_seguridad" (
    "id" SERIAL NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "severidad" "SeveridadSeguridad" NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "ip" VARCHAR(64),
    "correo" VARCHAR(150),
    "usuarioId" INTEGER,
    "centroId" INTEGER,
    "datos" JSONB,
    "veces" INTEGER NOT NULL DEFAULT 1,
    "ultimoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendido" BOOLEAN NOT NULL DEFAULT false,
    "atendidoPor" INTEGER,
    "atendidoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_seguridad_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "eventos_seguridad_createdAt_idx" ON "eventos_seguridad"("createdAt");
CREATE INDEX "eventos_seguridad_centroId_createdAt_idx" ON "eventos_seguridad"("centroId", "createdAt");
CREATE INDEX "eventos_seguridad_severidad_atendido_idx" ON "eventos_seguridad"("severidad", "atendido");
