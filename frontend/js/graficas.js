/**
 * Gráficas del dashboard (RF-ADM-06), en SVG y HTML sin librerías.
 * Respetan la CSP: nada de atributos style; los colores salen de clases (.serie-N) y
 * las medidas se aplican con CSSOM (el.style.*), que la política permite.
 */
import { h } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
export const num = new Intl.NumberFormat("es-CO");

/** Igual que h(), pero para elementos SVG. */
export function s(tag, attrs = {}, ...hijos) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  for (const c of hijos.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

// ── Tooltip compartido ──
let tip = null;
export function mostrarTip(texto, x, y) {
  if (!tip) {
    tip = h("div", { class: "viz-tip", role: "tooltip" });
    document.body.append(tip);
  }
  tip.replaceChildren(...[texto].flat().map((l) => h("div", {}, l)));
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const izq = Math.min(Math.max(8, x + 14), window.innerWidth - r.width - 8);
  const arriba = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
  tip.style.left = `${izq}px`;
  tip.style.top = `${arriba}px`;
}
export function ocultarTip() {
  if (tip) tip.hidden = true;
}
const tipEn = (el, texto) => {
  el.addEventListener("pointermove", (e) => mostrarTip(typeof texto === "function" ? texto() : texto, e.clientX, e.clientY));
  el.addEventListener("pointerleave", ocultarTip);
};

/** Muestra de color + nombre, para leyendas. */
export const muestra = (clase) => h("span", { class: `muestra ${clase}`, "aria-hidden": "true" });

export function leyenda(series) {
  return h(
    "ul",
    { class: "leyenda" },
    series.map((x) =>
      h(
        "li",
        {},
        muestra(x.clase),
        x.etiqueta,
        x.valor === undefined ? null : h("strong", {}, num.format(x.valor)),
        x.pct === undefined ? null : h("span", { class: "muted" }, `(${x.pct})`),
      ),
    ),
  );
}

/** Tabla accesible con los mismos datos de la gráfica. */
export function tablaDatos(resumen, columnas, filas) {
  return h(
    "details",
    { class: "datos" },
    h("summary", {}, "Ver los datos en tabla"),
    h(
      "div",
      { class: "table-wrap", tabindex: "0", role: "region", "aria-label": resumen },
      h(
        "table",
        {},
        h("caption", { class: "sr-only" }, resumen),
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            columnas.map((c, i) => h("th", { scope: "col", class: i ? "num" : null }, c)),
          ),
        ),
        h(
          "tbody",
          {},
          filas.map((f) =>
            h(
              "tr",
              {},
              f.map((v, i) => (i ? h("td", { class: "num" }, typeof v === "number" ? num.format(v) : v) : h("th", { scope: "row" }, v))),
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * Barra segmentada alta: un todo dividido en partes (28 px, bloques con 4 px de esquina y 2 px de separación).
 * partes: [{ etiqueta, valor, clase }]
 */
export function segmentada(partes, descripcion) {
  const total = partes.reduce((a, p) => a + p.valor, 0);
  const barra = h("div", { class: "segmentada", role: "img", "aria-label": descripcion });
  for (const p of partes) {
    if (!p.valor) continue;
    const frac = p.valor / total;
    const pct = `${Math.round(frac * 100)}%`;
    // Sin texto dentro: el blanco no alcanza contraste AA sobre todos los colores; la leyenda da el número y el %.
    const bloque = h("div", { class: `bloque ${p.clase}` });
    bloque.style.flexGrow = String(p.valor);
    tipEn(bloque, `${p.etiqueta}: ${num.format(p.valor)} (${pct})`);
    barra.append(bloque);
  }
  if (!total) barra.append(h("div", { class: "bloque vacio-seg" }));
  return barra;
}

const redondear = (max) => {
  if (max <= 4) return 4;
  const pot = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pot >= max) return m * pot;
  return 10 * pot;
};

/**
 * Gráfica de líneas con cruz de lectura y tooltip, operable con el teclado (flechas).
 * series: [{ etiqueta, clase, valores: number[] }] · etiquetas: textos del eje X.
 */
export function lineas({ series, etiquetas, descripcion }) {
  // El ancho lógico sigue al de la pantalla para que el texto conserve su tamaño real.
  const W = Math.round(Math.max(320, Math.min(560, window.innerWidth - 80))),
    H = W < 420 ? 220 : 250,
    m = { l: 34, r: 92, t: 12, b: 30 };
  const iw = W - m.l - m.r,
    ih = H - m.t - m.b;
  const n = etiquetas.length;
  const maxY = redondear(Math.max(0, ...series.flatMap((x) => x.valores)));
  const X = (i) => m.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const Y = (v) => m.t + ih - (v / maxY) * ih;

  const svg = s("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "viz-svg",
    role: "img",
    "aria-label": descripcion,
    tabindex: "0",
    focusable: "true",
  });
  // Rejilla y eje Y (recesivos)
  for (let k = 0; k <= 4; k++) {
    const v = (maxY * k) / 4;
    svg.append(
      s("line", { class: k ? "rejilla" : "eje", x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v) }),
      s("text", { class: "eje-txt", x: m.l - 6, y: Y(v) + 4, "text-anchor": "end" }, num.format(v)),
    );
  }
  // Etiquetas del eje X: unas 6, sin amontonarse
  const paso = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(iw / 70))));
  const marcasX = etiquetas.map((_, i) => i).filter((i) => i % paso === 0);
  if (marcasX.at(-1) !== n - 1) {
    if (n - 1 - (marcasX.at(-1) ?? 0) < paso / 2) marcasX.pop();
    marcasX.push(n - 1);
  }
  for (const i of marcasX) svg.append(s("text", { class: "eje-txt", x: X(i), y: H - 8, "text-anchor": "middle" }, etiquetas[i]));
  // Líneas
  for (const x of series) {
    const d = x.valores.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
    svg.append(s("path", { class: `linea ${x.clase}`, d }));
  }
  // Etiquetas directas al final, separadas si se cruzan
  const finales = series.map((x) => ({ x, y: Y(x.valores.at(-1) ?? 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < finales.length; i++) if (finales[i].y - finales[i - 1].y < 15) finales[i].y = finales[i - 1].y + 15;
  for (const f of finales)
    svg.append(s("text", { class: "etq-directa", x: X(n - 1) + 8, y: f.y + 4 }, `${f.x.etiqueta} ${num.format(f.x.valores.at(-1) ?? 0)}`));

  // Capa de lectura: cruz + marcadores
  const cruz = s("line", { class: "cruz", y1: m.t, y2: m.t + ih, visibility: "hidden" });
  const marcas = series.map((x) => s("circle", { class: `marca ${x.clase}`, r: 5, visibility: "hidden" }));
  svg.append(cruz, ...marcas);
  const zona = s("rect", { class: "zona", x: m.l - 8, y: m.t, width: iw + 16, height: ih, fill: "transparent" });
  svg.append(zona);
  let actual = n - 1;
  const ver = (i, cx, cy) => {
    actual = i;
    cruz.setAttribute("x1", X(i));
    cruz.setAttribute("x2", X(i));
    cruz.setAttribute("visibility", "visible");
    marcas.forEach((c, k) => {
      c.setAttribute("cx", X(i));
      c.setAttribute("cy", Y(series[k].valores[i]));
      c.setAttribute("visibility", "visible");
    });
    mostrarTip([etiquetas[i], ...series.map((x) => `${x.etiqueta}: ${num.format(x.valores[i])}`)], cx, cy);
  };
  const esconder = () => {
    cruz.setAttribute("visibility", "hidden");
    for (const c of marcas) c.setAttribute("visibility", "hidden");
    ocultarTip();
  };
  zona.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - m.l) / iw) * (n - 1));
    ver(Math.min(n - 1, Math.max(0, i)), e.clientX, e.clientY);
  });
  zona.addEventListener("pointerleave", esconder);
  const verTeclado = (i) => {
    const r = svg.getBoundingClientRect();
    ver(i, r.left + (X(i) / W) * r.width, r.top + (m.t / H) * r.height + 20);
  };
  svg.addEventListener("focus", () => verTeclado(actual));
  svg.addEventListener("blur", esconder);
  svg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      verTeclado(Math.min(n - 1, Math.max(0, actual + (e.key === "ArrowLeft" ? -1 : 1))));
    }
  });
  return svg;
}

