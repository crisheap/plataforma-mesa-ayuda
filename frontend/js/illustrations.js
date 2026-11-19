/* Ilustraciones vectoriales (SVG en línea para heredar los colores del tema). */
const NS = "http://www.w3.org/2000/svg";

export function crearSvg(markup) {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  return document.importNode(doc.documentElement, true);
}

/** Héroe: un hombre del área de tecnología (soporte con audífonos y portátil) — RF-UI-03. */
export function heroTecnico() {
  return crearSvg(`<svg xmlns="${NS}" viewBox="0 0 480 360" role="img" aria-label="Ilustración: técnico de soporte con audífonos trabajando en su portátil">
  <defs>
    <linearGradient id="gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#39A900"/><stop offset="1" stop-color="#0B8FA0"/></linearGradient>
  </defs>
  <ellipse class="an-respira" cx="240" cy="190" rx="205" ry="160" fill="var(--il-blob)" opacity=".14"/>
  <circle class="an-burbuja" cx="400" cy="70" r="46" fill="var(--il-blob)" opacity=".13"/>
  <circle class="an-burbuja an-d2" cx="70" cy="300" r="30" fill="var(--il-blob)" opacity=".13"/>
  <!-- iconos flotantes -->
  <g transform="translate(60 70)"><g class="an-flota"><path d="M0 0l34 11v22c0 20-14 34-34 41C-20 67-34 53-34 33V11z" transform="translate(34 0) scale(.78)" fill="url(#gb)"/><path d="M20 28l9 9 17-19" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g></g>
  <g transform="translate(372 150)" fill="none" stroke="var(--il-code2)" stroke-width="5" stroke-linecap="round"><g class="an-lado"><path class="an-senal an-s3" d="M0 22q22-22 44 0"/><path class="an-senal an-s2" d="M9 31q13-13 26 0"/><circle class="an-senal" cx="22" cy="40" r="3" fill="var(--il-code2)"/></g></g>
  <g transform="translate(70 195)"><g class="an-lado an-d2"><circle class="an-gira" cx="24" cy="24" r="22" fill="none" stroke="var(--il-code1)" stroke-width="7" stroke-dasharray="9 7"/><circle class="an-late" cx="24" cy="24" r="8" fill="var(--il-code1)"/></g></g>
  <g transform="translate(330 38)"><g class="an-flota an-d3"><rect width="84" height="48" rx="14" fill="var(--il-blob)" opacity=".92"/><path d="M18 48l-6 14 18-14z" fill="var(--il-blob)" opacity=".92"/><circle class="an-punto" cx="26" cy="24" r="5" fill="var(--il-accent)"/><circle class="an-punto an-p2" cx="42" cy="24" r="5" fill="var(--il-accent)"/><circle class="an-punto an-p3" cx="58" cy="24" r="5" fill="var(--il-accent)"/></g></g>
  <!-- escritorio -->
  <rect x="40" y="288" width="400" height="16" rx="8" fill="var(--il-desk)"/>
  <rect x="80" y="304" width="14" height="40" rx="4" fill="var(--il-desk)"/><rect x="386" y="304" width="14" height="40" rx="4" fill="var(--il-desk)"/>
  <!-- persona -->
  <g class="an-cabeza">
  <path d="M146 288c-4-52 22-92 74-100h40c52 8 78 48 74 100z" fill="var(--il-shirt)"/>
  <path d="M224 190l16 30 16-30z" fill="#fff" opacity=".9"/>
  <rect x="226" y="160" width="28" height="36" rx="12" fill="var(--il-skin)"/>
  <ellipse cx="240" cy="132" rx="46" ry="52" fill="var(--il-skin)"/>
  <path d="M194 128c-4-40 22-62 52-60 30 2 52 24 48 62-10-20-26-30-48-30-24 0-42 8-52 28z" fill="var(--il-hair)"/>
  <ellipse cx="194" cy="136" rx="7" ry="11" fill="var(--il-skin)"/><ellipse cx="286" cy="136" rx="7" ry="11" fill="var(--il-skin)"/>
  <path d="M190 118c0-44 24-64 50-64s50 20 50 64" fill="none" stroke="#2B3A31" stroke-width="9" stroke-linecap="round"/>
  <rect x="180" y="116" width="18" height="40" rx="9" fill="#2B3A31"/><rect x="282" y="116" width="18" height="40" rx="9" fill="#2B3A31"/>
  <path d="M190 154q6 30 38 36" fill="none" stroke="#2B3A31" stroke-width="5" stroke-linecap="round"/><circle cx="232" cy="190" r="7" fill="#2B3A31"/>
  <g fill="none" stroke="#1B1F23" stroke-width="4"><rect x="208" y="126" width="26" height="20" rx="8"/><rect x="246" y="126" width="26" height="20" rx="8"/><path d="M234 134h12"/></g>
  <g class="an-parpadea"><circle cx="221" cy="136" r="3.5" fill="#1B1F23"/><circle cx="259" cy="136" r="3.5" fill="#1B1F23"/></g>
  <path d="M222 160q18 14 36 0" fill="none" stroke="#7A3E2A" stroke-width="4.5" stroke-linecap="round"/>
  </g>
  <!-- portátil -->
  <g class="an-portatil">
  <path d="M150 288l16-64h148l16 64z" fill="var(--il-laptop)"/>
  <rect x="172" y="232" width="136" height="48" rx="5" fill="var(--il-screen)"/>
  <rect class="an-brillo" x="172" y="232" width="136" height="48" rx="5" fill="var(--il-code2)"/>
  <g stroke-linecap="round" stroke-width="5"><path class="an-codigo" d="M184 245h36" stroke="var(--il-code1)"/><path class="an-codigo an-c2" d="M184 258h60" stroke="var(--il-code2)"/><path class="an-codigo an-c3" d="M184 270h28" stroke="var(--il-code1)"/><path class="an-codigo an-c4" d="M256 245h30" stroke="var(--il-code2)"/></g>
  <rect class="an-cursor" x="218" y="265" width="3" height="10" rx="1" fill="var(--il-code1)"/>
  </g>
  <path d="M138 288h204v6a6 6 0 0 1-6 6H144a6 6 0 0 1-6-6z" fill="var(--il-laptop)"/>
  <!-- brazos -->
  <path d="M158 262c-12-6-14-24-4-34l22 4-6 26z" fill="var(--il-shirt)"/><path d="M322 262c12-6 14-24 4-34l-22 4 6 26z" fill="var(--il-shirt)"/>
  <circle class="an-tecla" cx="186" cy="266" r="11" fill="var(--il-skin)"/><circle class="an-tecla an-t2" cx="294" cy="266" r="11" fill="var(--il-skin)"/>
</svg>`);
}

