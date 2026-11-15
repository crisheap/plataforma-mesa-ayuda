import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMINIO_VALIDO, clasificarCorreo, normalizarDominios } from "./correos";
import { redactarCorreoAcceso } from "./acceso";

test("tipo de correo según los dominios empresariales (RF-USU-09)", () => {
  const emp = ["sena.edu.co", "misena.edu.co"];
  assert.equal(clasificarCorreo("ana@sena.edu.co", emp), "EMPRESARIAL");
  assert.equal(clasificarCorreo("ana@regional.sena.edu.co", emp), "EMPRESARIAL", "subdominio");
  assert.equal(clasificarCorreo("ANA@MISENA.EDU.CO", emp), "EMPRESARIAL");
  assert.equal(clasificarCorreo("ana@gmail.com", emp), "PERSONAL");
  assert.equal(clasificarCorreo("ana@hotmail.com", emp), "PERSONAL");
  assert.equal(clasificarCorreo("ana@notsena.edu.co", emp), "PERSONAL", "no basta con terminar igual");
  assert.equal(clasificarCorreo("ana@sena.edu.co", []), "PERSONAL");
});

test("los dominios se normalizan y validan", () => {
  assert.deepEqual(normalizarDominios([" @SENA.edu.co", "sena.edu.co", "", "misena.edu.co "]), ["misena.edu.co", "sena.edu.co"]);
  for (const d of ["sena.edu.co", "empresa.com", "a-b.co"]) assert.ok(DOMINIO_VALIDO.test(d), d);
  for (const d of ["sena", "sena..co", "-sena.co", "sena.c", "con espacio.co"]) assert.ok(!DOMINIO_VALIDO.test(d), d);
});

test("correo de bienvenida: enlace, usuario de acceso y consejos, sin contraseña (RF-USU-10)", () => {
  const c = redactarCorreoAcceso({
    nombre: "Laura <Pérez>",
    correoAcceso: "laura@sena.edu.co",
    rol: "Usuario",
    enlace: "https://mesa.sena.edu.co/#/activar?token=abc123",
    expiraEn: new Date("2026-11-20T15:00:00Z"),
    motivo: "BIENVENIDA",
  });
  assert.match(c.asunto, /Bienvenido\(a\)/);
  for (const parte of ["laura@sena.edu.co", "https://mesa.sena.edu.co/#/activar?token=abc123", "bienvenida", "10 caracteres", "Botito"]) {
    assert.ok(c.texto.includes(parte), `el texto debe incluir «${parte}»`);
  }
  assert.doesNotMatch(c.texto, /contraseña temporal/i);
  assert.match(c.html, /Crear mi contraseña/);
  assert.match(c.html, /Laura &lt;Pérez&gt;/, "el nombre se escapa en el HTML");
  assert.doesNotMatch(c.html, /<Pérez>/);

  const r = redactarCorreoAcceso({ nombre: "Laura", correoAcceso: "l@x.co", rol: "Técnico", enlace: "https://x/#/activar?token=t", expiraEn: new Date(), motivo: "RESTABLECER" });
  assert.match(r.asunto, /Restablece tu contraseña/);
  assert.match(r.html, /Restablecer mi contraseña/);
});
