-- Autorización para el tratamiento de datos personales (RF-DAT-01).
-- Fecha y versión de la política aceptada; la auditoría guarda además la IP como prueba.
ALTER TABLE "usuarios" ADD COLUMN "datosAutorizadosEn" TIMESTAMP(3);
ALTER TABLE "usuarios" ADD COLUMN "datosVersion" VARCHAR(20);
