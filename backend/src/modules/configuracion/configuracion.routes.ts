/**
 * Configuración del sistema editable por el administrador.
 * Correo (RF-ADM-05): dominios empresariales que definen el tipo de correo de las cuentas.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeRoles, soloGeneral } from "../../middlewares/role.middleware";
import { auditar } from "../../core/audit";
import { validar } from "../../utils/validate";
import { env } from "../../config/env";
import { DOMINIO_VALIDO, PROVEEDORES_PERSONALES, dominiosEmpresariales, guardarDominiosEmpresariales } from "../../core/correos";

const router = Router();
// Los administradores de centro consultan los dominios (para clasificar correos); solo el general los cambia.
router.use(authenticate, authorizeRoles("ADMINISTRADOR"));

const correoSchema = z.object({
  dominiosEmpresariales: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .transform((d) => d.replace(/^@/, ""))
        .refine((d) => DOMINIO_VALIDO.test(d), "Dominio inválido (ejemplo: sena.edu.co)")
        .refine((d) => !PROVEEDORES_PERSONALES.includes(d), "Ese es un proveedor de correo personal"),
    )
    .max(50),
  reclasificar: z.boolean().optional(),
});

router.get("/correo", async (_req, res) => {
  res.json({
    success: true,
    data: {
      dominiosEmpresariales: await dominiosEmpresariales(),
      proveedoresPersonales: PROVEEDORES_PERSONALES,
      smtpConfigurado: env.smtpConfigurado,
      appUrl: env.appUrl,
      vigenciaEnlaceHoras: env.accesoVigenciaHoras,
    },
  });
});

router.put("/correo", soloGeneral, async (req, res) => {
  const d = validar(correoSchema, req.body);
  const r = await guardarDominiosEmpresariales(d.dominiosEmpresariales, d.reclasificar ?? false);
  await auditar(req, {
    accion: "CONFIG_CORREO",
    entidad: "configuracion",
    descripcion: `Dominios: ${r.dominios.join(", ") || "(ninguno)"}`,
    datos: r,
  });
  res.json({
    success: true,
    message: d.reclasificar
      ? `Configuración guardada. ${r.reclasificados} cuenta(s) cambiaron de tipo de correo`
      : "Configuración guardada",
    data: r,
  });
});

export default router;
