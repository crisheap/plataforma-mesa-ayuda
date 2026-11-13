import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth.middleware";
import { rateLimit } from "../../middlewares/rateLimit.middleware";
import { validar } from "../../utils/validate";
import * as svc from "./auth.service";

const router = Router();

const limiteLogin = rateLimit({
  ventanaMs: 15 * 60_000,
  max: 30,
  mensaje: "Demasiados intentos de inicio de sesión. Espera unos minutos",
});

const loginSchema = z.object({
  correo: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(1, "La contraseña es obligatoria").max(200),
});
const passwordSchema = z.object({ passwordActual: z.string().min(1), passwordNueva: z.string().min(1).max(200) });
const temaSchema = z.object({ preferenciaTema: z.enum(["CLARO", "OSCURO", "SISTEMA"]) });
const refreshSchema = z.object({ refreshToken: z.string().min(20) });

router.post("/login", limiteLogin, async (req, res) => {
  const { correo, password } = validar(loginSchema, req.body);
  const data = await svc.login(correo, password, req.ip);
  res.json({ success: true, message: "Inicio de sesión exitoso", data });
});

router.post("/refresh", limiteLogin, async (req, res) => {
  const { refreshToken } = validar(refreshSchema, req.body);
  res.json({ success: true, data: await svc.refrescar(refreshToken) });
});

router.post("/logout", async (req, res) => {
  await svc.cerrarSesion(typeof req.body?.refreshToken === "string" ? req.body.refreshToken : undefined);
  res.json({ success: true, message: "Sesión cerrada" });
});

router.get("/me", authenticate, async (req, res) => {
  res.json({ success: true, data: await svc.perfil(req.user!.userId) });
});

router.patch("/password", authenticate, async (req, res) => {
  const b = validar(passwordSchema, req.body);
  await svc.cambiarPasswordPropia(req.user!.userId, b.passwordActual, b.passwordNueva);
  res.json({ success: true, message: "Contraseña actualizada. Inicia sesión nuevamente" });
});

router.patch("/tema", authenticate, async (req, res) => {
  const { preferenciaTema } = validar(temaSchema, req.body);
  res.json({ success: true, data: await svc.actualizarTema(req.user!.userId, preferenciaTema) });
});

export default router;
