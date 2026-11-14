export const nombreCompleto = (u: { nombre: string; apellido: string }) => `${u.nombre} ${u.apellido}`.replace(/\s+/g, " ").trim();
