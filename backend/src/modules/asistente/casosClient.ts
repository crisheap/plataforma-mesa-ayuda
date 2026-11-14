import { env } from "../../config/env";

export interface CasoResumen {
  numeroCaso: string;
  titulo: string;
  estado: string;
  prioridad: string;
  tecnico: string | null;
  sla: string | null;
  minutosRestantes: number | null;
}

type CasoApi = {
  numeroCaso: string;
  titulo: string;
  estado: string;
  prioridad: string;
  tecnico: { nombreCompleto: string } | null;
  sla?: { semaforo: string; minutosRestantes: number | null };
};
const resumir = (c: CasoApi): CasoResumen => ({
  numeroCaso: c.numeroCaso,
  titulo: c.titulo,
  estado: c.estado,
  prioridad: c.prioridad,
  tecnico: c.tecnico?.nombreCompleto ?? null,
  sla: c.sla?.semaforo ?? null,
  minutosRestantes: c.sla?.minutosRestantes ?? null,
});

async function pedir<T>(ruta: string, token: string): Promise<T | null> {
  try {
    const r = await fetch(`${env.coreApiUrl}${ruta}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    return ((await r.json()) as { data: T }).data;
  } catch {
    return null;
  }
}

/** Consulta los casos con el TOKEN DEL USUARIO: el núcleo aplica el control de propiedad (RF-IA-04). */
export async function misCasos(token: string): Promise<CasoResumen[] | null> {
  const d = await pedir<{ items: CasoApi[] }>("/api/casos/mis-casos?pageSize=5", token);
  return d ? d.items.map(resumir) : null;
}
export async function casoPorNumero(numero: string, token: string): Promise<CasoResumen | null> {
  const d = await pedir<CasoApi>(`/api/casos/por-numero/${encodeURIComponent(numero)}`, token);
  return d ? resumir(d) : null;
}
