/**
 * Prueba de carga con k6 (RNF-04: p95 ≤ 3 s).
 * Ejecución:  k6 run -e BASE_URL=http://localhost:4000 -e CREDENCIALES=../credenciales.json carga/escenario.js
 * Las sesiones salen de carga/preparar.mjs: cada usuario virtual usa la suya (el límite de la API
 * es por usuario, RATE_LIMIT_API_MIN, así que no se mezclan como si fueran una sola persona).
 * PENSAR=1 agrega entre 5 y 15 s de pausa entre acciones, como una persona real (prueba de capacidad).
 */
import http from "k6/http";
import { check, group, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:4000";
const TOKENS = JSON.parse(open(__ENV.CREDENCIALES || "../credenciales.json")).tokens;
const PENSAR = __ENV.PENSAR === "1";

export const options = {
  scenarios: {
    usuarios: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "10s", target: Number(__ENV.VUS || 20) },
        { duration: __ENV.DURACION || "40s", target: Number(__ENV.VUS || 20) },
        { duration: "5s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<3000"],
    "http_req_duration{grupo:casos}": ["p(95)<3000"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  const token = TOKENS[(__VU - 1) % TOKENS.length];
  const params = (grupo) => ({ headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, tags: { grupo } });
  group("casos", () => {
    const lista = http.get(`${BASE}/api/casos/mis-casos?page=1&pageSize=10`, params("casos"));
    check(lista, { "mis casos 200": (x) => x.status === 200 });
    const items = lista.status === 200 ? lista.json("data.items") : [];
    if (items && items.length) {
      const id = items[Math.floor(Math.random() * items.length)].id;
      check(http.get(`${BASE}/api/casos/${id}`, params("casos")), { "detalle 200": (x) => x.status === 200 });
    }
  });
  group("cuenta", () => {
    check(http.get(`${BASE}/api/auth/me`, params("cuenta")), { "perfil 200": (x) => x.status === 200 });
    check(http.get(`${BASE}/api/notificaciones?page=1&pageSize=10`, params("cuenta")), { "notificaciones 200": (x) => x.status === 200 });
  });
  if (Math.random() < 0.05) {
    const nuevo = http.post(
      `${BASE}/api/casos`,
      JSON.stringify({
        titulo: "Prueba de carga: impresora",
        descripcion: "Caso creado por la prueba de carga automática.",
        tipo: "INCIDENTE",
        categoria: "HARDWARE",
      }),
      params("registro"),
    );
    check(nuevo, { "registro 201": (x) => x.status === 201 });
  }
  sleep(PENSAR ? 5 + Math.random() * 10 : 1);
}
