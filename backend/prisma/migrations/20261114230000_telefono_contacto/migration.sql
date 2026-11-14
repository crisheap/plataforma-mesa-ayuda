-- RF-CAS-14: número de contacto opcional del solicitante, para que el técnico pueda comunicarse.
ALTER TABLE "casos" ADD COLUMN "telefonoContacto" VARCHAR(20);
