import { type Request, Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth.middleware";
import { rateLimit } from "../../middlewares/rateLimit.middleware";
import { validar } from "../../utils/validate";
import * as svc from "./auth.service";
import { activarAcceso, verificarAcceso } from "../../core/acceso";
import { politicaDatos } from "../../core/datos";
import { emitirDesafio, verificarCaptcha } from "../../core/captcha";
import { registrarEvento } from "../../core/seguridad";

const router = Router();

/**
 * Límites de intentos (RNF-04, RF-SEG-03). Cuentan solo las respuestas FALLIDAS: en un centro del SENA
 * cientos de personas salen por la misma IP pública, y sus ingresos correctos no deben bloquearse entre sí.
 * - por cuenta e IP: frena a quien prueba contraseñas de una persona;
 * - por IP: frena a quien prueba muchas cuentas desde un mismo lugar.
 */
const alExceder = (req: Request, clave: string) =>
  registrarEvento({
    tipo: "LIMITE_EXCEDIDO",
    severidad: "ADVERTENCIA",
    descripcion: `Demasiados intentos fallidos en ${req.path}`,
    ip: req.ip,
    correo: clave.includes("|") ? clave.split("|")[1] : null,
  });
const mensajeLimite = "Demasiados intentos fallidos. Espera unos minutos";
const limiteCuenta = rateLimit({
  ventanaMs: 15 * 60_000,
  max: 10,
  soloFallidos: true,
  clave: (req) => `${req.ip}|${String(req.body?.correo ?? "").trim().toLowerCase().slice(0, 150)}`,
  mensaje: mensajeLimite,
  alExceder,
});
const limiteIp = rateLimit({ ventanaMs: 15 * 60_000, max: 100, soloFallidos: true, mensaje: mensajeLimite, alExceder });
const limiteLogin = [limiteIp, limiteCuenta];
const limiteToken = rateLimit({ ventanaMs: 15 * 60_000, max: 60, soloFallidos: true, mensaje: mensajeLimite, alExceder });

const captchaSchema = z
  .object({ desafio: z.string().max(200), firma: z.string().max(100), nonce: z.string().max(20) })
  .optional();
/** Verifica el captcha y registra el intento fallido (RF-SEG-01). */
function exigirCaptcha(req: Request, captcha: z.infer<typeof captchaSchema>) {
  try {
    verificarCaptcha(captcha);
  } catch (e) {
    registrarEvento({
      tipo: "CAPTCHA_INVALIDO",
      severidad: "ADVERTENCIA",
      descripcion: `${(e as Error).message} (${req.path})`,
      ip: req.ip,
      correo: typeof req.body?.correo === "string" ? req.body.correo.slice(0, 150) : null,
    });
    throw e;
  }
}

const loginSchema = z.object({
  correo: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(1, "La contraseña es obligatoria").max(200),
  captcha: captchaSchema,
});
const passwordSchema = z.object({ passwordActual: z.string().min(1), passwordNueva: z.string().min(1).max(200) });
const temaSchema = z.object({ preferenciaTema: z.enum(["CLARO", "OSCURO", "SISTEMA"]) });
const refreshSchema = z.object({ refreshToken: z.string().min(20) });
const tokenAcceso = z.string().trim().min(20, "Enlace inválido").max(100, "Enlace inválido");
const verificarSchema = z.object({ token: tokenAcceso });
const activarSchema = z.object({
  token: tokenAcceso,
  passwordNueva: z.string().min(1, "Escribe la contraseña").max(200),
  captcha: captchaSchema,
});

// Desafío del captcha (RF-SEG-01): público; su dificultad depende de los fallos recientes de la IP.
router.get("/captcha", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ success: true, data: emitirDesafio(req.ip) });
});

router.post("/login", ...limiteLogin, async (req, res) => {
  const { correo, password, captcha } = validar(loginSchema, req.body);
  exigirCaptcha(req, captcha);
  const data = await svc.login(correo, password, req.ip);
  res.json({ success: true, message: "Inicio de sesión exitoso", data });
});

router.post("/refresh", limiteToken, async (req, res) => {
  const { refreshToken } = validar(refreshSchema, req.body);
  res.json({ success: true, data: await svc.refrescar(refreshToken) });
});

// Enlace de acceso (RF-USU-10): rutas públicas, con el mismo límite de intentos que el login.
router.post("/acceso/verificar", limiteToken, async (req, res) => {
  const { token } = validar(verificarSchema, req.body);
  res.json({ success: true, data: await verificarAcceso(token) });
});

router.post("/acceso/activar", limiteToken, async (req, res) => {
  const { token, passwordNueva, captcha } = validar(activarSchema, req.body);
  exigirCaptcha(req, captcha);
  const r = await activarAcceso(token, passwordNueva, req.ip);
  res.json({ success: true, message: "Contraseña creada. Ya puedes iniciar sesión", data: r });
});

router.post("/logout", async (req, res) => {
  await svc.cerrarSesion(typeof req.body?.refreshToken === "string" ? req.body.refreshToken : undefined);
  res.json({ success: true, message: "Sesión cerrada" });
});

// Política de tratamiento de datos personales (RF-DAT-01): pública, para leerla antes de ingresar.
router.get("/politica-datos", (_req, res) => {
  res.json({ success: true, data: politicaDatos() });
});

const autorizarSchema = z.object({
  acepto: z.literal(true, { error: "Debes marcar la casilla de autorización" }),
  version: z.string().trim().min(1).max(20),
});
router.post("/autorizacion-datos", authenticate, async (req, res) => {
  const { version } = validar(autorizarSchema, req.body);
  const data = await svc.autorizarDatos(req.user!.userId, version, req.ip);
  res.json({ success: true, message: "Autorización registrada", data });
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
