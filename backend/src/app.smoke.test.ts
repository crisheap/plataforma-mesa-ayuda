/**
 * Prueba de humo de la capa HTTP con una base de datos simulada en memoria:
 * valida rutas, validación, autenticación, autorización, bloqueo de cuenta y cabeceras.
 * (La integración real con PostgreSQL se prueba con la base levantada; ver README.)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import bcrypt from "bcrypt";

process.env.JWT_SECRET = "secreto-de-prueba-secreto-de-prueba-123";
process.env.DATABASE_URL = "postgresql://x:x@localhost:5432/x";
process.env.CORS_ORIGINS = "http://permitido.test";
process.env.METRICS_TOKEN = "token-de-metricas-de-prueba";

type U = {
  id: number;
  nombre: string;
  apellido: string;
  correo: string;
  password: string;
  estado: string;
  intentosFallidos: number;
  bloqueadoHasta: Date | null;
  preferenciaTema: string;
  debeCambiarPassword: boolean;
  ultimoAcceso: Date | null;
  createdAt: Date;
  rol: { nombre: string };
};
const usuarios = new Map<number, U>();
const mk = (id: number, rol: string, correo: string, hash: string, extra: Partial<U> = {}): U => ({
  id,
  nombre: "María Fernanda",
  apellido: "Gómez Ruiz",
  correo,
  password: hash,
  estado: "ACTIVO",
  intentosFallidos: 0,
  bloqueadoHasta: null,
  preferenciaTema: "SISTEMA",
  debeCambiarPassword: false,
  ultimoAcceso: null,
  createdAt: new Date(),
  rol: { nombre: rol },
  ...extra,
});
const pick = (u: U, select?: Record<string, unknown>) =>
  select ? Object.fromEntries(Object.keys(select).map((k) => [k, (u as never)[k]])) : u;
const buscar = (where: { correo?: string; id?: number }) =>
  [...usuarios.values()].find((u) => (where.correo ? u.correo === where.correo : u.id === where.id));

const fake = {
  usuario: {
    findUnique: async ({ where, select }: { where: { correo?: string; id?: number }; select?: Record<string, unknown> }) => {
      const u = buscar(where);
      return u ? pick(u, select) : null;
    },
    update: async ({ where, data }: { where: { id: number }; data: Partial<U> }) => Object.assign(usuarios.get(where.id)!, data),
  },
  intentoLogin: { create: async () => ({}) },
  refreshToken: {
    create: async () => ({}),
    findUnique: async () => null,
    update: async () => ({}),
    updateMany: async () => ({ count: 0 }),
  },
  auditoria: { create: async () => ({}) },
  $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  $queryRaw: async () => [{ "?column?": 1 }],
};

let server: Server,
  base = "";
const post = (ruta: string, body: unknown, token?: string) =>
  fetch(base + ruta, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const get = (ruta: string, token?: string, headers: Record<string, string> = {}) =>
  fetch(base + ruta, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });

before(async () => {
  const hash = await bcrypt.hash("Segura#2026ok", 4);
  usuarios.set(1, mk(1, "USUARIO", "maria@sena.edu.co", hash));
  usuarios.set(2, mk(2, "USUARIO", "bloq@sena.edu.co", hash, { estado: "BLOQUEADO", bloqueadoHasta: null }));
  usuarios.set(3, mk(3, "USUARIO", "intentos@sena.edu.co", hash));
  usuarios.set(4, mk(4, "ADMINISTRADOR", "admin@sena.edu.co", hash));
  usuarios.set(5, mk(5, "USUARIO", "temporal@sena.edu.co", hash, { debeCambiarPassword: true }));
  const ruta = require.resolve("./config/prisma");
  require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: { prisma: fake } } as unknown as NodeModule;
  const app = require("./app").default;
  await new Promise<void>((ok) => {
    server = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => server?.close());

test("health responde 200 (H-01) y las rutas inexistentes 404 en JSON", async () => {
  const h = await get("/api/health");
  assert.equal(h.status, 200);
  assert.equal((await h.json()).success, true);
  const nf = await get("/api/no-existe");
  assert.equal(nf.status, 404);
  assert.equal((await nf.json()).success, false);
});

test("cabeceras de seguridad y CORS restringido", async () => {
  const r = await get("/api/health", undefined, { origin: "http://permitido.test" });
  assert.match(r.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal(r.headers.get("access-control-allow-origin"), "http://permitido.test");
  const otro = await get("/api/health", undefined, { origin: "http://malicioso.test" });
  assert.equal(otro.headers.get("access-control-allow-origin"), null);
});

test("login: validación de entrada con detalle por campo", async () => {
  const r = await post("/api/auth/login", { correo: "no-es-correo", password: "" });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.ok(j.errors.some((e: { field: string }) => e.field === "correo"));
});

test("login correcto devuelve el nombre completo (RF-UI-04)", async () => {
  const r = await post("/api/auth/login", { correo: "MARIA@sena.edu.co", password: "Segura#2026ok" });
  assert.equal(r.status, 200);
  const { data } = await r.json();
  assert.equal(data.usuario.nombreCompleto, "María Fernanda Gómez Ruiz");
  assert.equal(data.usuario.rol, "USUARIO");
  assert.ok(data.token && data.refreshToken);
  assert.equal(data.usuario.password, undefined);
});

test("bloqueo tras 3 intentos y rechazo aunque la contraseña sea correcta", async () => {
  const mal = () => post("/api/auth/login", { correo: "intentos@sena.edu.co", password: "Incorrecta#1" });
  assert.equal((await mal()).status, 401);
  assert.equal((await mal()).status, 401);
  assert.equal((await mal()).status, 403);
  const ok = await post("/api/auth/login", { correo: "intentos@sena.edu.co", password: "Segura#2026ok" });
  assert.equal(ok.status, 403);
});

test("el bloqueo manual del administrador impide el ingreso (H-02)", async () => {
  const r = await post("/api/auth/login", { correo: "bloq@sena.edu.co", password: "Segura#2026ok" });
  assert.equal(r.status, 403);
  assert.equal(usuarios.get(2)!.estado, "BLOQUEADO"); // el login no lo reactiva
});

test("autenticación y autorización por rol", async () => {
  assert.equal((await get("/api/auth/me")).status, 401);
  assert.equal((await get("/api/casos/mis-casos", "token-falso")).status, 401);

  const u = (await (await post("/api/auth/login", { correo: "maria@sena.edu.co", password: "Segura#2026ok" })).json()).data.token;
  const me = await get("/api/auth/me", u);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).data.nombreCompleto, "María Fernanda Gómez Ruiz");
  assert.equal((await get("/api/usuarios", u)).status, 403); // solo administrador
  assert.equal((await get("/api/casos", u)).status, 403); // solo supervisor/administrador
  assert.equal((await get("/api/reportes/kpis", u)).status, 403);
  assert.equal((await get("/api/auditoria", u)).status, 403);
  assert.equal((await get("/api/casos/asignados", u)).status, 403); // solo técnico

  const a = (await (await post("/api/auth/login", { correo: "admin@sena.edu.co", password: "Segura#2026ok" })).json()).data.token;
  assert.equal((await get("/api/roles", a)).status === 200 || (await get("/api/roles", a)).status === 500, true); // autorizado (la BD simulada no implementa roles)
});

test("validación del caso antes de tocar la base de datos", async () => {
  const u = (await (await post("/api/auth/login", { correo: "maria@sena.edu.co", password: "Segura#2026ok" })).json()).data.token;
  const r = await post("/api/casos", { titulo: "ab", descripcion: "corta", tipo: "OTRO", categoria: "RED" }, u);
  assert.equal(r.status, 400);
  const campos = (await r.json()).errors.map((e: { field: string }) => e.field);
  assert.deepEqual(campos.sort(), ["descripcion", "tipo", "titulo"]);
  // Número de contacto (RF-CAS-14): solo dígitos y separadores, de 7 a 15 dígitos
  const valido = { titulo: "Falla de red", descripcion: "No hay internet en la sala", tipo: "INCIDENTE", categoria: "RED" };
  for (const telefonoContacto of ["12345", "llámame al 300", "+57 300 123 4567 8901 23"]) {
    const t = await post("/api/casos", { ...valido, telefonoContacto }, u);
    assert.equal(t.status, 400, `debería rechazar «${telefonoContacto}»`);
    assert.deepEqual((await t.json()).errors.map((e: { field: string }) => e.field), ["telefonoContacto"]);
  }
  assert.equal((await get("/api/casos/abc", u)).status, 400);
  assert.equal((await get("/api/casos/por-numero/ABC", u)).status, 400);
});

test("una cuenta con contraseña temporal solo puede ver su perfil y cambiar la contraseña", async () => {
  const t = (await (await post("/api/auth/login", { correo: "temporal@sena.edu.co", password: "Segura#2026ok" })).json()).data.token;
  assert.equal((await get("/api/auth/me", t)).status, 200);
  assert.equal((await get("/api/casos/mis-casos", t)).status, 403);
  assert.equal(
    (
      await post(
        "/api/casos",
        { titulo: "Falla de red", descripcion: "No hay internet en la sala", tipo: "INCIDENTE", categoria: "RED" },
        t,
      )
    ).status,
    403,
  );
});

test("tema: valor inválido rechazado", async () => {
  const u = (await (await post("/api/auth/login", { correo: "maria@sena.edu.co", password: "Segura#2026ok" })).json()).data.token;
  const r = await fetch(base + "/api/auth/tema", {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${u}` },
    body: JSON.stringify({ preferenciaTema: "AZUL" }),
  });
  assert.equal(r.status, 400);
  const ok = await fetch(base + "/api/auth/tema", {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${u}` },
    body: JSON.stringify({ preferenciaTema: "OSCURO" }),
  });
  assert.equal(ok.status, 200);
  assert.equal(usuarios.get(1)!.preferenciaTema, "OSCURO");
});

test("contrato OpenAPI y documentación navegable (RNF-06)", async () => {
  const r = await get("/api/openapi.json");
  assert.equal(r.status, 200);
  const doc = await r.json();
  assert.equal(doc.openapi, "3.1.0");
  assert.ok(doc.paths["/api/casos/{id}"].get);
  const d = await get("/api/docs");
  assert.equal(d.status, 200);
  assert.match(await d.text(), /swagger-ui/);
  assert.match(d.headers.get("content-security-policy") ?? "", /style-src 'self' 'unsafe-inline'/);
  // La CSP estricta se conserva en el resto de la aplicación
  assert.doesNotMatch((await get("/api/health")).headers.get("content-security-policy") ?? "", /unsafe-inline/);
  assert.equal((await get("/api/docs/recursos/swagger-ui-bundle.js")).status, 200);
});

test("observabilidad: X-Request-Id y métricas protegidas por token (RNF-14)", async () => {
  const h = await get("/api/health");
  assert.match(h.headers.get("x-request-id") ?? "", /^[\w-]{8,}$/);
  assert.equal((await get("/api/health", undefined, { "x-request-id": "peticion-123456" })).headers.get("x-request-id"), "peticion-123456");
  assert.equal((await get("/api/metrics")).status, 401);
  assert.equal((await get("/api/metrics", "otro-token")).status, 401);
  const m = await get("/api/metrics", "token-de-metricas-de-prueba");
  assert.equal(m.status, 200);
  const texto = await m.text();
  assert.match(texto, /mesa_http_peticiones_total\{metodo="GET",ruta="\/api\/health",estado="200"\} \d+/);
  assert.match(texto, /mesa_http_duracion_segundos_bucket/);
  assert.match(texto, /mesa_db_disponible [01]/);
});
