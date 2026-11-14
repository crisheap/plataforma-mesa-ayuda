/**
 * Pruebas de integración contra PostgreSQL real (migraciones + seed aplicados).
 * Recorren el flujo completo del caso con los cuatro roles, tal como lo describe el manual de instalación.
 *
 * Requisitos: base de datos vacía migrada y sembrada con ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD.
 * Ejecución:  npm run test:integracion   (la CI la ejecuta con un servicio de PostgreSQL)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

const PUERTO = 4010;
process.env.CORE_API_URL = `http://127.0.0.1:${PUERTO}`; // el asistente consulta los casos por HTTP
process.env.RUN_WORKER = "false";
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR ?? "uploads-integracion";

const ADMIN = process.env.ADMIN_EMAIL ?? "admin@mesaayuda.local";
const ADMIN_PASS = process.env.ADMIN_INITIAL_PASSWORD ?? "";
const NUEVA = "Integracion#2026ok";
const base = `http://127.0.0.1:${PUERTO}`;

let server: Server;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any;

type Resp = { status: number; json: any; headers: Headers };
async function llamar(metodo: string, ruta: string, token?: string, body?: unknown): Promise<Resp> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let cuerpo: BodyInit | undefined;
  if (body instanceof FormData) cuerpo = body;
  else if (body !== undefined) { headers["content-type"] = "application/json"; cuerpo = JSON.stringify(body); }
  const r = await fetch(base + ruta, { method: metodo, headers, body: cuerpo });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, json: tipo.includes("json") ? await r.json() : null, headers: r.headers };
}
const login = async (correo: string, password: string) => {
  const r = await llamar("POST", "/api/auth/login", undefined, { correo, password });
  assert.equal(r.status, 200, `login ${correo}: ${JSON.stringify(r.json)}`);
  return r.json.data as { token: string; usuario: { id: number; debeCambiarPassword: boolean; nombreCompleto: string } };
};
/** Primer ingreso: cambia la contraseña temporal y vuelve a entrar. */
async function activar(correo: string, temporal: string): Promise<string> {
  const s = await login(correo, temporal);
  assert.equal(s.usuario.debeCambiarPassword, true);
  const p = await llamar("PATCH", "/api/auth/password", s.token, { passwordActual: temporal, passwordNueva: NUEVA });
  assert.equal(p.status, 200, JSON.stringify(p.json));
  const s2 = await login(correo, NUEVA);
  assert.equal(s2.usuario.debeCambiarPassword, false);
  return s2.token;
}

const tokens: Record<string, string> = {};
const ids: Record<string, number> = {};
let casoId = 0;
let numeroCaso = "";

before(async () => {
  assert.ok(ADMIN_PASS, "Define ADMIN_INITIAL_PASSWORD (la misma usada en el seed)");
  ({ prisma } = await import("../src/config/prisma"));
  const app = (await import("../src/app")).default;
  await new Promise<void>((ok) => { server = app.listen(PUERTO, ok); });
});
after(async () => {
  server?.close();
  await prisma?.$disconnect();
});

test("health profundo confirma la conexión con PostgreSQL", async () => {
  const r = await llamar("GET", "/api/health?deep=1");
  assert.equal(r.status, 200);
  assert.equal(r.json.db, "ok");
});

test("el administrador inicial debe cambiar la contraseña antes de usar la API", async () => {
  const s = await login(ADMIN, ADMIN_PASS);
  assert.equal(s.usuario.debeCambiarPassword, true);
  assert.equal((await llamar("GET", "/api/usuarios", s.token)).status, 403);
  tokens.admin = await activar(ADMIN, ADMIN_PASS);
  assert.equal((await llamar("GET", "/api/usuarios", tokens.admin)).status, 200);
});

test("el administrador crea usuarios de cada rol con contraseña temporal", async () => {
  const personas = [
    ["usuario", "USUARIO", "Laura", "Pérez Gómez"], ["otro", "USUARIO", "Andrés", "Rojas"],
    ["tecnico", "TECNICO", "Carlos", "Martínez"], ["supervisor", "SUPERVISOR", "Diana", "López"],
  ] as const;
  for (const [clave, rol, nombre, apellido] of personas) {
    const correo = `${clave}@integracion.test`;
    const r = await llamar("POST", "/api/usuarios", tokens.admin, { nombre, apellido, correo, rol });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.ok(r.json.data.passwordTemporal, "debe devolver la contraseña temporal");
    ids[clave] = r.json.data.usuario.id;
    tokens[clave] = await activar(correo, r.json.data.passwordTemporal);
  }
});

