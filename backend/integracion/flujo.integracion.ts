/**
 * Pruebas de integración contra PostgreSQL real (migraciones + seed aplicados).
 * Recorren el flujo completo del caso con los cuatro roles, tal como lo describe el manual de instalación.
 *
 * Requisitos: base de datos vacía migrada y sembrada con ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD.
 * Ejecución:  npm run test:integracion   (la CI la ejecuta con un servicio de PostgreSQL)
 */
import { test, before, after } from "node:test";
import ExcelJS from "exceljs";
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
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    cuerpo = JSON.stringify(body);
  }
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
  await new Promise<void>((ok) => {
    server = app.listen(PUERTO, ok);
  });
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
  const me = await llamar("GET", "/api/auth/me", tokens.admin);
  assert.equal(me.json.data.esGeneral, true, "la cuenta inicial es el administrador general");
  assert.equal(me.json.data.centro, null);
  ids.admin = me.json.data.id;
});

test("el administrador general crea los centros (RF-CEN-01)", async () => {
  const a = await llamar("POST", "/api/centros", tokens.admin, { codigo: "integ", nombre: "Centro de Integración" });
  assert.equal(a.status, 201, JSON.stringify(a.json));
  assert.equal(a.json.data.codigo, "INTEG", "el código se guarda en mayúsculas");
  ids.centro = a.json.data.id;
  const b = await llamar("POST", "/api/centros", tokens.admin, { codigo: "OTRO", nombre: "Otro Centro de Formación" });
  assert.equal(b.status, 201);
  ids.otroCentro = b.json.data.id;
  assert.equal((await llamar("POST", "/api/centros", tokens.admin, { codigo: "INTEG", nombre: "Repetido" })).status, 409);
  assert.equal((await llamar("POST", "/api/centros", tokens.admin, { codigo: "1-X", nombre: "Código inválido" })).status, 400);
  const sinCentro = await llamar("POST", "/api/usuarios", tokens.admin, {
    nombre: "Sin",
    apellido: "Centro",
    correo: "sincentro@integracion.test",
    rol: "USUARIO",
  });
  assert.equal(sinCentro.status, 400, "el general debe elegir el centro");
  const caso = await llamar("POST", "/api/casos", tokens.admin, {
    titulo: "Caso del general",
    descripcion: "El administrador general no pertenece a un centro.",
    tipo: "INCIDENTE",
    categoria: "SOFTWARE",
  });
  assert.equal(caso.status, 400, "el general no registra casos");
});

test("el administrador crea usuarios de cada rol con contraseña temporal", async () => {
  const personas = [
    ["usuario", "USUARIO", "Laura", "Pérez Gómez"],
    ["otro", "USUARIO", "Andrés", "Rojas"],
    ["tecnico", "TECNICO", "Carlos", "Martínez"],
    ["supervisor", "SUPERVISOR", "Diana", "López"],
  ] as const;
  for (const [clave, rol, nombre, apellido] of personas) {
    const correo = `${clave}@integracion.test`;
    const r = await llamar("POST", "/api/usuarios", tokens.admin, { nombre, apellido, correo, rol, centroId: ids.centro });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.ok(r.json.data.passwordTemporal, "debe devolver la contraseña temporal");
    ids[clave] = r.json.data.usuario.id;
    tokens[clave] = await activar(correo, r.json.data.passwordTemporal);
  }
});