const CLAVE_ANIMACION = "animacionPausada";

/**
 * Ilustración principal animada (RF-UI-03) con botón para pausar el movimiento (WCAG 2.2.2).
 * Si la persona pidió reducir el movimiento en su sistema, se muestra quieta.
 */
export function heroAnimado() {
  const caja = document.createElement("div");
  caja.className = "hero-animado";
  const svg = heroTecnico();
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "btn sm pausa-animacion";
  let pausado = false;
  try {
    pausado = localStorage.getItem(CLAVE_ANIMACION) === "1";
  } catch {
    /* sin almacenamiento: queda en movimiento */
  }
  const pintar = () => {
    caja.classList.toggle("pausado", pausado);
    boton.textContent = pausado ? "▶ Animar" : "❚❚ Pausar";
    boton.setAttribute("aria-label", pausado ? "Reanudar la animación de la ilustración" : "Pausar la animación de la ilustración");
    boton.setAttribute("aria-pressed", String(pausado));
  };
  boton.addEventListener("click", () => {
    pausado = !pausado;
    try {
      localStorage.setItem(CLAVE_ANIMACION, pausado ? "1" : "0");
    } catch {
      /* sin almacenamiento */
    }
    pintar();
  });
  pintar();
  caja.append(svg, boton);
  return caja;
}

/** Robot amigable del asistente (ícono del bot). */
export function iconoBot(tamano = 42) {
  const svg = crearSvg(`<svg xmlns="${NS}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <line x1="32" y1="8" x2="32" y2="15" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="7" r="3.5" fill="#FFD23F"/>
  <rect x="11" y="15" width="42" height="34" rx="13" fill="#fff"/>
  <rect x="5" y="26" width="6" height="12" rx="3" fill="#fff" opacity=".9"/><rect x="53" y="26" width="6" height="12" rx="3" fill="#fff" opacity=".9"/>
  <circle cx="24" cy="30" r="5" fill="#2E7D00"/><circle cx="40" cy="30" r="5" fill="#2E7D00"/><circle cx="25.6" cy="28.4" r="1.6" fill="#fff"/><circle cx="41.6" cy="28.4" r="1.6" fill="#fff"/>
  <path d="M23 39q9 8 18 0" fill="none" stroke="#2E7D00" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="17" cy="38" r="2.6" fill="#FFB3A7" opacity=".9"/><circle cx="47" cy="38" r="2.6" fill="#FFB3A7" opacity=".9"/>
  <rect x="20" y="50" width="24" height="7" rx="3.5" fill="#fff" opacity=".85"/></svg>`);
  svg.setAttribute("width", tamano);
  svg.setAttribute("height", tamano);
  return svg;
}

export function icono(nombre) {
  const t = {
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    luna: '<path d="M21 13.2A9 9 0 1 1 10.8 3a7 7 0 0 0 10.2 10.2z"/>',
    campana: '<path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
    enviar: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  };
  const svg = crearSvg(
    `<svg xmlns="${NS}" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${t[nombre] ?? ""}</svg>`,
  );
  return svg;
}
