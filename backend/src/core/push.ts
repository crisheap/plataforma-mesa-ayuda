import { env } from "../config/env";
import { prisma } from "../config/prisma";

interface WebPush {
  setVapidDetails(s: string, pub: string, priv: string): void;
  sendNotification(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string): Promise<unknown>;
}
let lib: WebPush | null | undefined;

async function cargar(): Promise<WebPush | null> {
  if (lib !== undefined) return lib;
  if (!env.vapid.publica || !env.vapid.privada) return (lib = null);
  try {
    const nombre = "web-push"; // dependencia opcional: npm install web-push
    const m = (await import(nombre)) as { default?: WebPush } & WebPush;
    lib = m.default ?? m;
    lib.setVapidDetails(env.vapid.asunto, env.vapid.publica, env.vapid.privada);
  } catch {
    console.warn("[push] web-push no está instalado; las notificaciones push están desactivadas");
    lib = null;
  }
  return lib;
}

export const pushDisponible = () => Boolean(env.vapid.publica && env.vapid.privada);

export async function enviarPush(usuarioId: number, payload: { titulo: string; mensaje: string; url?: string }) {
  const wp = await cargar();
  if (!wp) return;
  const subs = await prisma.suscripcionPush.findMany({ where: { usuarioId } });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await prisma.suscripcionPush.deleteMany({ where: { id: s.id } });
      }
    }),
  );
}
