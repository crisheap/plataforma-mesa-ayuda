/**
 * Captcha propio sin terceros (RF-SEG-01): prueba de trabajo SHA-256.
 * El navegador pide un desafío firmado y busca un número que cumpla la dificultad; a una persona
 * le toma 1 o 2 segundos sin hacer nada, pero a un programa que prueba miles de contraseñas
 * le cuesta ese tiempo en cada intento. Se resuelve por adelantado mientras se escriben los datos.
 */
let pendiente = null;

async function resolverEnHilo(desafio, bits) {
  if (typeof Worker === "function") {
    try {
      return await new Promise((ok, mal) => {
        const w = new Worker("/js/captcha-worker.js");
        w.onmessage = ({ data }) => {
          w.terminate();
          ok(data.nonce);
        };
        w.onerror = (e) => {
          w.terminate();
          mal(e);
        };
        w.postMessage({ desafio, bits });
      });
    } catch {
      /* sin workers: se resuelve aquí mismo */
    }
  }
  const cod = new TextEncoder();
  for (let i = 0; ; i++) {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", cod.encode(`${desafio}:${i}`)));
    let n = 0;
    for (const b of h) {
      if (b === 0) {
        n += 8;
        continue;
      }
      n += Math.clz32(b) - 24;
      break;
    }
    if (n >= bits) return String(i);
  }
}

async function nuevo() {
  const r = await fetch("/api/auth/captcha", { cache: "no-store" });
  if (!r.ok) throw new Error("No se pudo preparar la verificación de seguridad");
  const { data } = await r.json();
  const vence = Number(data.desafio.split(".")[1]) || Date.now() + 60_000;
  const nonce = await resolverEnHilo(data.desafio, data.bits);
  return { desafio: data.desafio, firma: data.firma, nonce, vence };
}

/** Empieza a resolver un captcha en segundo plano (al abrir el formulario). */
export function prepararCaptcha() {
  pendiente = nuevo();
  pendiente.catch(() => {
    pendiente = null;
  });
  return pendiente;
}

/** Entrega un captcha resuelto y vigente, y deja preparado el siguiente. */
export async function tomarCaptcha() {
  let c = await (pendiente ?? prepararCaptcha()).catch(() => null);
  if (!c || c.vence - Date.now() < 10_000) c = await nuevo();
  pendiente = null;
  const { vence, ...solucion } = c;
  return solucion;
}

/** Mensaje accesible que indica el estado de la verificación. */
export function avisoCaptcha(h) {
  const el = h("p", { class: "small muted captcha-estado", role: "status" }, "🛡️ Verificando que eres una persona…");
  const listo = () => {
    el.textContent = "🛡️ Verificación de seguridad lista ✓";
    el.classList.add("ok");
  };
  const marcar = () =>
    (pendiente ?? prepararCaptcha()).then(listo, () => {
      el.textContent = "🛡️ La verificación se hará al ingresar.";
    });
  marcar();
  const reiniciar = () => {
    el.classList.remove("ok");
    el.textContent = "🛡️ Verificando que eres una persona…";
    prepararCaptcha();
    marcar();
  };
  return { el, reiniciar };
}
