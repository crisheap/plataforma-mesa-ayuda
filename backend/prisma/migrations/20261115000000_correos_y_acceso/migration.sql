-- RF-USU-09, RF-USU-10, RF-ADM-05: tipo de correo, correo personal, enlaces de acceso y configuración.

CREATE TYPE "TipoCorreo" AS ENUM ('EMPRESARIAL', 'PERSONAL');
CREATE TYPE "MotivoAcceso" AS ENUM ('BIENVENIDA', 'RESTABLECER');

ALTER TABLE "usuarios"
  ADD COLUMN "tipoCorreo" "TipoCorreo" NOT NULL DEFAULT 'EMPRESARIAL',
  ADD COLUMN "correoPersonal" VARCHAR(150);

-- Clasifica las cuentas existentes: los proveedores públicos conocidos son correos personales.
UPDATE "usuarios" SET "tipoCorreo" = 'PERSONAL'
WHERE lower(split_part("correo", '@', 2)) IN (
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'live.com.co',
  'msn.com', 'yahoo.com', 'yahoo.es', 'yahoo.com.co', 'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me', 'gmx.com', 'zoho.com'
);

CREATE TABLE "tokens_acceso" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "motivo" "MotivoAcceso" NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_acceso_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tokens_acceso_tokenHash_key" ON "tokens_acceso"("tokenHash");
CREATE INDEX "tokens_acceso_usuarioId_idx" ON "tokens_acceso"("usuarioId");
ALTER TABLE "tokens_acceso" ADD CONSTRAINT "tokens_acceso_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "configuracion_sistema" (
    "clave" VARCHAR(60) NOT NULL,
    "valor" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_sistema_pkey" PRIMARY KEY ("clave")
);
