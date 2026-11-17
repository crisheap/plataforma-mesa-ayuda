-- Centros de formación (RF-CEN-01 a RF-CEN-04).
-- Cada centro tiene sus propios usuarios, técnicos, supervisores y casos.
-- El administrador general es la única cuenta sin centro.

-- CreateTable
CREATE TABLE "centros" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "centros_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "centros_codigo_key" ON "centros"("codigo");

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "centroId" INTEGER;
ALTER TABLE "casos" ADD COLUMN "centroId" INTEGER;

-- Datos existentes: el primer administrador queda como administrador general; todo lo demás
-- pasa a un centro «MIGRADO» para reasignarlo (o reinicia la base con npm run db:reiniciar).
DO $$
DECLARE
  general_id INTEGER;
  migrado_id INTEGER;
BEGIN
  SELECT u."id" INTO general_id
    FROM "usuarios" u JOIN "roles" r ON r."id" = u."rolId"
    WHERE r."nombre" = 'ADMINISTRADOR' ORDER BY u."id" LIMIT 1;
  IF EXISTS (SELECT 1 FROM "casos") OR EXISTS (SELECT 1 FROM "usuarios" WHERE "id" IS DISTINCT FROM general_id) THEN
    INSERT INTO "centros" ("codigo", "nombre", "updatedAt")
      VALUES ('MIGRADO', 'Centro migrado (reasignar)', CURRENT_TIMESTAMP)
      RETURNING "id" INTO migrado_id;
    UPDATE "usuarios" SET "centroId" = migrado_id WHERE "id" IS DISTINCT FROM general_id;
    UPDATE "casos" SET "centroId" = migrado_id;
  END IF;
END $$;

ALTER TABLE "casos" ALTER COLUMN "centroId" SET NOT NULL;

CREATE INDEX "usuarios_centroId_idx" ON "usuarios"("centroId");
CREATE INDEX "casos_centroId_idx" ON "casos"("centroId");
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_centroId_fkey"
  FOREIGN KEY ("centroId") REFERENCES "centros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "casos" ADD CONSTRAINT "casos_centroId_fkey"
  FOREIGN KEY ("centroId") REFERENCES "centros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Consecutivo por centro y año: CEET-2026-000001. Los números ya emitidos (CASO-…) no cambian.
DROP TABLE "contadores_caso";
CREATE TABLE "contadores_caso" (
    "centroId" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contadores_caso_pkey" PRIMARY KEY ("centroId", "anio")
);
ALTER TABLE "contadores_caso" ADD CONSTRAINT "contadores_caso_centroId_fkey"
  FOREIGN KEY ("centroId") REFERENCES "centros"("id") ON DELETE CASCADE ON UPDATE CASCADE;
