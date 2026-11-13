import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarArticulos, clasificarProblema, enmascarar, esConsultaEstado, extraerNumeroCaso, quiereCrearCaso } from "./conocimiento";
import { ARTICULOS_INICIALES } from "./conocimiento.seed";
import { filtrarSalida, responderLocal } from "./proveedores";

const base = ARTICULOS_INICIALES.map((a, i) => ({ id: i + 1, ...a }));

test("encuentra la guía correcta", () => {
  assert.match(buscarArticulos(base, "no me funciona el wifi y el internet va lento")[0].titulo, /WiFi/);
  assert.match(buscarArticulos(base, "la impresora no imprime nada")[0].titulo, /impresora/i);
  assert.match(buscarArticulos(base, "olvidé mi contraseña")[0].titulo, /contraseña/i);
  assert.deepEqual(buscarArticulos(base, "xyzzy qwerty"), []);
});

test("enmascara datos sensibles antes de guardarlos o enviarlos", () => {
  const m = enmascarar("mi contraseña es Secreta123! y mi correo juan@sena.edu.co cédula 1234567890");
  assert.ok(!m.includes("Secreta123"));
  assert.ok(!m.includes("juan@sena"));
  assert.ok(!m.includes("1234567890"));
  assert.match(m, /\[oculto\]/);
});

test("el enmascarado conserva el número de caso para poder consultarlo", () => {
  const m = enmascarar("¿Cómo va mi caso CASO-2026-000001? mi celular es 300 123 4567");
  assert.equal(extraerNumeroCaso(m), "CASO-2026-000001");
  assert.ok(!m.includes("300 123 4567"));
});

test("detecta consultas de estado y número de caso", () => {
  assert.equal(extraerNumeroCaso("¿cómo va caso-2026-000123?"), "CASO-2026-000123");
  assert.equal(esConsultaEstado("cómo va mi caso"), true);
  assert.equal(esConsultaEstado("no puedo imprimir"), false);
  assert.equal(quiereCrearCaso("quiero crear un caso"), true);
  assert.equal(quiereCrearCaso("quiero hablar con una persona"), true);
});

test("clasifica tipo y categoría sugeridos (RF-IA-05)", () => {
  assert.deepEqual(clasificarProblema("El wifi no funciona en el piso 3. Desde ayer"), { titulo: "El wifi no funciona en el piso 3", tipo: "INCIDENTE", categoria: "RED" });
  assert.equal(clasificarProblema("Necesito acceso a la plataforma de cursos").tipo, "SOLICITUD_ACCESO");
  assert.equal(clasificarProblema("no llegan los correos a mi outlook").categoria, "CORREO");
});

test("respuesta local: guía, estado de casos y no encontrada", () => {
  const e = { nombre: "Ana Pérez", historial: [], articulos: [], casos: [], consultaEstado: false, numeroSolicitado: null as string | null };
  assert.match(responderLocal({ ...e, mensaje: "x", articulos: [base[0]] }), /Ana/);
  assert.match(responderLocal({ ...e, mensaje: "x", consultaEstado: true, casos: [{ numeroCaso: "CASO-2026-000001", titulo: "Falla", estado: "EN_PROCESO", prioridad: "ALTA", tecnico: "Luis Gómez", sla: "EN_RIESGO", minutosRestantes: 20 }] }), /CASO-2026-000001.*en proceso.*Luis Gómez/s);
  assert.match(responderLocal({ ...e, mensaje: "x", consultaEstado: true, casos: null }), /no pude consultar/);
  assert.match(responderLocal({ ...e, mensaje: "x" }), /No encontré una guía exacta/);
});

test("filtro de salida: oculta correos ajenos y secretos", () => {
  const s = filtrarSalida("Escribe a otro@sena.edu.co o a yo@sena.edu.co. La clave es abc123", "yo@sena.edu.co");
  assert.ok(s.includes("yo@sena.edu.co"));
  assert.ok(!s.includes("otro@sena"));
  assert.ok(!s.includes("abc123"));
});