test("el usuario registra un caso con número único y evidencia válida", async () => {
  const r = await llamar("POST", "/api/casos", tokens.usuario, {
    titulo: "No puedo entrar a la plataforma",
    descripcion: "Desde esta mañana el sistema rechaza mi contraseña.",
    tipo: "INCIDENTE",
    categoria: "PLATAFORMAS_INSTITUCIONALES",
    telefonoContacto: "+57  300 123-4567",
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.data.telefonoContacto, "+57 300 123-4567", "se guarda normalizado");
  casoId = r.json.data.id;
  numeroCaso = r.json.data.numeroCaso;
  assert.match(numeroCaso, /^INTEG-\d{4}-000001$/, "número con el prefijo del centro");
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
  // El técnico asignado ve el número de contacto del solicitante (RF-CAS-14)
  const visto = await llamar("GET", `/api/casos/${casoId}`, tokens.tecnico);
  assert.equal(visto.status, 200);
  assert.equal(visto.json.data.telefonoContacto, "+57 300 123-4567");
});

test("el técnico atiende y resuelve; el usuario rechaza y luego confirma", async () => {
  const panel = await llamar("GET", "/api/casos/asignados", tokens.tecnico);
  assert.ok(panel.json.data.items.some((c: { id: number }) => c.id === casoId));

  assert.equal((await llamar("PATCH", `/api/casos/${casoId}/estado`, tokens.usuario, { estado: "EN_PROCESO" })).status, 403);
  assert.equal((await llamar("PATCH", `/api/casos/${casoId}/estado`, tokens.tecnico, { estado: "EN_PROCESO" })).status, 200);
  const nota = await llamar("POST", `/api/casos/${casoId}/observaciones`, tokens.tecnico, {
    contenido: "Se revisa el directorio activo",
    visibilidad: "INTERNA",
  });
  assert.equal(nota.status, 201);
  const resolver = { estado: "RESUELTO", solucion: "Se restableció la contraseña y se desbloqueó la cuenta." };
  assert.equal((await llamar("PATCH", `/api/casos/${casoId}/estado`, tokens.tecnico, resolver)).status, 200);

  const rechazo = await llamar("PATCH", `/api/casos/${casoId}/estado`, tokens.usuario, {
    estado: "EN_PROCESO",
    motivo: "Sigue sin funcionar",
  });
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
  for (const e of ["ABIERTO", "ASIGNADO", "EN_PROCESO", "RESUELTO", "CERRADO"])
    assert.ok(estados.includes(e), `falta ${e} en el historial`);
  const n = await llamar("GET", "/api/notificaciones", tokens.usuario);
  assert.equal(n.status, 200);
  assert.ok(n.json.data.items.length > 0);
});

test("reportes: KPIs y Excel para supervisor; prohibidos para el usuario", async () => {
  const k = await llamar("GET", "/api/reportes/kpis", tokens.supervisor);
  assert.equal(k.status, 200);
  const r = k.json.data.resumen;
  assert.equal(r.total, k.json.data.totalCasos);
  assert.equal(r.porRealizar + r.enProceso + r.realizados, r.total, "los grupos suman el total");
  assert.ok(r.realizados >= 1, "el caso cerrado cuenta como realizado");
  const t = k.json.data.tendencia;
  assert.equal(t.unidad, "day");
  assert.equal(t.puntos.length, 30);
  assert.ok(t.puntos.reduce((s: number, p: { creados: number }) => s + p.creados, 0) >= 1, "la tendencia incluye los casos de hoy");
  const porTec = k.json.data.porTecnico;
  for (const f of porTec) assert.equal(f.porRealizar + f.enProceso + f.realizados, f.casos);
  assert.equal(
    porTec.reduce((s: number, f: { casos: number }) => s + f.casos, 0),
    r.total,
    "técnicos + sin asignar = total",
  );
  const adm = await llamar("GET", "/api/reportes/kpis?prioridad=ALTA", tokens.admin);
  assert.equal(adm.status, 200);
  const x = await fetch(`${base}/api/reportes/casos.xlsx`, { headers: { authorization: `Bearer ${tokens.supervisor}` } });
  assert.equal(x.status, 200);
  assert.match(x.headers.get("content-type") ?? "", /spreadsheetml/);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(Buffer.from(await x.arrayBuffer()));
  assert.deepEqual(
    libro.worksheets.map((w) => w.name),
    ["Dashboard", "Casos", "Resumen"],
  );
  const hojaD = libro.getWorksheet("Dashboard")!;
  const valores = hojaD.getColumn(1).values.map(String);
  for (const k of ["Total de casos", "Por realizar (abiertos y asignados)", "En proceso", "Realizados (resueltos y cerrados)"])
    assert.ok(valores.includes(k), `falta ${k} en la hoja Dashboard`);
  assert.ok(libro.getWorksheet("Casos")!.getRow(1).values.toString().includes("Grupo"));
  assert.equal((await llamar("GET", "/api/reportes/kpis", tokens.usuario)).status, 403);
});

test("auditoría: registra las acciones y es inmutable en la base de datos", async () => {
  const a = await llamar("GET", "/api/auditoria?pageSize=100", tokens.supervisor);
  const acciones = a.json.data.items.map((i: { accion: string }) => i.accion);
  for (const acc of ["LOGIN", "USUARIO_CREADO", "CASO_CREADO", "CASO_ASIGNADO", "CASO_CERRAR"])
    assert.ok(acciones.includes(acc), `falta ${acc}`);
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

  const guia = await llamar("POST", `/api/asistente/conversaciones/${conv}/mensajes`, tokens.usuario, {
    contenido: "No puedo iniciar sesión en el correo",
  });
  assert.equal(guia.status, 200, JSON.stringify(guia.json));
  assert.ok(guia.json.data.mensaje.contenido.length > 20);

  const estado = await llamar("POST", `/api/asistente/conversaciones/${conv}/mensajes`, tokens.usuario, {
    contenido: `¿Cómo va mi caso ${numeroCaso}?`,
  });
  assert.match(estado.json.data.mensaje.contenido, new RegExp(numeroCaso));

  // Otro usuario no puede leer la conversación ni consultar el caso ajeno
  assert.equal((await llamar("GET", `/api/asistente/conversaciones/${conv}`, tokens.otro)).status, 404);
  const c2 = await llamar("POST", "/api/asistente/conversaciones", tokens.otro);
  const ajeno = await llamar("POST", `/api/asistente/conversaciones/${c2.json.data.conversacion.id}/mensajes`, tokens.otro, {
    contenido: `¿Cómo va el caso ${numeroCaso}?`,
  });
  assert.doesNotMatch(ajeno.json.data.mensaje.contenido, /No puedo entrar a la plataforma/);
});

test("retención: borra solo las conversaciones de Botito sin actividad reciente y lo audita", async () => {
  const { purgarConversacionesAntiguas } = await import("../src/jobs/worker");
  const hace = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const vieja = await prisma.conversacionAsistente.create({
    data: {
      usuarioId: ids.usuario,
      createdAt: hace(400),
      mensajes: { create: [{ rol: "USUARIO", contenido: "hola", createdAt: hace(400) }] },
    },
  });
  const reactivada = await prisma.conversacionAsistente.create({
    data: {
      usuarioId: ids.usuario,
      createdAt: hace(400),
      mensajes: { create: [{ rol: "USUARIO", contenido: "sigo aquí", createdAt: hace(2) }] },
    },
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

test("correos de acceso: dominios empresariales, correo personal y enlace de activación (RF-USU-09/10, RF-ADM-05)", async () => {
  // Configuración: el administrador define los dominios empresariales y reclasifica las cuentas
  const cfg = await llamar("PUT", "/api/configuracion/correo", tokens.admin, {
    dominiosEmpresariales: ["@Integracion.test"],
    reclasificar: true,
  });
  assert.equal(cfg.status, 200, JSON.stringify(cfg.json));
  assert.deepEqual(cfg.json.data.dominios, ["integracion.test"]);
  assert.equal((await llamar("PUT", "/api/configuracion/correo", tokens.admin, { dominiosEmpresariales: ["gmail.com"] })).status, 400);
  assert.equal((await llamar("GET", "/api/configuracion/correo", tokens.supervisor)).status, 403);
  const tecnico = await llamar("GET", `/api/usuarios/${ids.tecnico}`, tokens.admin);
  assert.equal(tecnico.json.data.tipoCorreo, "EMPRESARIAL");

  // Cuenta empresarial con correo personal: la bienvenida va al personal
  const nuevo = await llamar("POST", "/api/usuarios", tokens.admin, {
    nombre: "Sofía",
    apellido: "Gómez",
    correo: "sofia@integracion.test",
    rol: "USUARIO",
    centroId: ids.centro,
    correoPersonal: "Sofia.Gomez@Gmail.com",
    enviarAcceso: true,
  });
  assert.equal(nuevo.status, 201, JSON.stringify(nuevo.json));
  assert.equal(nuevo.json.data.usuario.tipoCorreo, "EMPRESARIAL");
  assert.equal(nuevo.json.data.usuario.correoPersonal, "sofia.gomez@gmail.com");
  assert.equal(nuevo.json.data.passwordTemporal, undefined, "ninguna contraseña viaja en la respuesta");
  const acceso = nuevo.json.data.acceso;
  assert.equal(acceso.enviadoA, "sofia.gomez@gmail.com");
  assert.ok(acceso.enlace, "sin SMTP, la respuesta incluye el enlace para pruebas");
  const token = new URL(acceso.enlace.replace("#/", "")).searchParams.get("token")!;
  assert.ok(token.length >= 40);

  // Cuenta con correo de acceso personal: no necesita otro correo
  const personal = await llamar("POST", "/api/usuarios", tokens.admin, {
    nombre: "Pedro",
    apellido: "Ruiz",
    correo: "pedro.ruiz@hotmail.com",
    rol: "USUARIO",
    centroId: ids.centro,
    correoPersonal: "otro@gmail.com",
    enviarAcceso: true,
  });
  assert.equal(personal.json.data.usuario.tipoCorreo, "PERSONAL");
  assert.equal(personal.json.data.usuario.correoPersonal, null);
  assert.equal(personal.json.data.acceso.enviadoA, "pedro.ruiz@hotmail.com");
  const repetido = await llamar("POST", "/api/usuarios", tokens.admin, {
    nombre: "Ana",
    apellido: "Mora",
    correo: "ana@integracion.test",
    rol: "USUARIO",
    centroId: ids.centro,
    correoPersonal: "ana@integracion.test",
  });
  assert.equal(repetido.status, 400, "el correo personal no puede repetir el de acceso");

  // Activación con el enlace
  const v = await llamar("POST", "/api/auth/acceso/verificar", undefined, { token });
  assert.equal(v.status, 200);
  assert.equal(v.json.data.correo, "sofia@integracion.test");
  assert.equal(v.json.data.motivo, "BIENVENIDA");
  assert.equal((await llamar("POST", "/api/auth/acceso/activar", undefined, { token, passwordNueva: "corta" })).status, 400);
  const act = await llamar("POST", "/api/auth/acceso/activar", undefined, { token, passwordNueva: "Bienvenida#2026" });
  assert.equal(act.status, 200, JSON.stringify(act.json));
  const sesion = await login("sofia@integracion.test", "Bienvenida#2026");
  assert.equal(sesion.usuario.debeCambiarPassword, false, "ya creó su propia contraseña");
  assert.equal(
    (await llamar("POST", "/api/auth/acceso/activar", undefined, { token, passwordNueva: "Otra#Clave2026" })).status,
    400,
    "un solo uso",
  );

  // Reenviar anula el enlace anterior; un enlace vencido no sirve
  const id = nuevo.json.data.usuario.id;
  const e1 = (await llamar("POST", `/api/usuarios/${id}/enviar-acceso`, tokens.admin)).json.data;
  const e2 = (await llamar("POST", `/api/usuarios/${id}/enviar-acceso`, tokens.admin)).json.data;
  const t1 = new URL(e1.enlace.replace("#/", "")).searchParams.get("token")!;
  const t2 = new URL(e2.enlace.replace("#/", "")).searchParams.get("token")!;
  assert.equal((await llamar("POST", "/api/auth/acceso/verificar", undefined, { token: t1 })).status, 400, "el anterior quedó anulado");
  const v2 = await llamar("POST", "/api/auth/acceso/verificar", undefined, { token: t2 });
  assert.equal(v2.json.data.motivo, "RESTABLECER", "ya había ingresado: el enlace es de restablecimiento");
  await prisma.tokenAcceso.updateMany({ where: { usuarioId: id, usadoEn: null }, data: { expiraEn: new Date(Date.now() - 1000) } });
  assert.equal((await llamar("POST", "/api/auth/acceso/verificar", undefined, { token: t2 })).status, 400, "vencido");

  // Edición del tipo y del correo personal
  const ed = await llamar("PATCH", `/api/usuarios/${ids.tecnico}`, tokens.admin, { correoPersonal: "carlos.martinez@gmail.com" });
  assert.equal(ed.json.data.correoPersonal, "carlos.martinez@gmail.com");
  const ed2 = await llamar("PATCH", `/api/usuarios/${ids.tecnico}`, tokens.admin, { tipoCorreo: "PERSONAL" });
  assert.equal(ed2.json.data.correoPersonal, null, "al pasar a personal se quita el correo adicional");

  const a = await llamar("GET", "/api/auditoria?pageSize=100", tokens.supervisor);
  const acciones = a.json.data.items.map((i: { accion: string }) => i.accion);
  for (const acc of ["CONFIG_CORREO", "ACCESO_ENVIADO", "CUENTA_ACTIVADA"]) assert.ok(acciones.includes(acc), `falta ${acc}`);
});

test("centros: cada centro es independiente y el general ve todo (RF-CEN-02/03/04)", async () => {
  // El general crea al administrador del otro centro
  const adm = await llamar("POST", "/api/usuarios", tokens.admin, {
    nombre: "Marta",
    apellido: "Suárez",
    correo: "admin.otro@integracion.test",
    rol: "ADMINISTRADOR",
    centroId: ids.otroCentro,
  });
  assert.equal(adm.status, 201, JSON.stringify(adm.json));
  assert.equal(adm.json.data.usuario.centro.codigo, "OTRO");
  ids.adminOtro = adm.json.data.usuario.id;
  tokens.adminOtro = await activar("admin.otro@integracion.test", adm.json.data.passwordTemporal);
  const me = await llamar("GET", "/api/auth/me", tokens.adminOtro);
  assert.equal(me.json.data.esGeneral, false);

  // El administrador de centro crea en su centro, aunque pida otro, y no crea administradores
  const u = await llamar("POST", "/api/usuarios", tokens.adminOtro, {
    nombre: "Julián",
    apellido: "Castro",
    correo: "usuario.otro@integracion.test",
    rol: "USUARIO",
    centroId: ids.centro,
  });
  assert.equal(u.status, 201, JSON.stringify(u.json));
  assert.equal(u.json.data.usuario.centro.id, ids.otroCentro, "queda en el centro de quien lo crea");
  ids.usuarioOtro = u.json.data.usuario.id;
  tokens.usuarioOtro = await activar("usuario.otro@integracion.test", u.json.data.passwordTemporal);
  const t = await llamar("POST", "/api/usuarios", tokens.adminOtro, {
    nombre: "Felipe",
    apellido: "Mejía",
    correo: "tecnico.otro@integracion.test",
    rol: "TECNICO",
  });
  assert.equal(t.status, 201);
  ids.tecnicoOtro = t.json.data.usuario.id;
  const otroAdmin = await llamar("POST", "/api/usuarios", tokens.adminOtro, {
    nombre: "No",
    apellido: "Permitido",
    correo: "no.admin@integracion.test",
    rol: "ADMINISTRADOR",
  });
  assert.equal(otroAdmin.status, 403, "solo el general crea administradores");

  // Usuarios: cada centro ve solo los suyos
  const lista = await llamar("GET", "/api/usuarios?pageSize=100", tokens.adminOtro);
  assert.ok(lista.json.data.items.length >= 3);
  for (const x of lista.json.data.items) assert.equal(x.centro?.id, ids.otroCentro, `${x.correo} no es de su centro`);
  assert.equal((await llamar("GET", `/api/usuarios/${ids.usuario}`, tokens.adminOtro)).status, 404);
  assert.equal((await llamar("PATCH", `/api/usuarios/${ids.usuario}/estado`, tokens.adminOtro, { estado: "BLOQUEADO" })).status, 404);
  assert.equal((await llamar("GET", `/api/usuarios/${ids.admin}`, tokens.adminOtro)).status, 404, "no ve al general");
  assert.equal(
    (await llamar("PATCH", `/api/usuarios/${ids.usuarioOtro}`, tokens.adminOtro, { centroId: ids.centro })).status,
    403,
    "solo el general cambia a alguien de centro",
  );
  const todos = await llamar("GET", "/api/usuarios?pageSize=100", tokens.admin);
  const centrosVistos = new Set(todos.json.data.items.map((x: { centro: { id: number } | null }) => x.centro?.id ?? null));
  assert.ok(centrosVistos.has(ids.centro) && centrosVistos.has(ids.otroCentro) && centrosVistos.has(null), "el general ve todos");
  const filtrada = await llamar("GET", `/api/usuarios?centroId=${ids.otroCentro}&pageSize=100`, tokens.admin);
  for (const x of filtrada.json.data.items) assert.equal(x.centro.id, ids.otroCentro);

  // Casos: numeración propia y sin cruces
  const c = await llamar("POST", "/api/casos", tokens.usuarioOtro, {
    titulo: "Impresora sin conexión",
    descripcion: "La impresora del ambiente 204 no aparece en la red.",
    tipo: "INCIDENTE",
    categoria: "HARDWARE",
  });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  assert.match(c.json.data.numeroCaso, /^OTRO-\d{4}-000001$/, "cada centro lleva su propio consecutivo");
  const casoOtro = c.json.data.id;
  const vistos = await llamar("GET", "/api/casos?pageSize=100", tokens.adminOtro);
  assert.deepEqual(
    vistos.json.data.items.map((x: { id: number }) => x.id),
    [casoOtro],
  );
  assert.equal((await llamar("GET", `/api/casos/${casoId}`, tokens.adminOtro)).status, 404);
  assert.equal((await llamar("GET", `/api/casos/${casoOtro}`, tokens.supervisor)).status, 404, "supervisor de otro centro");
  assert.equal(
    (await llamar("PATCH", `/api/casos/${casoOtro}/asignar`, tokens.supervisor, { tecnicoId: ids.tecnico })).status,
    404,
    "no asigna casos de otro centro",
  );
  assert.equal(
    (await llamar("PATCH", `/api/casos/${casoOtro}/asignar`, tokens.adminOtro, { tecnicoId: ids.tecnico })).status,
    400,
    "solo técnicos del mismo centro",
  );
  const asignado = await llamar("PATCH", `/api/casos/${casoOtro}/asignar`, tokens.adminOtro, { tecnicoId: ids.tecnicoOtro });
  assert.equal(asignado.status, 200, JSON.stringify(asignado.json));
  const tecs = await llamar("GET", "/api/usuarios/tecnicos", tokens.adminOtro);
  assert.deepEqual(
    tecs.json.data.map((x: { id: number }) => x.id),
    [ids.tecnicoOtro],
  );
  const generalVe = await llamar("GET", `/api/casos/${casoOtro}`, tokens.admin);
  assert.equal(generalVe.status, 200, "el general ve los casos de todos los centros");
  assert.equal(generalVe.json.data.centro.codigo, "OTRO");

  // Dashboard por centro y consolidado
  const kOtro = await llamar("GET", "/api/reportes/kpis", tokens.adminOtro);
  assert.equal(kOtro.json.data.resumen.total, 1);
  const kPedido = await llamar("GET", `/api/reportes/kpis?centroId=${ids.centro}`, tokens.adminOtro);
  assert.equal(kPedido.json.data.resumen.total, 1, "un centro no puede pedir los datos de otro");
  const kGeneral = await llamar("GET", "/api/reportes/kpis", tokens.admin);
  const codigos = kGeneral.json.data.porCentro.map((x: { codigo: string }) => x.codigo).sort();
  assert.deepEqual(codigos, ["INTEG", "OTRO"]);
  assert.equal(
    kGeneral.json.data.porCentro.reduce((a: number, x: { casos: number }) => a + x.casos, 0),
    kGeneral.json.data.resumen.total,
  );
  const kSoloOtro = await llamar("GET", `/api/reportes/kpis?centroId=${ids.otroCentro}`, tokens.admin);
  assert.equal(kSoloOtro.json.data.resumen.total, 1);

  // Lo común a la entidad lo cambia solo el general
  assert.equal((await llamar("PUT", "/api/sla", tokens.adminOtro, { configuraciones: [] })).status, 403);
  assert.equal((await llamar("GET", "/api/configuracion/correo", tokens.adminOtro)).status, 200, "consulta los dominios");
  assert.equal(
    (await llamar("PUT", "/api/configuracion/correo", tokens.adminOtro, { dominiosEmpresariales: ["otro.test"] })).status,
    403,
    "solo el general los cambia",
  );
  assert.equal((await llamar("POST", "/api/centros", tokens.adminOtro, { codigo: "NUEVO", nombre: "No permitido" })).status, 403);
  const centros = await llamar("GET", "/api/centros", tokens.adminOtro);
  assert.deepEqual(
    centros.json.data.map((x: { codigo: string }) => x.codigo),
    ["OTRO"],
  );
  const centrosGeneral = await llamar("GET", "/api/centros", tokens.admin);
  const integ = centrosGeneral.json.data.find((x: { codigo: string }) => x.codigo === "INTEG");
  assert.ok(integ.usuarios >= 4 && integ.casos >= 1);

  // Auditoría: el centro solo ve las acciones de su personal
  const aud = await llamar("GET", "/api/auditoria?pageSize=100", tokens.adminOtro);
  const autores = new Set(aud.json.data.items.map((x: { usuarioId: number | null }) => x.usuarioId));
  for (const id of [ids.usuario, ids.supervisor, ids.admin]) assert.ok(!autores.has(id), `ve acciones de ${id}`);

  // Un centro inactivo no recibe usuarios ni casos nuevos
  assert.equal((await llamar("PATCH", `/api/centros/${ids.otroCentro}`, tokens.admin, { activo: false })).status, 200);
  const inactivo = await llamar("POST", "/api/casos", tokens.usuarioOtro, {
    titulo: "Otro caso",
    descripcion: "El centro está inactivo y no debe recibirlo.",
    tipo: "INCIDENTE",
    categoria: "HARDWARE",
  });
  assert.equal(inactivo.status, 400);
  await llamar("PATCH", `/api/centros/${ids.otroCentro}`, tokens.admin, { activo: true });
});