test("el usuario registra un caso con número único y evidencia válida", async () => {
  const r = await llamar("POST", "/api/casos", tokens.usuario, {
    titulo: "No puedo entrar a la plataforma", descripcion: "Desde esta mañana el sistema rechaza mi contraseña.",
    tipo: "INCIDENTE", categoria: "PLATAFORMAS_INSTITUCIONALES",
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  casoId = r.json.data.id;
  numeroCaso = r.json.data.numeroCaso;
  assert.match(numeroCaso, /^CASO-\d{4}-\d{6}$/);
  assert.equal(r.json.data.estado, "ABIERTO");
  assert.equal(r.json.data.prioridad, "MEDIA");

  // PNG real de 1×1 píxel
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const fd = new FormData();
  fd.append("archivos", new Blob([png], { type: "image/png" }), "captura.png");
  const ev = await llamar("POST", `/api/casos/${casoId}/evidencias`, tokens.usuario, fd);
  assert.equal(ev.status, 201, JSON.stringify(ev.json));

  // Contenido que no coincide con el tipo declarado
  const falso = new FormData();
  falso.append("archivos", new Blob(["no soy una imagen"], { type: "image/png" }), "falso.png");
  assert.equal((await llamar("POST", `/api/casos/${casoId}/evidencias`, tokens.usuario, falso)).status, 400);
});

test("control de propiedad: otro usuario y un técnico no asignado no ven el caso", async () => {
  assert.equal((await llamar("GET", `/api/casos/${casoId}`, tokens.otro)).status, 404);
  assert.equal((await llamar("GET", `/api/casos/${casoId}`, tokens.tecnico)).status, 404);
  const mis = await llamar("GET", "/api/casos/mis-casos", tokens.otro);
  assert.equal(mis.json.data.total, 0);
});

test("el supervisor asigna técnico y prioridad", async () => {
  const tecnicos = await llamar("GET", "/api/usuarios/tecnicos", tokens.supervisor);
  assert.ok(tecnicos.json.data.some((t: { id: number }) => t.id === ids.tecnico));
  const r = await llamar("PATCH", `/api/casos/${casoId}/asignar`, tokens.supervisor, { tecnicoId: ids.tecnico, prioridad: "ALTA" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.data.estado, "ASIGNADO");
  assert.equal(r.json.data.prioridad, "ALTA");
  assert.ok(r.json.data.sla.venceEn, "el caso debe tener vencimiento de SLA");
});

test("el técnico atiende y resuelve; el usuario rechaza y luego confirma", async () => {
  const panel = await llamar("GET", "/api/casos/asignados", tokens.tecnico);
  assert.ok(panel.json.data.items.some((c: { id: number }) => c.id === casoId));

  assert.equal((await llamar("PATCH", `/api/casos/${casoId}/estado`, tokens.usuario, { estado: "EN_PROCESO" })).status, 403);
  assert.equal((await llamar("PATCH", `/api/casos/${casoId}/estado`, tokens.tecnico, { estado: "EN_PROCESO" })).status, 200);
  const nota = await llamar("POST", `/api/casos/${casoId}/observaciones`, tokens.tecnico, { contenido: "Se revisa el directorio activo", visibilidad: "INTERNA" });
  assert.equal(nota.status, 201);
  const resolver = { estado: "RESUELTO", solucion: "Se restableció la contraseña y se desbloqueó la cuenta." };
  assert.equal((await llamar("PATCH", `/api/casos/${casoId}/estado`, tokens.tecnico, resolver)).status, 200);

  const rechazo = await llamar("PATCH", `/api/casos/${casoId}/estado`, tokens.usuario, { estado: "EN_PROCESO", motivo: "Sigue sin funcionar" });
  assert.equal(rechazo.status, 200);
  assert.equal(rechazo.json.data.estado, "EN_PROCESO");
  assert.equal((await llamar("PATCH", `/api/casos/${casoId}/estado`, tokens.tecnico, resolver)).status, 200);

  // El usuario no ve las notas internas
  const detalle = await llamar("GET", `/api/casos/${casoId}`, tokens.usuario);
  assert.ok(detalle.json.data.observaciones.every((o: { visibilidad: string }) => o.visibilidad === "PUBLICA"));

  const cierre = await llamar("PATCH", `/api/casos/${casoId}/estado`, tokens.usuario, { estado: "CERRADO" });
  assert.equal(cierre.status, 200);
  assert.equal(cierre.json.data.estado, "CERRADO");
  const cal = await llamar("POST", `/api/casos/${casoId}/calificacion`, tokens.usuario, { puntuacion: 5, comentario: "Excelente" });
  assert.equal(cal.status, 201);
  assert.equal((await llamar("POST", `/api/casos/${casoId}/calificacion`, tokens.usuario, { puntuacion: 4 })).status, 409);
});

test("el historial registra cada transición y hay notificaciones para el usuario", async () => {
  const h = await llamar("GET", `/api/casos/${casoId}/historial`, tokens.usuario);
  const estados = h.json.data.map((x: { estadoNuevo: string }) => x.estadoNuevo);
  for (const e of ["ABIERTO", "ASIGNADO", "EN_PROCESO", "RESUELTO", "CERRADO"]) assert.ok(estados.includes(e), `falta ${e} en el historial`);
  const n = await llamar("GET", "/api/notificaciones", tokens.usuario);
  assert.equal(n.status, 200);
  assert.ok(n.json.data.items.length > 0);
});

test("reportes: KPIs y Excel para supervisor; prohibidos para el usuario", async () => {
  const k = await llamar("GET", "/api/reportes/kpis", tokens.supervisor);
  assert.equal(k.status, 200);
  const x = await fetch(`${base}/api/reportes/casos.xlsx`, { headers: { authorization: `Bearer ${tokens.supervisor}` } });
  assert.equal(x.status, 200);
  assert.match(x.headers.get("content-type") ?? "", /spreadsheetml/);
  assert.equal((await llamar("GET", "/api/reportes/kpis", tokens.usuario)).status, 403);
});

test("auditoría: registra las acciones y es inmutable en la base de datos", async () => {
  const a = await llamar("GET", "/api/auditoria?pageSize=100", tokens.supervisor);
  const acciones = a.json.data.items.map((i: { accion: string }) => i.accion);
  for (const acc of ["LOGIN", "USUARIO_CREADO", "CASO_CREADO", "CASO_ASIGNADO", "CASO_CERRAR"]) assert.ok(acciones.includes(acc), `falta ${acc}`);
  await assert.rejects(prisma.$executeRawUnsafe(`UPDATE "auditorias" SET "accion" = 'ALTERADA'`));
  await assert.rejects(prisma.$executeRawUnsafe(`DELETE FROM "auditorias"`));
});

test("bloqueo manual del administrador impide el ingreso y cierra la sesión", async () => {
  assert.equal((await llamar("PATCH", `/api/usuarios/${ids.otro}/estado`, tokens.admin, { estado: "BLOQUEADO" })).status, 200);
  assert.equal((await llamar("GET", "/api/casos/mis-casos", tokens.otro)).status, 401);
  assert.equal((await llamar("POST", "/api/auth/login", undefined, { correo: "otro@integracion.test", password: NUEVA })).status, 403);
  assert.equal((await llamar("PATCH", `/api/usuarios/${ids.otro}/estado`, tokens.admin, { estado: "ACTIVO" })).status, 200);
  await login("otro@integracion.test", NUEVA);
});

test("SLA: el administrador cambia tiempos y el supervisor solo puede consultarlos", async () => {
  const s = await llamar("GET", "/api/sla", tokens.supervisor);
  assert.equal(s.status, 200);
  assert.equal((await llamar("PUT", "/api/sla", tokens.supervisor, {})).status, 403);
});

test("asistente Botito: guía con la base de conocimiento y consulta solo casos propios", async () => {
  const c = await llamar("POST", "/api/asistente/conversaciones", tokens.usuario);
  assert.equal(c.status, 201);
  assert.match(c.json.data.saludo, /Laura/);
  const conv = c.json.data.conversacion.id;

  const guia = await llamar("POST", `/api/asistente/conversaciones/${conv}/mensajes`, tokens.usuario, { contenido: "No puedo iniciar sesión en el correo" });
  assert.equal(guia.status, 200, JSON.stringify(guia.json));
  assert.ok(guia.json.data.mensaje.contenido.length > 20);

  const estado = await llamar("POST", `/api/asistente/conversaciones/${conv}/mensajes`, tokens.usuario, { contenido: `¿Cómo va mi caso ${numeroCaso}?` });
  assert.match(estado.json.data.mensaje.contenido, new RegExp(numeroCaso));

  // Otro usuario no puede leer la conversación ni consultar el caso ajeno
  assert.equal((await llamar("GET", `/api/asistente/conversaciones/${conv}`, tokens.otro)).status, 404);
  const c2 = await llamar("POST", "/api/asistente/conversaciones", tokens.otro);
  const ajeno = await llamar("POST", `/api/asistente/conversaciones/${c2.json.data.conversacion.id}/mensajes`, tokens.otro, { contenido: `¿Cómo va el caso ${numeroCaso}?` });
  assert.doesNotMatch(ajeno.json.data.mensaje.contenido, /No puedo entrar a la plataforma/);
});

test("retención: borra solo las conversaciones de Botito sin actividad reciente y lo audita", async () => {
  const { purgarConversacionesAntiguas } = await import("../src/jobs/worker");
  const hace = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const vieja = await prisma.conversacionAsistente.create({
    data: { usuarioId: ids.usuario, createdAt: hace(400), mensajes: { create: [{ rol: "USUARIO", contenido: "hola", createdAt: hace(400) }] } },
  });
  const reactivada = await prisma.conversacionAsistente.create({
    data: { usuarioId: ids.usuario, createdAt: hace(400), mensajes: { create: [{ rol: "USUARIO", contenido: "sigo aquí", createdAt: hace(2) }] } },
  });
  const borradas = await purgarConversacionesAntiguas(180);
  assert.ok(borradas >= 1);
  assert.equal(await prisma.conversacionAsistente.findUnique({ where: { id: vieja.id } }), null);
  assert.equal(await prisma.mensajeAsistente.count({ where: { conversacionId: vieja.id } }), 0);
  assert.ok(await prisma.conversacionAsistente.findUnique({ where: { id: reactivada.id } }));
  assert.equal(await purgarConversacionesAntiguas(0), 0, "con 0 días la retención está desactivada");
  const a = await llamar("GET", "/api/auditoria?accion=RETENCION_ASISTENTE", tokens.supervisor);
  assert.ok(a.json.data.items.length >= 1);
});
