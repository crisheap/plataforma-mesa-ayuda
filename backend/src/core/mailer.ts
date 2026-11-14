import { env } from "../config/env";

interface Transporte {
  sendMail(o: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}
let transporte: Transporte | null | undefined;

async function obtenerTransporte(): Promise<Transporte | null> {
  if (transporte !== undefined) return transporte;
  if (!env.smtp.host) {
    transporte = null;
    return null;
  }
  try {
    const modulo = "nodemailer"; // dependencia opcional: npm install nodemailer
    const nm = (await import(modulo)) as { createTransport(o: unknown): Transporte };
    transporte = nm.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  } catch {
    console.warn("[correo] nodemailer no está instalado; se usará el modo consola");
    transporte = null;
  }
  return transporte;
}

/** Envía un correo; sin SMTP configurado lo escribe en consola (desarrollo). */
export async function enviarCorreo(a: string, asunto: string, texto: string): Promise<void> {
  const t = await obtenerTransporte();
  if (!t) {
    console.log(`[correo:consola] Para: ${a} | Asunto: ${asunto}\n${texto}\n`);
    return;
  }
  await t.sendMail({ from: env.smtp.from, to: a, subject: asunto, text: texto });
}
