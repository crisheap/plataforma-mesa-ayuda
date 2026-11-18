-- RF-USU-11: un correo identifica a una sola persona en todo el sistema.
-- 1) Limpia los correos personales que ya usaba otra cuenta (se conserva en la más antigua)
--    o que coinciden con el correo de acceso de otra persona.
UPDATE "usuarios" u
SET "correoPersonal" = NULL
WHERE u."correoPersonal" IS NOT NULL
  AND (
    EXISTS (SELECT 1 FROM "usuarios" o WHERE o."correoPersonal" = u."correoPersonal" AND o."id" < u."id")
    OR EXISTS (SELECT 1 FROM "usuarios" o WHERE o."correo" = u."correoPersonal" AND o."id" <> u."id")
  );

-- 2) El correo personal no se repite entre cuentas.
CREATE UNIQUE INDEX "usuarios_correoPersonal_key" ON "usuarios"("correoPersonal");
