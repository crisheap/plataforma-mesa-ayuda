import type { CategoriaCaso, TipoCaso } from "../../generated/prisma/client";
import { NUMERO_CASO_TEXTO } from "../../core/centros";

/** Funciones puras del asistente: búsqueda, clasificación y enmascaramiento (RF-IA-03/05/07). */

export const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOP = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "de",
  "del",
  "en",
  "y",
  "o",
  "a",
  "que",
  "no",
  "me",
  "mi",
  "mis",
  "se",
  "es",
  "por",
  "para",
  "con",
  "al",
  "lo",
  "su",
  "como",
  "esta",
  "estoy",
  "tengo",
  "quiero",
  "puedo",
  "ayuda",
  "favor",
  "hola",
  "buenas",
]);
export const tokens = (t: string) =>
  normalizar(t)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));

export interface Articulo {
  id: number;
  titulo: string;
  contenido: string;
  palabrasClave: string[];
  categoria?: CategoriaCaso | null;
}

/** Puntúa cada artículo por coincidencia de palabras clave (peso 3), título (2) y contenido (1). */
export function buscarArticulos<T extends Articulo>(articulos: T[], consulta: string, max = 3): T[] {
  const q = [...new Set(tokens(consulta))];
  if (!q.length) return [];
  const puntuados = articulos.map((a) => {
    const claves = new Set(a.palabrasClave.flatMap((k) => tokens(k)));
    const titulo = new Set(tokens(a.titulo));
    const cuerpo = new Set(tokens(a.contenido));
    let p = 0;
    for (const w of q) p += (claves.has(w) ? 3 : 0) + (titulo.has(w) ? 2 : 0) + (cuerpo.has(w) ? 1 : 0);
    return { a, p };
  });
  return puntuados
    .filter((x) => x.p >= 3)
    .sort((x, y) => y.p - x.p)
    .slice(0, max)
    .map((x) => x.a);
}

/** Oculta datos sensibles antes de guardar o enviar al modelo (RNF-12, RNF-13). */
export function enmascarar(texto: string): string {
  // Los números de caso (CEET-2026-000001) se apartan antes de ocultar números largos y se devuelven intactos.
  const casos: string[] = [];
  const sinCasos = texto.replace(new RegExp(`\\b${NUMERO_CASO_TEXTO}\\b`, "g"), (m) => `\uE000${casos.push(m) - 1}\uE000`);
  return (
    sinCasos
      .replace(/\b(contrase[ñn]a|password|clave|pin|token)\b(\s*(?:es|:|=)?\s*)(\S+)/gi, "$1$2[oculto]")
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[correo]")
      // Números largos (cédulas, teléfonos)
      .replace(/\b\d[\d\s.-]{6,}\d\b/g, "[número]")
      .replace(/\uE000(\d+)\uE000/g, (_m, i) => casos[Number(i)])
  );
}

export const NUMERO_CASO = new RegExp(`\\b${NUMERO_CASO_TEXTO}\\b`, "i");
export const extraerNumeroCaso = (t: string) => t.match(NUMERO_CASO)?.[0].toUpperCase() ?? null;

export const esConsultaEstado = (t: string) => {
  const n = normalizar(t);
  return Boolean(extraerNumeroCaso(t)) || /(como va|estado de|en que va|avance|mis casos|mi caso|seguimiento)/.test(n);
};
export const quiereCrearCaso = (t: string) =>
  /(crear|abrir|registrar|reportar|levantar)\s+(un\s+|el\s+)?(caso|ticket|solicitud)|hablar con (una )?persona|soporte humano/.test(
    normalizar(t),
  );

const CATEGORIAS: [CategoriaCaso, string[]][] = [
  ["RED", ["wifi", "internet", "red", "vpn", "conexion", "router", "cable", "lenta", "navegar"]],
  ["CORREO", ["correo", "outlook", "email", "buzon", "mail", "teams"]],
  [
    "HARDWARE",
    ["impresora", "computador", "pc", "teclado", "mouse", "pantalla", "monitor", "portatil", "equipo", "disco", "cargador", "proyector"],
  ],
  [
    "SOFTWARE",
    ["office", "word", "excel", "instalar", "programa", "aplicacion", "software", "windows", "actualizacion", "licencia", "antivirus"],
  ],
  [
    "PLATAFORMAS_INSTITUCIONALES",
    ["betowa", "sofia", "plataforma", "moodle", "aula", "ingresar", "ingreso", "usuario", "contrasena", "acceso", "sena", "curso"],
  ],
];

export function clasificarProblema(texto: string): { titulo: string; tipo: TipoCaso; categoria: CategoriaCaso } {
  const ws = new Set(tokens(texto));
  let categoria: CategoriaCaso = "SOFTWARE",
    mejor = 0;
  for (const [c, claves] of CATEGORIAS) {
    const p = claves.filter((k) => ws.has(k)).length;
    if (p > mejor) {
      mejor = p;
      categoria = c;
    }
  }
  const n = normalizar(texto);
  let tipo: TipoCaso = "INCIDENTE";
  if (/(acceso|permiso|habilitar|crear (mi )?usuario|dar de alta)/.test(n)) tipo = "SOLICITUD_ACCESO";
  else if (/(mantenimiento|limpieza|revision preventiva)/.test(n)) tipo = "MANTENIMIENTO";
  else if (/(necesito|solicito|requiero|quisiera instalar|instalar)/.test(n) && !/(falla|error|no funciona|no puedo)/.test(n))
    tipo = "REQUERIMIENTO";

  const primera =
    texto
      .trim()
      .split(/[.\n!?]/)[0]
      ?.trim() ?? "";
  const base = primera.length >= 5 ? primera : "Solicitud de ayuda";
  const titulo = (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 100);
  return { titulo, tipo, categoria };
}