/**
 * Barras horizontales apiladas, una por fila (técnicos). Todas en la misma escala.
 * filas: [{ etiqueta, total, partes: number[], extra? }] · partes: [{ etiqueta, clase }]
 */
export function apiladas(filas, partes) {
  const max = Math.max(1, ...filas.map((f) => f.total));
  return h(
    "div",
    { class: "apiladas" },
    filas.map((f) => {
      const barra = h("div", { class: "pista" });
      f.partes.forEach((v, k) => {
        if (!v) return;
        const seg = h("span", { class: `seg ${partes[k].clase}` });
        seg.style.width = `${(v / max) * 100}%`;
        tipEn(seg, `${f.etiqueta} · ${partes[k].etiqueta}: ${num.format(v)} de ${num.format(f.total)}`);
        barra.append(seg);
      });
      const resumen = `${f.etiqueta}: ${num.format(f.total)} casos; ${partes.map((p, k) => `${p.etiqueta.toLowerCase()} ${f.partes[k]}`).join(", ")}`;
      return h(
        "div",
        { class: "fila-apilada", role: "group", "aria-label": f.extra ? `${resumen}; ${f.extra}` : resumen },
        h("span", { class: "nombre" }, f.etiqueta),
        barra,
        h("strong", { class: "total" }, num.format(f.total)),
        h("span", { class: "extra" }, f.extraNodo ?? ""),
      );
    }),
  );
}
